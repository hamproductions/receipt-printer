# 印刷の信頼性調査（BLE / SPP）

deep-research ワークフロー（103エージェント、各主張を3票で反証検証）の結果。原文は英語のまま保存する。

## 要約

To print reliably to cheap 58mm ESC/POS printers (PT-210 / MPT-II class), use Bluetooth Classic SPP (RFCOMM) whenever the printer offers it. On macOS that means the OS-created /dev/cu.* node, or Web Serial in Chrome, which reaches paired SPP (0x1101) devices on desktop since Chrome 117 and on Android since Chrome 138. Treat BLE GATT (18F0/2AF1) as the fallback. Over BLE, the largest single write is ATT_MTU-3, which is 20 bytes until an MTU exchange happens. Web Bluetooth does not expose that number yet (maxWriteWithoutResponseSize is an Intent to Ship for M160). Chrome also does not queue GATT operations, so the page must await each write before sending the next. Get flow control right at two layers. On the host side, iOS CoreBluetooth silently drops data unless writes are gated on canSendWriteWithoutResponse or each with-response write is awaited. On the printer side, slow mechanisms can overflow their receive buffer even when host-side flow control is correct. One developer fixed that only by holding the rate to about 2 KB/s. Raster output uses GS v 0 at up to 48 bytes (384 dots) wide, with height in dots, and each strip prints as soon as it arrives. ESC 7 heat tuning trades speed and peak current against darkness, but it is a vendor extension documented here only for the CSN-A2. No surviving claim answered three things: macOS /dev/cu RTS/CTS or XON/XOFF behaviour, why writes block on those ports, and how strip height affects stalls.

## 検証済みの知見

- **high** (3-0 (x4)): BLE write size: the largest write-without-response payload is ATT_MTU-3, which is 20 bytes before an MTU exchange. Web Bluetooth gives pages no way to read this value today. Developers hard-code 20 bytes, guess per platform, or probe with writes that may fail or get truncated. A read-only BluetoothRemoteGATTServer.maxWriteWithoutResponseSize, plus a change event, is proposed and has a Chrome Intent to Ship for M160. Until it ships, use 20-byte (or otherwise conservative) chunks for 2AF1 writes from a web app.
  - 根拠: Merges claims 0, 1, 2 and 3, all voted 3-0. ATT_MTU-3 matches the Bluetooth Core Spec Vol 3 Part F and CoreBluetooth's maximumWriteValueLength. The Intent to Ship is dated 2026-10-20, and the spec PR whatwg/bluetooth #672 is still open. The change event may not fire on macOS CoreBluetooth, which does not report MTU changes.
  - 出典: https://github.com/mozilla/standards-positions/issues/1473, http://www.mail-archive.com/blink-dev@chromium.org/msg17805.html
- **high** (3-0 (x2)): Chrome's Web Bluetooth does not queue GATT operations. A second writeValue issued before the first settles is rejected with 'GATT operation already in progress' on Android, ChromeOS/Linux and macOS. The page must serialize writes by awaiting each writeValue or writeValueWithoutResponse promise before sending the next chunk. Chrome engineers have recommended doing this queuing in app code for the foreseeable future.
  - 根拠: Merges claims 9 and 10, both 3-0. The behaviour was observed from 2016 through 2026 bug reports, including the phomymo printer issue in 2026. The spec only says user agents MAY reject concurrent calls, so this is observed Chrome behaviour rather than a guarantee.
  - 出典: https://github.com/WebBluetoothCG/web-bluetooth/issues/188
- **medium** (3-0 (x3)): Native BLE (iOS CoreBluetooth): sending write-without-response chunks in a tight loop without checking canSendWriteWithoutResponse silently drops data. In one case, 10-20 KB raster and QR jobs came out truncated or missing on iOS 18+/26. The correct pattern is to send only while canSendWriteWithoutResponse is true and resume on peripheralIsReady(toSendWriteWithoutResponse:), or to await didWriteValueFor after each with-response write. Chunks should be capped at min(150, maximumWriteValueLength(for: type)) and no fixed delays are needed.
  - 根拠: Merges claims 4, 5 and 6, all 3-0. The source is a single primary PR that the maintainer confirmed and said will ship in 1.2.5, although the PR itself is still open. The mechanism matches Apple's documented CoreBluetooth contract. Testing covered JST-BL2D and BL1D printers, not PT-210 or MPT-II units.
  - 出典: https://github.com/andresperezmelo/print_bluetooth_thermal/pull/86
- **low** (3-0): Host-side BLE flow control does not protect the printer's own receive buffer. Mechanisms that print slower than BLE delivers, and that have no way to push back, can overflow in the middle of an image. In the one reported case (JST-BL1D, ~14 KB QR), the only fix was capping throughput at about 2 KB/s using write-with-response. Pace sends to the print speed, not only to transport readiness.
  - 根拠: Claim 7, voted 3-0 at medium verifier confidence. It is one developer's report on one model, with no measurements. The sibling JST-BL2D printed without throttling. A related claim that WebBluetoothReceiptPrinter printers use in-band pause/resume flow control was refuted 0-3.
  - 出典: https://github.com/andresperezmelo/print_bluetooth_thermal/pull/86
- **medium** (3-0): Working reference pacing for BLE: WebBluetoothReceiptPrinter's cat-printer profile (GB01/GB02/GB03/GT01/MX05/MX06, 384 dots) sends writes of at most 200 bytes with a 20 ms pause between them when no renderer is used. That is roughly 10 KB/s at most, which is a reasonable starting point to tune from for 384-dot BLE printers.
  - 根拠: Claim 8, 3-0. The verifier confirmed messageSize: 200 and sleepAfterCommand: 20 in src/main.js. These are cat printers, not ESC/POS PT-210 class devices, and a 200-byte write assumes a negotiated MTU well above 23.
  - 出典: https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter
- **high** (3-0 (x4)): Bluetooth Classic SPP path from the web: since Chrome 117 on desktop, Web Serial can open RFCOMM services on paired Classic devices. Chrome enumerates paired devices that expose the Serial Port Profile, and port.getInfo().bluetoothServiceClassId reports 00001101-0000-1000-8000-00805f9b34fb (0x1101). Non-standard RFCOMM UUIDs must be passed in allowedBluetoothServiceClassIds. Chrome 138+ on Android supports the same path, but Android WebView does not. Web Bluetooth stays BLE-only.
  - 根拠: Merges claims 11, 12, 13 and 20, all 3-0. The verifier confirmed Chrome 138 Android support from the Chrome 138 release notes and the blink-dev Intent to Ship. On Android, connect/disconnect events and SerialPort.connected are not fully supported over Bluetooth.
  - 出典: https://developer.chrome.com/blog/serial-over-bluetooth, https://github.com/whatwg/serial/blob/main/EXPLAINER_BLUETOOTH.md, https://dev.to/tukri/printing-bangla-receipts-on-a-cheap-thermal-printer-straight-from-the-browser-64o
- **high** (3-0): On macOS (and Windows), pairing an SPP printer makes the OS create device nodes (/dev/cu.* and /dev/tty.* on macOS, COM ports on Windows). Native code can write to these directly, and Chrome's Web Serial could reach them even before Chrome 117. Linux takes more effort. Printers that advertise only a non-standard RFCOMM UUID may never get an OS node, and the explainer calls the overall experience inconsistent.
  - 根拠: Claim 14, 3-0. The explainer says only 'a pair of filesystem nodes in /dev'; the cu/tty naming is standard macOS behaviour.
  - 出典: https://github.com/whatwg/serial/blob/main/EXPLAINER_BLUETOOTH.md
- **low** (3-0): Transport choice in practice: at least one print service for generic 58mm dual-mode ESC/POS printers tries paired Classic SPP first. It falls back to BLE 18F0/2AF1 only if the Classic connection fails before any print data has been sent, because a job retried after partial transmission may print twice.
  - 根拠: Claim 19, 3-0 at medium verifier confidence. The repo has 0 stars and one commit and was tested on one tablet, and its BLE path is unverified on hardware. A claim quantifying RFCOMM as about 10x faster than BLE (HP Sprocket) was refuted 0-3, so no throughput comparison survived.
  - 出典: https://github.com/sintaxerrorpvtltd/android-bluetooth-thermal-printer
- **medium** (3-0 (x2)): GS v 0 raster (1D 76 30 m xL xH yL yH d...): width is xL+xH*256 in bytes, capped at 48 for 58mm (384 dots), with the image padded to a multiple of 8 dots. Height is yL+yH*256 dots. The command prints as soon as it runs, needs no separate print or feed command, and afterwards clears the print buffer and returns to the start of the line. So a tall image can be sent as a series of GS v 0 strips, each a self-contained print unit.
  - 根拠: Merges claims 15 and 16, both 3-0, with high and medium verifier confidence. The manual is Norden Logic NL02x, not GOOJPRT firmware, although it is consistent with Epson's GS v 0 definition. Epson adds that the command takes effect only in standard mode at the start of a line. The yL/yH range printed in the manual is a typo.
  - 出典: https://download.mikroe.com/documents/datasheets/ESC-POS_commands.pdf
- **medium** (3-0 (x2)): Heat tuning with ESC 7 n1 n2 n3 (1B 37), as documented for the CSN-A2 (384 dots, 8 dots/mm). n1 is max heating dots, 8*(n1+1), default 7 = 64 dots: more dots means faster printing but higher peak current. n2 is heating time in 10 µs units, default 80 = 800 µs: longer is darker but slower, and too short can print blank. n3 is heating interval in 10 µs units, default 2 = 20 µs: longer is clearer but slower. Higher peak current is relevant to brown-outs and stalls on battery-powered printers.
  - 根拠: Merges claims 17 and 18, both 3-0. The source is the vendor's own manual. ESC 7 is a vendor extension, not standard Epson ESC/POS, and PT-210/MPT-II firmware may ignore it or interpret it differently. The manual's summary table lists only two parameters.
  - 出典: https://cdn.hackaday.io/files/1779887615038592/EF06120-A2-user%20manual.pdf

## caveats

Time-sensitive: maxWriteWithoutResponseSize is an Intent to Ship for M160 as of 2026-11-05, so advice to hard-code 20 bytes may go out of date soon. No surviving claim comes from GOOJPRT, PT-210, MPT-II or FUNFANG SDK documentation. The ESC/POS facts come from Norden Logic and CSN-A2 manuals and are extrapolated to this printer class. The iOS flow-control and buffer-overflow evidence comes from a single PR on JST printers, written with AI assistance and reproduced by nobody else. Four claims were refuted. Two matter here: the RFCOMM-vs-BLE throughput comparison, and in-band pause/resume flow control in WebBluetoothReceiptPrinter. As a result, no verified throughput numbers exist for SPP versus BLE on these printers. Several parts of the question have no verified evidence at all: macOS /dev/cu.* flow control (RTS/CTS, XON/XOFF), why writes block or stall on Bluetooth serial ports, Apple's IOBluetooth documentation, how GS v 0 strip height affects banding and stalls, and printer buffer sizes.

## openQuestions

[
 "Do macOS Bluetooth /dev/cu.* RFCOMM ports respect RTS/CTS or XON/XOFF, and is a blocking write() on them caused by RFCOMM credit-based flow control when the printer's buffer is full?",
 "What receive-buffer size and sustainable print-rate do PT-210/MPT-II class printers have? Is there a safe strip height (for example 24 vs 128 vs 255 rows) for GS v 0 that avoids mid-image stalls and banding?",
 "What is the measured throughput of SPP versus BLE (negotiated MTU, with and without response) on these specific printers, from both Chrome Web Serial/Web Bluetooth and native macOS?",
 "Do GOOJPRT/MPT-II firmwares implement ESC 7, or an alternative density command, and what are their defaults?"
]

## refuted

[
 {
  "claim": "Writes larger than the limit fail or are silently truncated depending on platform, so web apps hard-code 20-byte chunks even when links negotiate 247+ byte MTUs, costing throughput.",
  "vote": "1-2",
  "source": "https://github.com/mozilla/standards-positions/issues/1473"
 },
 {
  "claim": "These BLE printers use in-band flow control. The printer tells the driver to stop writing when its buffer is full and to resume when it has room. If the resume signal never arrives, the driver continues on its own after 30 seconds.",
  "vote": "0-3",
  "source": "https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter"
 },
 {
  "claim": "The BLE path writes to service 18F0 and characteristic 2AF1, and the final write is acknowledged (write-with-response). The BLE path was not verified on hardware because BLE connection attempts failed on the test tablet, with GATT error 133.",
  "vote": "0-3",
  "source": "https://github.com/sintaxerrorpvtltd/android-bluetooth-thermal-printer"
 },
 {
  "claim": "For a Bluetooth photo printer (HP Sprocket 200) on an M1 Mac, RFCOMM/SPP sent a ~140 KB image in 5.38 s (~25 KB/s), while BLE GATT took about 60 s for 143 KB in 500-byte chunks (~2.4 KB/s). That makes Classic RFCOMM roughly 10x faster than BLE for bulk transfer.",
  "vote": "0-3",
  "source": "https://lilting.ch/en/articles/hp-sprocket-200-rfcomm-print-speedup"
 }
]

## unverified

[]

## sources

[
 {
  "url": "https://github.com/mozilla/standards-positions/issues/1473",
  "quality": "primary",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 4
 },
 {
  "url": "http://www.mail-archive.com/blink-dev@chromium.org/msg17805.html",
  "quality": "primary",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 5
 },
 {
  "url": "https://github.com/andresperezmelo/print_bluetooth_thermal/pull/86",
  "quality": "primary",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 5
 },
 {
  "url": "https://github.com/NielsLeenheer/WebBluetoothReceiptPrinter",
  "quality": "primary",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 5
 },
 {
  "url": "https://github.com/WebBluetoothCG/web-bluetooth/issues/188",
  "quality": "primary",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 5
 },
 {
  "url": "https://github.com/sintaxerrorpvtltd/android-bluetooth-thermal-printer",
  "quality": "blog",
  "angle": "BLE GATT throughput, MTU, write-without-response",
  "claimCount": 5
 },
 {
  "url": "https://github.com/Ircama/PT-P300BT/pull/14",
  "quality": "forum",
  "angle": "macOS Bluetooth SPP serial stalls and flow control",
  "claimCount": 5
 },
 {
  "url": "https://lilting.ch/en/articles/hp-sprocket-200-rfcomm-print-speedup",
  "quality": "blog",
  "angle": "macOS Bluetooth SPP serial stalls and flow control",
  "claimCount": 4
 },
 {
  "url": "https://developer.chrome.com/blog/serial-over-bluetooth",
  "quality": "primary",
  "angle": "Web Serial over Bluetooth Classic in Chrome",
  "claimCount": 5
 },
 {
  "url": "https://github.com/whatwg/serial/blob/main/EXPLAINER_BLUETOOTH.md",
  "quality": "primary",
  "angle": "Web Serial over Bluetooth Classic in Chrome",
  "claimCount": 5
 },
 {
  "url": "https://dev.to/tukri/printing-bangla-receipts-on-a-cheap-thermal-printer-straight-from-the-browser-64o",
  "quality": "blog",
  "angle": "Web Serial over Bluetooth Classic in Chrome",
  "claimCount": 5
 },
 {
  "url": "https://download.mikroe.com/documents/datasheets/ESC-POS_commands.pdf",
  "quality": "primary",
  "angle": "ESC/POS raster GS v 0 banding and heat settings",
  "claimCount": 5
 },
 {
  "url": "https://github.com/python-escpos/python-escpos/issues/691",
  "quality": "forum",
  "angle": "ESC/POS raster GS v 0 banding and heat settings",
  "claimCount": 5
 },
 {
  "url": "https://lightrun.com/answers/python-escpos-python-escpos-garbage-after-sending-image",
  "quality": "unreliable",
  "angle": "ESC/POS raster GS v 0 banding and heat settings",
  "claimCount": 0
 },
 {
  "url": "https://cdn.hackaday.io/files/1779887615038592/EF06120-A2-user%20manual.pdf",
  "quality": "primary",
  "angle": "ESC/POS raster GS v 0 banding and heat settings",
  "claimCount": 5
 },
 {
  "url": "https://github.com/andrey-ushakov/esc_pos_bluetooth",
  "quality": "forum",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 4
 },
 {
  "url": "https://developer.apple.com/forums/thread/105110",
  "quality": "unreliable",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 0
 },
 {
  "url": "https://github.com/python-escpos/python-escpos/issues/367",
  "quality": "forum",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 5
 },
 {
  "url": "https://github.com/TimTims/Thermal_Printer",
  "quality": "blog",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 5
 },
 {
  "url": "https://gist.github.com/scruss/36c31a9b653779b2b7d1",
  "quality": "blog",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 5
 },
 {
  "url": "https://github.com/lukevp/ESC-POS-.NET/issues/227",
  "quality": "forum",
  "angle": "Developer bug reports and practitioner fixes",
  "claimCount": 5
 }
]

## stats

{
 "angles": 5,
 "sourcesFetched": 21,
 "claimsExtracted": 92,
 "claimsVerified": 25,
 "confirmed": 21,
 "killed": 4,
 "unverified": 0,
 "afterSynthesis": 10,
 "urlDupes": 0,
 "budgetDropped": 9,
 "agentCalls": 103
}
