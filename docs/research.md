# inkless 統合リサーチドキュメント

対象ハードウェアは FUNFANG Mini BT（GOOJPRT PT-210 clone）です。58mm、203dpi、384 dots、カッターなし、BLE + USB、日本語コードページなしという条件です。

印刷パイプラインは escpos-web-print v0.1.1 を使います。流れは `layoutForPrinter` → `toBitmap`（`atkinson` | `threshold`）→ `encodeBitmap`（24-row `GS v 0` strips、任意で `ESC 7`）→ `sendParts`（paced、`onProgress`、`AbortSignal`）です。

---

## 1. 結論と推奨アーキテクチャ

### 1.1 結論

- **エディタには react-konva 19 + konva 10 を使う。** シーンは1つで、ステージを2つ持つ構成にします（詳細は §1.2）。
  - Fabric 7 は Konva の約10倍重いです（22 MB unpacked、konva は 1.9 MB）。React binding が無く、JSON schema が major ごとに変わりうる点も不利です。2026年に CVE が2件出ています（下記）。
  - DOM エディタは DOM と canvas でテキストのレイアウトがずれるため、WYSIWYG にできません。
  - 純粋な自前 canvas は、hit test や transform を全部作り直すことになります。
- **設計単位は 1 design px = 1 dot（8 dots = 1mm）。** 紙幅は常に 384 px にします。
- **WYSIWYG に必須の設定は `trim:false, margin:0, rotate:0`。**
  - `layout.ts` の line 61 で `trim` の既定値が `true` になっています。`contentBox`（threshold 245）で余白を crop し、line 64 で `printWidth - 2*margin` まで拡大します（lines 61–75）。
  - その結果、40px の gutter を取ったデザインは crop されて拡大されます。QR、バーコード、pixel font は整数倍率でなくなり崩れます。
- **dither は app 側で要素ごとに行い、1-bit で合成する。**
  - ライブラリの dither はページ全体に1モード（`atkinson`/`threshold`）しかありません。
  - 写真は app 側で dither します（要素の最終 dot サイズ上で、export された `toBitmap` を使うか独自 kernel）。
  - テキスト、QR、バーコードは threshold にします。
  - 合成した純粋な 0/255 画像を `dither:'threshold'` で送れば、そのまま通過します。
  - もう一つの方法は、合成した `Bitmap`（public type: `{width,height,bytesPerRow,data}`）を `encodeBitmap` に直接渡すことです。
- **プレビューは `renderForPrinter(...).bitmap` を使う。** 実際に印刷される dot と同一になります。Worker + `OffscreenCanvas` で動かせます（`layout.ts` の `createCanvas` は `document` が無い環境では OffscreenCanvas を使います）。
- **テキストはすべて raster で印刷する。** CJK と emoji は raster で解決します（`text()` は非 ASCII を `?` にし、ハードウェアに日本語コードページはありません）。
- **差別化の軸（競合の穴）。**
  - zero-install、no-account、offline の PWA で BLE + Serial + USB に対応する。
  - 実際に印刷される bitmap と、紙の質感プレビュー（paper tint + dot gain）を見せる。
  - 豊富な dither を備える。
  - 印刷前に mm と秒の見積もりを出す。
  - share link と PNG export を用意する。
  - パロディ系テンプレートを揃える。

### 1.2 構成

1. **`<Scene doc mode>`** は `Doc` → Konva nodes の純粋 component です。サイズは 384 × `doc.height` で、要素の `type` ごとに `switch` して renderer を1つずつ割り当てます。
2. **Edit stage** には次を載せます。
   - `<Scene>`
   - overlay layer（Transformer、guides、margin lines、tear-line marker）
   - fit-to-screen の stage scale
   - 表示用には既定の `Konva.pixelRatio`（devicePixelRatio）を使います。
3. **Print stage** は hidden stage で、サイズは 384×H、中身は `<Scene mode="print">` だけです。印刷時の処理は次の順です。
   1. 各 family について `await document.fonts.load(spec, text)` を呼ぶ。
   2. `stage.toCanvas({ pixelRatio: 1 })` を呼ぶ。pixelRatio は必ず 1 にします。それ以外だと dot 数が変わります。
   3. `renderForPrinter(c, { printWidth:384, trim:false, margin:0, rotate:0, dither:'threshold' })` を呼ぶ。
   4. 送信する。
4. **"Ink preview" toggle** は、返ってきた `bitmap` を `imageSmoothingEnabled=false` でエディタに重ねます。debounce した live 更新を Worker で行います。
5. **高さの扱い。**
   - `auto` は「最下部の要素 + padBottom」です。
   - `fixed` は labels と tickets 用です。
   - landscape（tickets）は W×384 でデザインし、`rotate: 90` で印刷します。`trim:false` は維持します。
6. **状態管理** は zustand + immer + zundo `temporal` を `doc` slice にだけ適用します。selection と UI state は history に入れません。drag や typing の間は pause し、終了時に1 step として記録します。textarea エディタも同じ store に書き込み、history の timeline を1本に保ちます。
7. **送信まわり。**
   - 印刷 job は mutex で直列化します。並列の GATT 操作は失敗し、`printCanvas` を同時に呼ぶと write が混ざるためです。
   - `onProgress` で ETA を出し、`AbortSignal` で cancel できるようにします。
   - cancel の後は abort recovery を行います（§6.3）。
8. **接続。**
   - `request*Printer` は click handler の**最初**に呼びます。render 前の `await` より先です。後にすると user activation が切れて SecurityError になります。
   - chooser を閉じたときの `NotFoundError` はエラーではなく cancel として扱います。
   - `namePrefix` + localStorage の `deviceName` で chooser を事前に絞り込みます（README の recipe）。

### 1.3 ライブラリに提案する変更（inkless 側の要件）

1. `DitherMode` を拡張する。または完成済みの `Bitmap` を受け取れるようにする。
2. `Transport` に read/subscribe を追加する。BLE notify は 2af0 / `49535343-1e4d-4bd9-ba61-23c647249616` / ff01 です。
3. `getDevices()`/`getPorts()` の再接続 helper を追加する。
4. job queue を追加する。
5. abort recovery を追加する（送りかけの strip の残りを 0 で埋めてから `ESC @`）。
6. `encodeBitmap` で `maxDots`/`interval` を設定可能にする（現在は 7 と 2 に固定）。strip ごとの heat 設定も可能にする。
7. pacing を黒の被覆率に合わせて変える。thermal/battery guard を追加する。
8. BLE の write-with/without-response を選べるようにする（SDK と同じ高速経路）。
9. strip 高 48–96 rows を検証する（banding 対策、§6.4）。
10. 印刷時間の見積もり helper を追加する。
11. 細い font の最小 stroke 幅のガイドを追加する（2 dots 未満は消えます）。
12. native の text/barcode/QR builder（`ESC !` / `GS !` / `ESC a` / `GS k` / `GS ( k`）は無い。ただし QR とバーコードは raster 推奨のままで問題ありません。

---

## 2. v1 機能スコープ（fun / effort 順）

Fun は 1–5、Effort は S/M/L です。* の付いた項目は app 側で pre-dither してから `threshold` で印刷します。

v1 の範囲は「エディタ core（Konva、snap、undo、z-order、shortcuts、palette DnD）」に加えて、#1–15、#20、#22 です。

| # | 機能 | Fun | Effort | 根拠 |
|---|---|---|---|---|
| 0 | **エディタ core**：Transformer による select/drag/resize/rotate、snap、undo/redo、z-order、shortcuts、palette DnD + tap-to-add、inline text edit | – | M | 他のすべての前提 |
| 1 | **Live 1-bit preview toggle**：`renderForPrinter` の実 bitmap と paper-texture mode（paper tint + dot gain） | 5 | S | 「画面と紙が違う」問題をなくす。他のすべての機能の前提になる |
| 2 | **Dither lab***：Floyd-Steinberg、Bayer 2/4/8、halftone dots、line screen、stipple、threshold、brightness/contrast/gamma | 5 | S–M | Mini P で実績あり（約17種）。Worker 内の純粋な pixel loop |
| 3 | **Preset gallery**：concert ticket、boarding pass、CVS-length receipt parody、fortune、grocery list、todo、certificate of achievement、parking ticket、receipt of my day | 5 | M | Print Master の高評価を支えたのはテンプレート。preset = `Doc` JSON |
| 4 | **Webcam photobooth**：live dither preview、3-2-1 countdown、4-frame photostrip を縦向き（`rotate:90`）で | 5 | M | Pi photobooth 系の repo は全部これを実装している。ブラウザなら追加ハードウェアが要らない |
| 5 | **QR + barcode blocks**：URL、Wi-Fi join、vCard、Code128/EAN を threshold でくっきり | 4 | S | 既存ライブラリを使う |
| 6 | **Font picker**：JP/CJK + emoji、auto-fit text、invert（白抜き） | 4 | S | raster 前提なのでコードページ欠如を回避できる |
| 7 | **Long banner mode**：90° 回転した巨大文字、mm と秒の見積もり、progress/cancel | 5 | S | `rotate`、`onProgress`、`signal` はライブラリに既にある |
| 8 | **Receipt-parody generator**：line items、auto totals、tax、"YOU SAVED"、CVS 並みに長い coupon tail、fake barcode | 5 | S | Receiptify 型の拡散力 |
| 9 | **Printer profile**：`heatingTime`、chunk size、delay を localStorage に保存し、calibration test strip を付ける | 3 | S | 薄い印刷と buffer overflow の苦情に対応する |
| 10 | **Copies + print queue**：n 部、複数 design を queue、pause/cancel、job ごとの ETA | 4 | S | `sendParts` + `AbortSignal` |
| 11 | **Tear marks / scissor lines**：コピー間に「✂ cut here」 | 3 | S | カッターが無いことへの小さな配慮 |
| 12 | **Procedural pattern fills**：checker、waves、noise、truchet、dot gradients | 4 | S | generative で安く作れ、1-bit で映える |
| 13 | **Fortune / oracle generator**：shuffle、lucky numbers、lottery stub | 4 | S | Kortunefookie 的な魅力。純粋な text データ |
| 14 | **Share link**：scene JSON を圧縮して URL hash に入れる。receipt を PNG export | 4 | S | Mini P に export が無い穴を埋める。backend 不要 |
| 15 | **Mascot printer face**：idle、printing、paper-out のジョーク | 4 | S | Mini P の cat や Little Printer のように、キャラクター性が効く |
| 20 | **Meme maker**：Impact 風の上下テキストと定番テンプレート | 4 | S–M | brief の "memes" に対応 |
| 22 | **ASCII / pixel-art converter** | 4 | S | morningprint 的。dither の変種 |

**最も映えるデモ**は #4 photobooth strip、#7 banner、#8 CVS parody、#2 dither lab です。

**v1 で同時に入れる安全策**
- 2400 rows（30cm）超で soft warning を出す。
- 8000 rows（1m）超で hard confirmation を出す（manual は連続 1m 以上の印刷を禁止）。
- 黒被覆率が 50% 超なら警告する。
- `textTestPage` を送る "Test connection" ボタンを置く。

---

## 3. 将来の機能アイデア

| # | 機能 | Fun | Effort | 備考 |
|---|---|---|---|---|
| 16 | Sticker sheet mode：N 個の画像や emoji を grid に詰め、cut outline と die-cut media preset を付ける | 4 | M | CatPrint の media presets（label pitch）。sticker paper |
| 17 | Data blocks：weather（Open-Meteo、keyless）、date/calendar、moon phase、on this day | 4 | M | daily planner 系。client 側で fetch |
| 18 | Morning paper ritual：todo + weather + quote + mini sudoku/maze をワンクリックで | 5 | M | morningprint / Printr / Little Printer |
| 19 | Doodle pad：freehand brush + 1-bit preview + trace photo | 4 | M | Nord Little Printer revival |
| 21 | Mail-merge / batch：`{{name}}` を CSV やリストから差し込み、連番（ticket #001–050） | 3 | M | CatLabel、Print Master の Excel import。データモデルに `bindings` を用意済み |
| 23 | Poster split：大きな画像を N 本の縦 strip に分けて貼り合わせる | 4 | M | CatLabel split mode、PeriPage splicing |
| 24 | Spotify/Last.fm receipt、GitHub contribution receipt | 4 | M | OAuth が必要なので v2 |
| 25 | Generative receipts：日替わりの seeded art（flow fields、L-systems）、seed を stub に印字 | 4 | M | collectible。seed から再現できる |
| 26 | Mini games：maze、word search、bingo、crossword-lite、dot-to-dot | 4 | M | Printr の sudoku/riddles |
| 27 | Text-to-print speed mode：入力して Enter で印刷（Print Master Lite 相当） | 3 | S | |
| 28 | Paper-usage meter + history（印刷した mm、履歴から再印刷） | 3 | S | |
| 29 | Relay / share code で友人が印刷を送れる | 5 | L | backend が必要。PeriPage friends、ping、receipts.cafe。v2 |
| 30 | AI layout：自然文から scene JSON | 4 | L | CatLabel MCP（22 tools）の前例。有料 API なので v2 で opt-in |
| 31 | Agent / CI slip：build 完了時にタブ経由で印刷 | 3 | M | agentslip、GitHub issue tickets。ニッチ |
| – | Ostromoukhov variable-coefficient diffusion | – | M | stretch goal（§4） |
| – | Pseudo-grayscale：strip ごとに heat を変える | – | M | 実験的。おまけ程度（§6） |
| – | Status probe（`DLE EOT 4`）で paper 状態を表示 | – | M | notify characteristic と library の read 経路が前提 |

---

## 4. 画像処理（アルゴリズム + パラメータ）

### 4.1 ライブラリの現状

- gray 変換は BT.601 luma で、alpha は白に合成されます。
- Atkinson は左→右のみで、serpentine も pre-processing もありません。threshold の既定値は 128 です。
- 縮小は `drawImage` 1回だけで、ブラウザ既定の resampling 品質になります。bitmap は常に最終幅 384 dots で作られます。この順序は正しいです（1-bit 化した後に resize してはいけません。moiré や banding が出ます）。

### 4.2 写真パイプライン（すべて最終 dot 解像度で実行）

1. **decode と resize。** `createImageBitmap(blob,{resizeWidth,resizeQuality:'high'})` で要素の正確な dot サイズにします。半分ずつの段階縮小か Lanczos を使います（ImageMagick の thermal pipeline は Lanczos、blur 0.5）。
2. **gray 化。** `Float32Array` に BT.601 で変換します。
3. **auto-levels。** 0.5% / 99.5% percentile を clip して 0–255 に伸ばします。
4. **contrast。** S-curve か、128 を中心に linear 1.1–1.3 をかけます。
5. **unsharp mask（resize の後）。** radius 0.8–1.5 dots、amount 0.5–1.2、threshold 2–4。dither と熱による dot の広がりで甘くなるので、画面用より強めにします。
6. **gamma。** `v' = 255·(v/255)^(1/γ)` で、既定は γ = 1.8 です。
   - screaming.computer の `PRINTER_IMAGE_GAMMA = 1.8` に倣っています。印刷は画面より暗く出るためです。
   - deathandthepenguin は 2.2 で線形化した後、経験的に power 2 のほうが良いと結論しています。
   - UI には「dot gain / brightness」slider として 1.0–2.6 の範囲、既定 1.8 で出します。
7. **端の clamp。** `v > 235 → 255`（紙を白に保ち stray dot を出さない）、`v < 20 → 0`（黒をベタにする）。ハイライトの孤立 dot は形成されず、シャドウの白い穴は潰れるので、これらの階調はどのみち失われます。
8. **serpentine error diffusion** を 1:1 dots で行います。
9. **合成。** テキストとベクターは別に threshold し、OR で上に重ねます。写真の誤差がグリフの縁に漏れないようにするためです。

写真は明るめに寄せます。dot 被覆率が約 50% を超える領域や大きなベタは streak が出ます（Adafruit）。

### 4.3 Error diffusion kernel（Tanner Helland）

| Algorithm | 同じ行 | +1 行 (x−2..x+2) | +2 行 | 除数 |
|---|---|---|---|---|
| Floyd-Steinberg | 7 | 3 5 1 (x−1..x+1) | | 16 |
| Jarvis-Judice-Ninke | 7 5 | 3 5 7 5 3 | 1 3 5 3 1 | 48 |
| Stucki | 8 4 | 2 4 8 4 2 | 1 2 4 2 1 | 42 |
| Burkes | 8 4 | 2 4 8 4 2 | | 32 |
| Sierra-3 | 5 3 | 2 4 5 4 2 | 2 3 2 (x−1..x+1) | 32 |
| Two-row Sierra | 4 3 | 1 2 3 2 1 | | 16 |
| Sierra Lite | 2 | 1 1 (x−1, x) | | 4 |
| Atkinson | 1 1 | 1 1 1 (x−1..x+1) | 1 (x) | 8（誤差の 6/8 のみ拡散） |

```ts
type K = { d: number; w: [number, number, number][] }
const FS: K = { d: 16, w: [[1,0,7],[-1,1,3],[0,1,5],[1,1,1]] }
const ATK: K = { d: 8, w: [[1,0,1],[2,0,1],[-1,1,1],[0,1,1],[1,1,1],[0,2,1]] }
const STUCKI: K = { d: 42, w: [[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2],[-2,2,1],[-1,2,2],[0,2,4],[1,2,2],[2,2,1]] }

function diffuse(g: Float32Array, w: number, h: number, k: K, t = 128, serp = true) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const rev = serp && (y & 1) === 1
    for (let i = 0; i < w; i++) {
      const x = rev ? w - 1 - i : i
      const p = y * w + x
      const old = g[p]
      const v = old < t ? 0 : 255
      out[p] = v ? 0 : 1
      const e = (old - v) / k.d
      for (const [dx, dy, wt] of k.w) {
        const nx = x + (rev ? -dx : dx)
        const ny = y + dy
        if (nx >= 0 && nx < w && ny < h) g[ny * w + nx] += e * wt
      }
    }
  }
  return out
}
```

- serpentine にすると、平坦なグレーでの FS の worm artifact がほぼ消えます（libcaca study）。累積値は −64..320 に clamp すると階調が安定します。
- **使い分け。**
  - **Atkinson**：image、meme、logo、retro の既定。誤差の 25% を捨てるのでハイライトとシャドウが clip されます。どのみち失われる階調なので thermal に合い、高コントラストでエッジが立ちます。
  - **FS serpentine**：写真の既定。グラデーションが最も良く、screaming.computer は ordered より FS を推しています。
  - **Stucki / JJN**：smooth 枠。worm は少ないがぼけます。顔には不向きで、空や大きなグラデーション向きです。deathandthepenguin は JJN を選んでいます。
  - **Ostromoukhov**：強度に応じて係数が変わり、256-entry の表を使います。serpentine 前提で worm が消えます。stretch goal です。
- **性能。** 384×2000 は約 0.77 MP で、JS で数 ms です。slider に連動する live preview は Worker で回します。

### 4.4 Ordered、blue-noise、halftone（pixel ごとに独立。並列化しやすく、動かしても crawl しない）

**Bayer**

```ts
function bayer(n: number): number[] {
  if (n === 1) return [0]
  const m = bayer(n / 2), s = n / 2, r = new Array(n * n)
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    const v = 4 * m[y * s + x]
    r[y*n+x] = v; r[y*n+x+s] = v + 2; r[(y+s)*n+x] = v + 3; r[(y+s)*n+x+s] = v + 1
  }
  return r
}
const B = bayer(8)
const black = g[p] < ((B[(y & 7) * 8 + (x & 7)] + 0.5) / 64) * 255
```

50% の checkerboard は dot gain に最も弱く、濃いグレーに潰れます。γ ≥ 2 にするか、chunky な 4×4 を使います。

**Blue noise（void-and-cluster）**
- 方法は Ulichney, SPIE 1913, 1993 です。
- 64×64 か 128×128 の行列を tile して threshold します：`black = g < M[(y&63)*64+(x&63)]`。
- 行列はオフラインで一度だけ生成し、4 KB の `Uint8Array` として埋め込みます。
- 有機的な粒状感で、細部は FS 並み、やや粒が粗いです。stickers と写真向きです。
- ⚠️ momentsingraphics.de の texture は、同梱前にライセンスを確認する必要があります。

**Clustered-dot AM halftone**
- 安い紙で dot gain に最も強い方式です。
- cell 4–6 dots、45° で、203dpi なら約 34–50 lpi です。
- `g` は box blur（radius cell/2）をかけた copy からサンプルし、dot が割れないようにします。

```ts
function halftone(g: Float32Array, w: number, h: number, cell = 5, angle = Math.PI / 4) {
  const c = Math.cos(angle), s = Math.sin(angle), out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x * c + y * s) / cell, v = (-x * s + y * c) / cell
    const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5
    const dark = 1 - g[y * w + x] / 255
    out[y * w + x] = Math.hypot(fu, fv) < Math.sqrt(dark / Math.PI) ? 1 : 0
  }
  return out
}
```

**Line screen（engraving / banknote 風）**
- period は 4–6 dots です。
- wavy にするなら `phase += amp*sin(y/λ)`、同心円なら `phase = hypot(x-cx, y-cy)/period` にします。

```ts
const phase = (x * c + y * s) / period
out[p] = Math.abs(phase - Math.floor(phase) - 0.5) * 2 < dark ? 1 : 0
```

### 4.5 Preset mode の既定値

| Mode | 既定 |
|---|---|
| Photo | FS serpentine、γ 1.8、unsharp 1.0 px / 0.8 |
| Comic / meme | Atkinson、γ 1.4、contrast 1.3 |
| Newspaper | clustered dot、cell 5、45° |
| Engraving | line screen、period 5、30° |
| Grain | blue noise、γ 2.0 |
| Retro | Bayer 4×4 |
| Line art | threshold |

データモデルの `ImageEl.dither` は今 `'atkinson'|'threshold'|'halftone'` だけです。上の mode 一覧に合わせて enum を拡張する必要があります。

### 4.6 テキストとベクター

- Canvas 2D にはテキストの AA を切る手段も hinting の制御もありません。`imageSmoothingEnabled` は画像にしか効きません。`{alpha:false}` は LCD subpixel AA を有効にする場合があります（W3C bug 23516）。対策は「描いてから threshold」です。
- 1 canvas px = 1 dot の透明 canvas に描きます。`devicePixelRatio` は使わず、後から scale しません。
- x と baseline は整数 dot に snap し、`textBaseline='alphabetic'` を使います。
- threshold は alpha か luminance で、diffusion は使いません。
  - T ≈ 96–128（0–255）はやや太くなり、細い font に向きます。
  - T ≈ 160 以上は font に忠実ですが、hairline が切れることがあります。
  - UI では "Weight" として出します。
  - ライブラリの `BitmapOptions.threshold` の doc は、AA テキストを太らせるなら luminance で約 200 を推しています。
- サイズ（8 dots/mm）。
  - 最小可読 cap height は約 14 dots（1.75mm）。
  - 快適な body サイズは 20–28 px。
  - stem と hairline は 2 dots 以上。1-dot の縦線は熱で滲んで薄く、1-dot の横線が最も弱いです。
  - 約 24 px 未満で ultra-thin weight や serif の hairline を使わない。
- pixel font は native サイズの整数倍で描いてから threshold します。
- テキストを error diffuse してはいけません。合成は OR で行い、写真の上では任意で 1-dot の白 knock-out outline（mask を dilate）を付けます。
- QR とバーコード。
  - threshold を使う。
  - module は整数 dot。thermal の QR は ≥3 dots、推奨 4–8。
  - 描画後に scale しない。`imageSmoothingEnabled=false`。
  - JsBarcode の `width` は 2–3 dots。

### 4.7 Dot-gain キャリブレーション

- 17 patch の step wedge（0, 16, …, 255）を選択中の dither で印刷します。ユーザーが「ちょうどグレーに見える最初の patch」と「黒に見える最初の patch」を選び、γ を fit します。
- 精密版は patch ごとに測定して逆 LUT を作ります。オフセット印刷の TVI 補正と同じ考え方で、5% gain なら 50% を 45% で出力します。LUT は printer × paper ごとに保存します。

### 4.8 大きなベタ対策

- "save heat" option で、一定サイズ以上のベタを 85–90% の texture（細かい blue noise）に置き換えます。
- 平坦部の worm は serpentine、blue noise、threshold への ±4 の noise 加算で消します。

---

## 5. フォント

### 5.0 前提

- pixel font を `trim:true` で非整数倍率に resample すると潰れます。`trim:false, margin:0` が必須です。
- テキストと pixel レイヤーは `threshold`（約 128–160）にします。Atkinson は glyph の縁に speckle を出します（README line 194：atkinson は photos/logos 用、threshold は line art 用）。
- **`ctx.font` の family 名は quote が必須です。** `Press Start 2P`、`Jersey 10`、`DotGothic16`、`Micro 5` のように数字 token を含む名前を quote しないと無効になり、エラーも出ずに前の font のまま描かれます。
- Canvas 2D には `fontVariationSettings` がありません。届くのは `wght`（`ctx.font` の weight）と `wdth`（`fontStretch`）だけです。
  - 次の custom axis は default で固定されます：Tiny5（BLED/JITT/ROND）、Sixtyfour/Workbench（BLED/SCAN）、Doto（ROND）、Handjet（ELGR/ELSH）、Bitcount（ELSH/ELXP/CRSV）。
  - 使う場合は build 時に `fontTools.varLib.instancer` で static instance を作ります。
- Receipt の基準グリッド。Font A は 12×24 dots で 384 dots に 32 cols、Font B は約 9×17 で 42 cols です。monospace のサイズは `advance_dots / advance_em` で決めます。`advance_em` は Google Fonts の実ファイルを fontTools で測った値です。
- ⚠️ **最小 px は報告者の経験則で、出典はありません。** 基準は x-height ≥ 約 8 dots、stem ≥ 2 dots、漢字 ≥ 16 dots です。実機で確認が必要です。
- 確認方法：
  - license は google/fonts repo の `ofl/` か `apache/` の `METADATA.pb` が HTTP 200 になること。
  - GF 掲載は css2 API が 200 を返すこと。
  - JP は metadata に `japanese` subset があること。

### 5.1 Receipt monospace

| Font | License | GF | JP | 実測 | 最小 px | Columns |
|---|---|---|---|---|---|---|
| VT323 | OFL | ✓ | – | pixel step 40/1000 → native em 25px、cap 14、x-height 10 | 25（native）→ 50 | 25px で advance 10 dots、38 cols |
| Space Mono | OFL | ✓ | – | x-height .496、advance .612 | 16 | 19.6px で 32 cols、15px で 42 |
| IBM Plex Mono | OFL | ✓ | –（Cyrillic のみ） | x-height .516、advance .600、static 100–700 | 16（weight ≥500） | 20px で 32、15px で 42 |
| JetBrains Mono | OFL | ✓ | – | x-height .55、wght 100–800 | 15 | 20px で 32 |
| Courier Prime | OFL | ✓ | – | x-height .451、stroke が細い | 18（700 推奨） | 20px で 32 |
| Share Tech Mono | OFL | ✓ | – | advance .54 | 18 | 22px で 32 |
| M PLUS 1 Code | OFL | ✓ | **✓** | x-height .52、advance .5、wght 100–700 | 20（weight 500）、漢字 ≥20 | 24px で 32 cols（漢字 16） |

### 5.2 Pixel / bitmap（native em の整数倍だけがくっきり出る）

| Font | License | GF | JP | Native em（1 font px = 1 dot） | Cap | 備考 |
|---|---|---|---|---|---|---|
| Press Start 2P | OFL | ✓ | – | **8px**（step 125/1000） | 7 | 8 か 16。16px で advance 16 dots、24 cols |
| Silkscreen | OFL | ✓ | – | **8px**（step 125） | 5（small-caps 風） | 400/700。16px で advance 12 dots、**ちょうど 32 cols** |
| Pixelify Sans | OFL | ✓ | – | 約 11px（step 90–92 で不正確、variable wght） | 7 | outline 扱い。min 14、best 22 |
| DotGothic16 | OFL | ✓ | **✓** | **16px**（step 62.5） | 13 | 16 か 32。かな・漢字は 16。半角 48 cols、漢字 24 |
| Jersey 10 | OFL | ✓ | – | 18.667px（75/1400） | 10 | 18.667 / 37.333（小数 px で可） |
| Jersey 15 | OFL | ✓ | – | 27px（50/1350） | 15 | |
| Micro 5 | OFL | ✓ | – | 11px（150/1650） | 5 | 極小文字のギャグ用 |
| Tiny5 | OFL | ✓ | – | 8px（128/1024） | 5 | custom axis 不可 |
| Sixtyfour | OFL | ✓ | – | 8px（128/1024）、C64 風 | 7 | advance は Press Start 2P と同じ |
| Handjet | OFL | ✓ | – | 約 17px（480/8160） | 11 | element-grid display |
| Doto | OFL | ✓ | – | dot matrix、約 100-unit grid | 約 6.5 | dot を分離させるには min 約 20 |
| Bitcount Grid Double | OFL | ✓ | – | 約 10px | 6 | |
| PixelMplus10 / 12 | M+ FONT LICENSE | **✗**（self-host） | **✓** JIS 第1+2水準 + Latin-1 | 10 / 12px | | TTF outline、Regular/Bold。github.com/itouhiro/PixelMplus |
| k8x12（k8x12L / k8x12S） | littlelimit free license | ✗ | **✓** JIS 第1+2水準 | 8×12 cell | | TTF outline。L はかなが縦長、S は非漢字 8-dot で濁点が上がる |
| Misaki 美咲 | littlelimit free license | ✗ | **✓** JIS 第1+2水準 | 8×8 cell（glyph は 7×7） | | TTF outline + embedded bitmap。8 か 16 |
| Unifont JP（`unifont_jp`） | GPLv2+ with font embedding exception / **OFL 1.1** の dual | ✗ | **✓** plane 0 + upper planes、JIS X 0213 全体、約 59k glyphs | 8 か 16 幅 × 16 高 | | v18.0.01、OTF のみ。大きいので最後の fallback 専用 |

- littlelimit license の文言は "Unlimited permission is granted to use, copy, and distribute them, with or without modification, either commercially or noncommercially." です。OFL ではありません。woff2 変換への言及はありませんが、modification が許可されているので可と解釈できます。
- M+ FONT LICENSE も同様の自由な文言です。

### 5.3 Display

| Font | License | GF | JP | 実測 | 最小 px |
|---|---|---|---|---|---|
| Bebas Neue | OFL | ✓ | – | caps only、cap .70 | 16 |
| Archivo Black | OFL | ✓ | – | x-height .528 | 16 |
| Rubik Mono One | OFL | ✓ | – | caps、.70 | 14 |
| Bungee | OFL | ✓ | – | x-height .5（caps style） | 16 |
| Monoton | OFL | ✓ | – | 多重の inline stroke | **≥48**（それ未満は細線が消える） |
| Shrikhand | OFL | ✓ | – | x-height .52 | 18 |
| Major Mono Display | OFL | ✓ | – | x-height .696 | 16 |
| Rubik Glitch | OFL | ✓ | – | distressed | 32 |

### 5.4 Handwriting

| Font | License | GF | JP | 最小 px |
|---|---|---|---|---|
| Caveat | OFL | ✓ | – | x-height .40 → 20（wght 600–700） |
| Permanent Marker | **Apache 2.0** | ✓ | – | x-height .61 → 14 |
| Gochi Hand | OFL | ✓ | – | 18 |
| Rock Salt | **Apache 2.0** | ✓ | – | 20 |
| Klee One | OFL | ✓ | **✓** | 24（weight 600、ペン先が細い） |
| Hachi Maru Pop | OFL | ✓ | **✓** | 24 |
| Yomogi | OFL | ✓ | **✓** | 22 |

### 5.5 Japanese（すべて GF、`japanese` subset あり）

| Font | License | Weights | 最小 px（thermal での漢字可読性） |
|---|---|---|---|
| Noto Sans JP | OFL | wght 100–900 | 20（≥500）。汎用 fallback |
| BIZ UDGothic / BIZ UDPGothic（proportional） | OFL | 400/700 | 20 |
| Zen Kaku Gothic New | OFL | 300–900 | 20（≥500） |
| Zen Maru Gothic | OFL | 300–900 | 20 |
| **Kosugi Maru** | **Apache 2.0** | 400 のみ | 20 |
| Yusei Magic | OFL | 400 | 22（marker 風） |
| Dela Gothic One | OFL | 400（ultra-heavy） | 24（これ未満では複雑な漢字の counter が潰れる） |
| Reggae One / RocknRoll One / Rampart One / Train One / Stick | OFL | 400 | 24（Rampart と Train は outline/inline style なので ≥32） |
| Mochiy Pop One | OFL | 400 | 22 |
| Kiwi Maru | OFL | 300–500 | 20 |
| Kaisei Decol | OFL | 400–700 | 22 |
| M PLUS Rounded 1c | OFL | 100–900 | 20 |

**License の注意点**
- Kosugi Maru、Permanent Marker、Rock Salt は Apache 2.0 です。自由に再配布できますが、「OFL のみ」という方針なら除外が必要です。
- PixelMplus、k8x12、Misaki、Unifont は GF に無いので self-host のみです。

### 5.6 v1 の curated 16 書体（すべて GF かつ `@fontsource/*` が registry.npmjs.org で 200）

1. VT323：terminal receipt
2. IBM Plex Mono：modern receipt、本物の bold がある
3. Courier Prime：typewriter / POS
4. Press Start 2P：arcade
5. Silkscreen：16px でちょうど 32 cols
6. Pixelify Sans：friendly pixel
7. Jersey 10：sporty pixel
8. Bebas Neue：condensed headline
9. Archivo Black：heavy grotesk
10. Bungee：signage
11. Caveat：handwritten
12. Permanent Marker（Apache）：meme
13. DotGothic16：JP pixel、16-dot native
14. M PLUS 1 Code：JP mono receipt
15. Dela Gothic One：JP heavy display
16. Zen Maru Gothic：JP rounded body

**Fun pack（lazy-load）**
- Latin：Monoton、Rubik Mono One、Sixtyfour、Micro 5、Handjet、Doto、Shrikhand。
- JP：Yusei Magic、Reggae One、RocknRoll One、Klee One、Hachi Maru Pop。
- self-host woff2：k8x12、PixelMplus12、Misaki。
- Fallback：JP 全般に Noto Sans JP、稀な漢字と記号に Unifont JP（オンデマンド）。

### 5.7 Pairing presets（単位は dots、heading / body / accent）

| Preset | Heading | Body | Accent |
|---|---|---|---|
| Classic Receipt | Archivo Black 32 | IBM Plex Mono 20 @600（32 cols） | VT323 25（totals） |
| Arcade Ticket | Press Start 2P 16 | Silkscreen 16（32 cols） | Jersey 10 @37.333（score） |
| Terminal | VT323 50 | VT323 25（38 cols） | Sixtyfour 8（footer） |
| Gig Poster | Bebas Neue 64 | Space Mono 16 | Monoton 64（band name） |
| Typewriter Memo | Courier Prime 28 @700 | Courier Prime 20 | Caveat 28（署名） |
| Todo / Sticky | Permanent Marker 32 | Caveat 24 @700 | Bungee 16（checkbox と label） |
| Meme | Archivo Black 48。白文字 + 8-dot の黒 stroke（`strokeText` → `fillText`） | – | Permanent Marker（caption） |
| Signage / Label | Bungee 40 | Rubik Mono One 16 | – |
| 日本のレシート | Dela Gothic One 32 | M PLUS 1 Code 24 @500 | DotGothic16 16（品目行） |
| ドット | DotGothic16 32 | k8x12 12 / 24 | Misaki 8（細則） |
| 手書きメモ | Yusei Magic 32 | Zen Maru Gothic 22 @500 | Hachi Maru Pop 24 |
| Mixed JP/EN | `"Bebas Neue", "Dela Gothic One"` 48 | `"IBM Plex Mono", "M PLUS 1 Code"` 20 | – |

Mixed は `ctx.font` の family list による glyph ごとの fallback に依存します。テキストを両方の family で load しておく必要があります。

### 5.8 Font loading

- `document.fonts.load(font, text)` は `text`（既定 `" "`）を含む `unicode-range` を持つ face だけを load します。どれかの face が失敗すると reject し、font 文字列が不正なら SyntaxError を投げます。
- GF の JP font は細かく slice されています。1 weight あたり Noto Sans JP 124、DotGothic16 123、Dela Gothic One 123、M PLUS 1 Code 119 の `@font-face` があります。**要素の実際の文字列を渡さないと漢字の slice は落ちてきません。**
- `check()` は一致する face が無いと true を返すので、typo を検出できません。`load()` が返す配列が空なら一致なしと判定します。⚠️ この「空配列で resolve する」挙動は spec からの解釈で、spec に明記はありません。
- load 前に canvas に描くと、エラーなしで fallback font が使われます。必ず await してから描き、load 後に再描画します。
- Worker の `OffscreenCanvas` は別の `FontFaceSet` である `self.fonts` を使うので、そちらにも `FontFace` で追加が必要です（Baseline widely available）。

```ts
const spec = (f: { family: string; weight: number; size: number }) =>
  `${f.weight} ${f.size}px "${f.family}"`;

export async function ensureFonts(items: { family: string; weight: number; size: number; text: string }[]) {
  const missing: string[] = [];
  await Promise.all(items.map(async (it) => {
    const faces = await document.fonts.load(spec(it), it.text || ' ');
    if (faces.length === 0) missing.push(it.family);
  }));
  return missing;
}

export async function addSelfHosted(family: string, url: string, descriptors?: FontFaceDescriptors) {
  const face = new FontFace(family, `url(${url}) format("woff2")`, descriptors);
  await face.load();
  document.fonts.add(face);
  return face;
}
```

**手順**
1. boot 時に `await document.fonts.ready`。
2. render と print の前に全テキスト要素で `ensureFonts` を呼ぶ。テキスト編集のたびに debounce して再実行する（新しい漢字は新しい slice を必要とするため）。
3. 座標は整数 x/y、pixel font は native の整数倍で描く。
4. text-only の receipt は `printCanvas(..., {trim:false, margin:0, dither:'threshold'})`。

**Bundling**
- `@fontsource/<name>` は `unicode-range` slice を保持するので、同じ `load(spec, text)` 方式がそのまま使えます。
- k8x12、Misaki、PixelMplus は `pyftsubset --flavor=woff2` で woff2 に変換し、選択されたときだけ lazy-load します。
- Unifont JP はオンデマンドで load します。

---

## 6. プリンター設定とキャリブレーション

### 6.1 API（escpos-web-print v0.1.1、全 11 `src/*.ts`、1,301 lines）

```ts
requestBluetoothPrinter(o?: { namePrefix?; acceptAllDevices?; services?: PrinterService[]; maxChunkSize? /*182*/; onDisconnect? }): Promise<Transport>
requestSerialPrinter(o?: { baudRate? /*9600, ignored by SPP/CDC*/; filters?; maxChunkSize? /*512*/; onDisconnect? })
requestUsbPrinter(o?: { filters? /*[{classCode: USB_PRINTER_CLASS}]*/; maxChunkSize? /*512*/; onDisconnect? })
isBluetoothSupported() / isSerialSupported() / isUsbSupported()
printCanvas(t, src, o?: PrintOptions): Promise<Uint8Array[]>
renderForPrinter(src, o?) => { canvas, bitmap, parts }
layoutForPrinter(src, { printWidth=384, rotate=0|90|180|270, trim=true, trimThreshold=245, margin=0, paddingBefore=0, paddingAfter=0 })
canvasToBitmap(canvas, { dither='atkinson'|'threshold', threshold=128 }) / toBitmap(imageDataLike, same)
encodeBitmap(bitmap, { stripHeight=24, heatingTime?, feedAfter=0, cut='none' }) => Uint8Array[]
sendParts(t, parts, { chunkSize<=t.maxChunkSize, chunkDelay=40, partDelay=50, flushDelay=300, signal?, onProgress?(sent,total) })
raw: initialize() ESC @, heating(time, maxDots=7, interval=2) ESC 7, rasterImage(bitmap, top, rows) GS v 0,
     feedDots(n) ESC J, feedLines(n) ESC d, cut(mode, feed) GS V, text(ascii), concat(parts)
utils: mmToDots, dotsToMm, DEFAULT_DPI=203, PAPER_WIDTH{'58mm':384,'80mm':576}, textTestPage(lines?), toHex
Transport = { label, deviceName, maxChunkSize, write(chunk), close() }
Bitmap = { width, height, bytesPerRow, data }
```

### 6.2 制約

- **ブラウザ。**
  - Chrome と Edge のみで、secure context（HTTPS か localhost）が必要です。
  - Web Bluetooth は desktop と Android Chrome で動きます。Linux では `#experimental-web-platform-features` が必要です。
  - Safari、Firefox、iOS は非対応で、Web Serial は desktop のみです。
- **再接続。**
  - Web Bluetooth の `getDevices()` は、確認できた最新情報（Chrome 131 の issue）時点で `#enable-web-bluetooth-new-permissions-backend` がまだ必要です。
  - Web Serial の `getPorts()` と WebUSB の `getDevices()` は flag なしで動きますが、ライブラリは使っていません。
- **BLE。**
  - ライブラリは 18f0/2af1 を最初に試します。ユーザーの FUNFANG は 18f0/2af1 でしか印刷できませんでした。
  - characteristic が対応していれば write-with-response を使い、chunk は ≤182 B です。23-byte MTU の adapter では 20 B にします。
  - PT-210 SDK の挙動：
    - write-without-response を使う。
    - plain chunk 182 B、raster chunk 192 B。
    - chunk 間 40 ms、strip の後に `max(50ms, rows×2ms)`。
    - 237-byte payload を negotiate した個体がある。
- **スループット。**
  - pacing は約 182 B / 40 ms + 24-row strip ごとに 50 ms です。
  - 384×800（約 38 KB）で約 10 s / 100mm、1000 rows（125mm、約 48 KB）で約 13 s です。
  - motor は 70 mm/s、仕様は 50–80 mm/s なので、律速は BLE です。
  - 見積もり式：`(height×48/182)×40ms + (height/24)×50ms`。長さは `height/8` mm です。
  - 別の近似式：`rows/1000×13 s × densityFactor`。
  - 1m（8000 rows）で約 105 s 以上、加えて dense な内容では stall が出ます。
- **ハードウェア（MPT-II spec / manual）。**
  - bitmap は最大 40 KB、合計 64 KB です。24-row strip は 1,152 B なので問題ありません。
  - 連続 1m 以上は印刷しないこと（manual）。
  - 高温状態では error LED が点滅します。paper-out、low-battery、cover-open の sensor があります。
  - battery は 7.4 V 1500 mAh で、6.8 V 未満で buzzer が鳴ります。battery 寿命の仕様は黒被覆率約 12.5% を前提にしています。
  - receive buffer は約 5 KB（約 100 rows × 48 B）と listing に記載されています。
  - カッターは無いので `cut` は no-op です。tear bar は head より数 mm 先にあり、`paddingAfter` は約 96 dots（12mm）を目安に calibrate します。
- **紙長。** ⚠️ 報告者の推定です。最大径 40mm、core 約 12mm、紙厚約 55–60 µm として `π(20²−6²)/0.06` ≈ 19 m です。spec の 0.12mm は最大厚で、1 ロールあたりの長さの公表値はありません。
- **熱。** ⚠️ PT-210 の過熱 cutoff を記した資料はありません（Unknown）。
- **メモリ。** 384×8000 の RGBA scratch は約 12 MB で問題ありません。Worker で行ごとに dither し、24/48-row strip を stream すれば、処理の完了前に印刷を始められます。

### 6.3 Failure modes

| 症状 | 原因 | App の対処 |
|---|---|---|
| 接続でき紙も送られるが何も印刷されない | characteristic 違い、紙が裏向き、battery 切れ | wizard で scratch test、`services` override |
| 文字化け、途中で停止 | buffer overrun（行ずれや欠落になり、band にはならない） | chunk を 182 → 100 → 20 に下げ、delay を上げる。Adafruit は約 30 ms/raster line（`dotPrintTime=30000`） |
| Cancel や切断の後に文字化け | `sendParts` が chunk の途中で abort し、printer が `GS v 0` の宣言バイトを待ったまま次の job（`ESC @` 含む）を pixel として食う。ライブラリは未対応 | abort 後に現在の strip の残りを 0 bytes で埋める（`onProgress` と part 境界から計算）→ `ESC @` |
| BLE が job の途中で切れる | `write` が NetworkError、切断後は GATT handle が無効 | 再接続を促し、resume はせず再印刷 |
| ベタで薄い、途中で reset | heat 不足、同時加熱 dot が多すぎて battery が sag | `heatingTime` を上げる。battery-safe では `maxDots` を下げる（custom encode が必要） |
| ベタに斑点 | QR203 の事例では緩んだ connector だった | `GS v 0` はそのまま使う |
| 日本語が `?` になる | code page が無い | raster テキスト |
| 印刷の末尾が本体内に残る | tear bar が head の先にある | `paddingAfter` を calibrate |

### 6.4 Banding の原因と対策

1. **Data underrun（BLE で最も起きやすい）。** head が止まって冷え、白や薄い線が出ます。Epson の特許 US10857809 が raster segment 間のこの現象を説明し、数行 buffer して対処しています。Pi-Print も送信が遅いと white lines が出たと報告しています。
   - 対策：buffer を満たしてから head を動かす。MTU と chunk を最大にする。write-with-response のときに strip 後の 50 ms が本当に必要か検証する。
   - ⚠️ **ライブラリのリスク：24 rows ごとの stall で約 3mm 周期の band が出る可能性があります。** 48–96-row strip（1 block 約 4.5 KB 未満）を試すべきです。
2. **Overflow** は band ではなく、行の化けやずれになります（§6.3）。
3. **Power sag。** dense な行は heat step と電流が増えて battery 電圧が下がり、薄くなります。n1 を下げる、n3 を上げる、充電する、USB 給電にする、で対処します。
4. **Thermal history。** 長い濃い部分で head が温まり、後の行が濃くなって streak が出ます。ベタは被覆率約 50% 未満に抑え、"save heat" を使います。
5. **Dither 構造。** raster FS の worm と平坦部の Bayer の縞は、serpentine、blue noise、±4 noise で対処します。
6. **機械的な周期。** platen や gear の跡は heat を上げる以外に対処できません。
7. **1-bit 化した後の resize。** moiré の原因になるので、dither は常に最後に 384 dots ちょうどで行います。

### 6.5 `ESC 7 n1 n2 n3`（PT-210 class、CSN-A2 manual / Adafruit_Thermal.cpp）

| Param | 意味 | 単位 | 既定 | 増やすと |
|---|---|---|---|---|
| n1 | 同時加熱 dot 数 = 8·(n1+1) | 8 dots 単位 | 7（64 dots） | peak 電流が増え、速くなる |
| n2 | 加熱時間 | 10 µs（範囲 3–255） | 80（800 µs） | 濃く遅くなる。stiction（紙の張り付き） |
| n3 | 加熱間隔 | 10 µs | 2（20 µs） | 鮮明に遅くなる。電源が回復する |

- ライブラリの `heating(time, maxDots=7, interval=2)` は `[ESC,'7',maxDots,time,interval]` を送ります。CSN-A2 と同じ正しい順序です。
- **Line time モデル。** `steps = ceil(blackDots/(8·(n1+1)))`、`t_line ≈ steps·(n2+n3)·10µs` + motor 時間です。既定値ではベタ1行が 6 × 820 µs ≈ 4.9 ms で、8 lines/mm なので約 25 mm/s になります（テキストの spec は 50–80 mm/s）。
- **他所での使用値。**
  - Adafruit 11/120/40（2 A 電源向けに抑えた値）
  - Pi-Print 11/70/250
  - ある個体の self-test 表示 9/110/10
  - SDK の preset は light 60、normal 80、dark 120（SDK 自身が uncalibrated と明記）
  - ライブラリの hardware.md は、薄いとき `heatingTime: 200` を推奨
- **PT-210 battery 運用（7.4 V 1500 mAh）での推奨値。**
  - テキストと receipt：n1=7、n2=80–120、n3=2–10。
  - 写真：n1=7、n2=120–180、n3=20–40。n2 を 40 増やすごとに γ を約 +0.2（熱が増えると dot gain が増えるため）。
  - 非常に dense な art：n1=5–7。battery では n1 を低く保つ（高い n1 と dense な行の組み合わせで電圧が sag し、行が薄くなる）。
- ⚠️ **未検証。**
  - この clone が `ESC 7` を受け付けるか（SDK の作者も未検証と明言）。
  - `DC2 # n`（density = 50% + 5%·n）に対応するか。CSN-A2 にしか文書が無く、Adafruit は既定値を undocumented としており、Pi-Print では目に見える差がありませんでした。
  - 両方とも、UI に出す前に calibration strip で確認します。

### 6.6 推奨する設定 UI

- **Connection。** BLE / USB / Serial を feature detect して表示します。device name を記憶し、"Show all devices"（`acceptAllDevices`）と custom service UUID 欄を用意します。
- **Speed profile（chunk B / chunkDelay ms / partDelay ms）。**
  - Fast 182 / 20
  - Normal 182 / 40 / 50
  - Safe 100 / 60 / 80
  - Rescue 20 / 80 / 100
  - 生の値は Advanced に置きます。
- **Darkness。**
  - heating time slider 40–200 に Light / Normal / Dark の preset を付け、calibrate 済みの値を既定にします。
  - Advanced に max dots（battery-safe 2–3、normal 7）と interval（2–20）を置きます。
  - device ごとに保存します。
- **Image。** algorithm、threshold、brightness、contrast、gamma、invert、要素ごとの dither override。
- **Paper。**
  - 58mm（384）か 80mm（576）。
  - side margin、lead-in feed、tear-off feed（約 96 dots = 12mm、calibrate）。
  - copies とコピー間の gap。
- **Safety。** 1m 超で警告します。黒被覆率が高いときは警告して pacing を延ばします（仕様の前提は約 12.5%）。
- **Live preview。** 1:1 の実 bitmap に byte 数と ETA を添えます。

### 6.7 テスト印刷とキャリブレーションの流れ

1. **Hardware self-test。** 電源 off の状態で FEED を押しながら power を入れます。白紙が出たら紙、battery、ハードの問題で、コードでは直せません。fingernail scratch test で紙の向きを確認します。
2. **Link test。** `sendParts(t, textTestPage())`。これが印刷できて画像が出ないなら、問題は image path にあります。
3. **Raster sanity strip（384 幅）。**
   - 両端の 1-dot edge bar と、8 dots ごとに 1mm ticks の ruler で clipping を検出します。
   - 1-px checkerboard と 1-row の交互線で行の欠落（chunk overrun）を検出します。
   - 失敗したら speed profile を下げるよう自動で提案します。
4. **Darkness ladder（1 job）。**
   - n ∈ [40, 60, 80, 100, 120, 150, 200] について、`heating(n)` の後に「n=…」ラベル、ベタ黒 block、50% Atkinson patch、8 px の hairline テキストを並べた strip を送ります。
   - `encodeBitmap` は heat を1回しか設定しないので、`rasterImage()` の間に `heating()` を挟む custom encode が必要です。
   - imaging report の別案は n2 = 40, 60, …, 220 の約 10 patch（gray ramp + solid black）です。
   - ⚠️ `ESC 7` が job の途中で効くかは未検証です。効かなければ step ごとに 1 job にします。
   - ユーザーが最良の行を tap し、n2 と γ を device ごとに保存します。
5. **Dither comparison strip。**
   - 0–100%（10% 刻み）の wedge、顔写真、小さなテキストを並べます。
   - それぞれ Atkinson、threshold 128、threshold 180、FS、Bayer 4×4/8×8、halftone で、calibrate 済みの heat で印刷します。
   - ユーザーが「ベタ黒に見える最初の段」と「白に見える最初の段」をマークし、levels と gamma を fit します（§4.7 の 17-patch wedge と統合可能）。
6. **Tear-off calibration。** job の末尾に線を引いて feed し、ユーザーが線から切り口までの mm を入力します。その値で `paddingAfter` を決めます。
7. **Status probe**（notify characteristic がある場合のみ。無ければ step ごと非表示）。
   - `DLE EOT 4`（`10 04 n`）を送ります。
   - firmware PT-210-8008 の個体はどの n にも 1 byte で応答しました：0x16 = online、0x12 = no cover/paper/error。
   - ⚠️ Epson の n=4 layout（bits 2–3 = near end、bits 5–6 = paper end）が PT-210 に当てはまるかは未検証です。
   - 応答は BLE notification で 25–45 ms 後に届きます。notify は `49535343-1e4d-4bd9-ba61-23c647249616`（ISSC）と 18f0 service の `2af0`（他の 18f0 printer で確認）で、`ff01` は無反応です。
   - `GS I 1–3` は ID bytes、`GS I 65–68` は firmware / maker / model / serial の text を返します。`ESC v` と `GS r 1` も応答します。
   - battery の service も query も無く、残量 % は取れません。LED と buzzer で示されるだけで、app は薄い印刷から推測するしかありません。

### 6.8 PT-210 のコマンド対応（参考）

- `GS v 0`：確認済み。SDK の唯一の image path で、24-row strip で送ります。
- `ESC *`：代替手段。sibling model で mode 33 + `ESC 3 24` + `ESC 2` が使われていました。不要です。
- Text mode：
  - Font A 12×24、Font B 9×17（`ESC M`）。
  - SDK は `ESC E`、`ESC -`、`GS !`、`ESC a`、`ESC 3`、`ESC t`、`FS &` / `FS .`（Chinese mode）を実装しています。double-byte mode で起動する個体があります。
  - `ESC \` と `ESC $` の位置指定は PT-210 では失敗します。
  - `GS B` の反転は glyph だけで、周囲の space は反転しません。
- `GS k`：UPC-A、UPC-E、EAN8、EAN13、CODE39、ITF、CODABAR、CODE128、CODE93 が仕様に載っています。⚠️ 実機のテスト結果はありません。
- `GS ( k` QR：
  - firmware は対応していますが、function bytes は ASCII 0x41/0x43/0x45/0x50/0x51 でなければならず、生の 165–181 は文字として印刷されます。
  - clone の firmware では中央揃えができません。EMPS と Go の "poster" が raster に fallback しているのはこのためです。
  - inkless は raster を使います。

### 6.9 Pseudo-grayscale（実験的）

- strip ごとに最も暗い pixel から heat を決めます。
- deathandthepenguin は dwell の使用範囲約 16–112、`heat = (1−low)²·96 + 16`、adaptive threshold で約 64 階調を得ましたが、横方向の streak が出ました。
- PT-210 では粒度が strip 高（24 rows）になるので、おまけ程度です。

---

## 7. ライブラリ選定

npm registry（`npm view <pkg> time`）で 2026-11-05 に確認しました。条件は公開から 2 週間以上経っていることです。

| Package | Version | 公開日 | 備考 |
|---|---|---|---|
| react / react-dom | 19.3.1 | 2026-10-14 | |
| react-konva | 19.3.2 | 2026-10-15 | react ^19.3.0 と konva ^10 が必要。19.2.7 系は react ^19.2.0 で動く |
| konva | 10.9.0 | 2026-10-15 | 1.9 MB unpacked、core は tree-shakeable。10.9.1（10-31）は新しすぎ |
| @dnd-kit/react | 0.5.1 | 2026-10-15 | pre-1.0。0.5.2/0.5.3（10-31）は新しすぎ。安定した旧 API は `@dnd-kit/core` 6.3.1（2024） |
| zustand | 5.0.15 | 2026-08-13 | ⚠️ 5.0.16（10-22）はちょうど cutoff 上 |
| zundo | 2.3.0 | 2024-11 | zustand ^5 で動作 |
| immer | 11.1.21 | 2026-10-02 | 11.1.22 以降と 11.2.x は 10-20 以降の公開 |
| qrcode | 1.5.4 | 2024-08 | **QR の第一候補** |
| qrcode-generator | 2.0.4 | 2025-08 | 軽量な代替。`isDark(r,c)` |
| jsbarcode | 3.12.3 | 2026-01 | **軽量バーコード** |
| bwip-js | 4.11.4 | 2026-08 | 100+ symbology。12.9 MB unpacked |
| use-image | 1.1.4 | – | 任意。Konva への画像 load helper |
| @fontsource/*（§5.6 の 16 書体） | – | – | registry で 200 を確認。⚠️ version は個別に固定が必要 |

**用途と注意点**

- **qrcode**
  - `create(text,{errorCorrectionLevel})` で module grid を得て、`Konva.Rect` か cached `Shape` を自前で描きます。module は整数 dot（例 4）、quiet zone は 4 です。
  - byte mode の UTF-8 なので日本語と emoji が通ります。Kanji mode には `toSJISFunc` helper が必要です。
- **bwip-js**
  - code128、ean13、pdf417、datamatrix、aztec、qrcode などに対応し、`toCanvas` と `rotate` があります。
  - browser ESM build から必要な encoder だけを named import します。
- **JsBarcode**
  - CODE128、EAN/UPC、CODE39、ITF、MSI、Codabar、CODE93 に対応し、format あたり約 6 kB gzip です。
  - `encodings` の raw-data mode を使い、bar を整数 dot の rect で描きます。`width`（module 幅）は 2–3 dots です。
- **dnd-kit**
  - `DragDropProvider` + `useDraggable` を使い、stage container を `useDroppable` にします。
  - `onDragEnd` で `event.operation.position.current` から container rect を引き、stage scale で割って dots に変換します。
  - native HTML5 DnD は drag preview を制御できないので避けます。⚠️ native DnD の touch 不安定は報告者の推測で、未テストです。touch 向けの fallback として tap-to-add（表示中央に挿入）を用意します。
- **Konva の recipe。**
  - Transformer は scale を変えるので、`onTransformEnd` で width/height に戻します。
  - snap は `dragmove` + `getClientRect` で edge と centre に吸着し、`GUIDELINE_OFFSET=5`、軸ごとに guide は1本です。約 100 行です。
  - snap 対象は 8-dot grid、紙の端と中央、他要素の端と中央です。Alt で無効にし、drag や transform の終了時に x/y/w/h を整数 dot に丸めます。
  - text 編集は `Konva.Text` に textarea を重ね、font と rotation をコピーします（1 node 1 style）。
  - pinch-zoom は `Konva.hitOnDragEnabled` を使います。
- **Shortcuts。**
  - `]` / `[` で前後、Cmd-`]` / Cmd-`[` で最前面と最背面。
  - Delete、Cmd-D で複製、矢印で 1 dot（Shift で 8）。
  - Cmd-Z / Shift-Cmd-Z、Cmd-C / Cmd-V は clipboard に JSON。
  - `keydown` listener は1つにし、input や textarea に focus があるときは無視します。
- **不採用。** fabric 7.4.0（22 MB）。CVE-2026-27013（SVG export XSS）と CVE-2026-44311 の 2 件が release page に記載されています。7.0 で default origin が center に変わっており、schema が変わりうることも理由です。

**データモデル**

```ts
type Dots = number;
type Id = string;

type Doc = {
  version: 1;
  id: Id;
  name: string;
  width: 384;
  height: { mode: 'auto'; padBottom: Dots } | { mode: 'fixed'; value: Dots };
  orientation: 'portrait' | 'landscape';
  print: { heatingTime?: number; paddingBefore: Dots; paddingAfter: Dots; copies: number };
  elements: Element[];
  assets: Record<Id, Asset>;
  fonts: string[];
};

type Asset = { id: Id; kind: 'image'; mime: string; dataUrl: string; w: number; h: number };

type Base = {
  id: Id; name?: string;
  x: Dots; y: Dots; w: Dots; h: Dots;
  rotation: number;
  locked?: boolean; hidden?: boolean; invert?: boolean; groupId?: Id;
};

type TextEl = Base & {
  type: 'text'; text: string;
  font: { family: string; size: Dots; weight: 400 | 700 | 900; italic?: boolean };
  align: 'left' | 'center' | 'right' | 'justify';
  lineHeight: number; letterSpacing: Dots; autoHeight: boolean;
  fill: 'black' | 'white'; bindings?: string[];
};

type ImageEl = Base & {
  type: 'image'; assetId: Id;
  fit: 'contain' | 'cover' | 'fill';
  crop?: { x: number; y: number; w: number; h: number };
  dither: 'atkinson' | 'threshold' | 'halftone';
  threshold: number; brightness: number; contrast: number;
};

type QrEl = Base & { type: 'qr'; data: string; ecl: 'L' | 'M' | 'Q' | 'H'; module: Dots; quiet: number };

type BarcodeEl = Base & {
  type: 'barcode';
  symbology: 'code128' | 'ean13' | 'upca' | 'code39' | 'itf14' | 'pdf417' | 'datamatrix';
  data: string; module: Dots; barHeight: Dots; showText: boolean;
};

type ShapeEl = Base & { type: 'rect' | 'ellipse' | 'line'; stroke: Dots; fill: 'none' | 'black' | 'pattern'; dash?: Dots[]; radius?: Dots };
type DividerEl = Base & { type: 'divider'; style: 'solid' | 'dashed' | 'dotted' | 'zigzag' | 'scissors' | 'stars' };
type ListEl = Base & { type: 'list'; items: { id: Id; text: string; done: boolean }[]; font: TextEl['font']; bullet: 'checkbox' | 'dot' | 'number' };

type Element = TextEl | ImageEl | QrEl | BarcodeEl | ShapeEl | DividerEl | ListEl;

type Preset = { id: Id; title: string; category: 'receipt' | 'ticket' | 'label' | 'sticker' | 'meme' | 'todo' | 'photo'; doc: Doc; thumb?: string };

type EditorState = { doc: Doc; selection: Id[]; editingTextId: Id | null; zoom: number; snap: { grid: Dots; enabled: boolean }; inkPreview: boolean };
```

**モデルのルール**
- x、y、w、h は整数 dot で、回転の pivot は要素の中心です。
- `invert` は白抜きです。`hidden` は editor には残し、印刷では除外します。
- `TextEl.autoHeight` は測ったテキストから h を伸ばします。`bindings` は `{{date}}`、`{{counter}}` などです。
- `ImageEl` は元画像を保持し、render 時に dither します。再 dither しても劣化しません。
- 保存形式は plain JSON + `assets`（data URL）の map で、preset = `Doc` JSON です。migration 用に `version` を持ちます。
- `ImageEl.dither` の enum は §4.5 に合わせて拡張が必要です。

---

## 8. リスクと未検証事項

| # | 項目 | 状態 / 対処 |
|---|---|---|
| 1 | この clone が `ESC 7` を受け付けるか | ⚠️ 未検証（SDK の作者も明言）。calibration strip で確認 |
| 2 | `ESC 7` が job の途中で効くか | ⚠️ 未検証。効かなければ step ごとに 1 job |
| 3 | `DC2 #` density | ⚠️ PT-210 での根拠なし。Pi-Print で効果なし。UI に出す前に probe |
| 4 | `DLE EOT 4` の bit layout | ⚠️ Epson 準拠かは未検証。確認できたのは 0x16 / 0x12 の 1 個体だけ |
| 5 | 24-row strip ごとの stall による約 3mm 周期の banding | ⚠️ リスク。48–96 rows と strip 後 50 ms の要否を検証 |
| 6 | abort 後に printer が次の job を食う | ライブラリが未対応。0 埋め + `ESC @` を app 側で実装 |
| 7 | 並列 GATT 書き込みの混在 | job mutex が必須 |
| 8 | 再接続のたびに chooser が出る（BLE `getDevices()` は flag 必須） | `namePrefix` + localStorage で緩和 |
| 9 | Safari、Firefox、iOS 非対応、Web Serial は desktop のみ | feature detect して説明する UI |
| 10 | PT-210 の過熱 cutoff | ⚠️ Unknown。1m 制限と被覆率の警告で緩和 |
| 11 | 1 ロールの紙長（約 19 m） | ⚠️ 推定。公表値なし |
| 12 | battery 残量 | 取得不可。薄い印刷からの推測だけ |
| 13 | font の最小 px | ⚠️ 報告者の経験則。実機で検証 |
| 14 | `document.fonts.load()` の空配列による typo 検出 | ⚠️ spec からの解釈。明記なし |
| 15 | Canvas の `{alpha:false}` で LCD AA が有効になる | 透明 canvas に描いてから threshold |
| 16 | dnd-kit/native DnD の touch 挙動 | ⚠️ 未テスト。tap-to-add を fallback にする |
| 17 | `@dnd-kit/react` が pre-1.0 | API が変わるリスク。代替は `@dnd-kit/core` 6.3.1 |
| 18 | zustand 5.0.16 が cutoff 上 | 5.0.15 に固定 |
| 19 | blue noise texture のライセンス | ⚠️ 同梱前に確認。自前生成なら回避できる |
| 20 | Apache 2.0 の font（Kosugi Maru、Permanent Marker、Rock Salt） | 「OFL のみ」方針なら除外 |
| 21 | 非 GF の font（littlelimit、M+、Unifont の dual license） | woff2 変換は modification 許可の範囲と解釈 |
| 22 | 写真の高被覆率による streak、power sag、thermal drift | 明るめの γ、clamp、"save heat"、n1 を下げる、pacing を延ばす |
| 23 | variable font の custom axis は canvas で使えない | build 時に instancer で static 化 |
| 24 | Fabric 7 の CVE 2 件 | 採用しないので影響なし |
| 25 | QR の `GS ( k` は中央揃え不可、生の bytes は文字化け | raster で回避 |
| 26 | `GS k` の実機結果なし | raster で回避 |
| 27 | Spotify/GitHub の OAuth、relay backend、AI layout（有料 API） | v2。AI は opt-in |

---

## 9. 出典

**ライブラリ（ローカル）**
- `/Users/vittayapalotai.tanyawat/code/escpos-web-print/README.md`（lines 159、194–195）
- `/Users/vittayapalotai.tanyawat/code/escpos-web-print/docs/hardware.md`
- `/Users/vittayapalotai.tanyawat/code/escpos-web-print/docs/methodology.md`（§5）
- `/Users/vittayapalotai.tanyawat/code/escpos-web-print/src/layout.ts`（lines 61–75）、`src/bitmap.ts`、`src/encode.ts`、`src/print.ts`、`src/commands.ts` ほか全 `src/*.ts`

**競合とランドスケープ**
- https://apps.apple.com/us/app/print-master/id1467113436
- https://help.phomemo.com/portal/en/kb/articles/how-to-use-print-masetr
- https://manuals.plus/phomemo/print-master-app-manual
- https://play.google.com/store/apps/details?id=cn.paperang.international
- https://apps.apple.com/us/app/paperang/id1228042625
- https://www.juliaandtania.com/blog/?p=4837
- https://apps.apple.com/us/app/peripage/id1508457132
- https://peripage.org/
- https://www.appbrain.com/app/tiny-print/com.frogtosea.tinyPrint
- https://play.google.com/store/apps/details?id=com.fun.mxw
- https://play.google.com/store/apps/details?id=com.phucynwa.mini.portable.cat.printer
- https://github.com/shakedkleter92-ux/mini-p
- https://github.com/bossly/catprint
- https://github.com/lukaszliniewicz/catlabel
- https://github.com/NaitLee/Cat-Printer
- https://github.com/zmras/cat-printer-web
- https://github.com/XroksX/Cat-Printer-MX10
- https://parzibyte.me/blog/en/posts/receipt-designer-thermal-printers-free-open-source/
- https://aschmelyun.com/blog/i-built-a-receipt-printer-for-github-issues/
- https://hackaday.com/2022/03/25/get-github-tickets-irl-with-a-raspberry-pi-and-a-receipt-printer/
- https://github.com/dnaielfergy/daily-todo-printer
- https://github.com/JoesThomas/ThermalReceiptPrinterDailyTasks
- https://github.com/topics/receipt-printer?o=desc&s=updated
- https://www.itsnicethat.com/news/little-printer-berg-app-digital-220519
- https://tinyprinter.club/
- https://beebom.com/receiptify-your-top-spotify-tracks/
- https://github.com/chairs44/receipts.cafe
- https://blog.adafruit.com/2025/11/07/send-messages-directly-to-a-receipt-printer-with-a-raspberry-pi-piday-raspberrypi/
- https://github.com/YouriNL/Anonymous-Receipt-Printer
- https://en.wikipedia.org/wiki/Kortunefookie
- https://github.com/evilmadscientist/pi-cam-printer
- https://github.com/zoetrope69/1bitphotobooth
- https://github.com/amelka800/Mini-Photobooth
- https://github.com/antoinehng/pibooth

**画像処理**
- https://tannerhelland.com/2012/12/28/dithering-eleven-algorithms-source-code.html
- https://screaming.computer/blog/2023-05/imagick-image-dithering-for-thermal-receipt-printers
- https://deathandthepenguinblog.wordpress.com/2019/12/08/adafruit-mini-thermal-printer-part-1-getting-better-pictures/
- https://hackaday.io/project/3917-pi-print
- https://raw.githubusercontent.com/adafruit/Adafruit-Thermal-Printer-Library/master/Adafruit_Thermal.cpp
- https://learn.adafruit.com/mini-thermal-receipt-printer/hacking
- https://cdn-shop.adafruit.com/datasheets/CSN-A2+User+Manual.pdf
- https://cdn.hackaday.io/files/1779887615038592/EF06120-A2-user%20manual.pdf
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10857809
- https://perso.liris.cnrs.fr/victor.ostromoukhov/publications/pdf/SIGGRAPH01_varcoeffED.pdf
- https://github.com/dalpil/structure-aware-dithering
- http://caca.zoy.org/wiki/libcaca/study/3
- https://momentsingraphics.de/BlueNoise.html
- https://doi.org/10.1117/12.152707
- https://www.prepressure.com/design/basics/dot-gain
- https://www.w3.org/Bugs/Public/show_bug.cgi?id=23516
- https://www.codestudy.net/blog/can-i-turn-off-antialiasing-on-an-html-canvas-element/

**フォント**
- https://fonts.googleapis.com/css2
- https://fonts.google.com/metadata/fonts
- https://github.com/google/fonts
- https://littlelimit.net/misaki.htm
- https://littlelimit.net/k8x12.htm
- https://littlelimit.net/font.htm
- https://github.com/itouhiro/PixelMplus
- https://unifoundry.com/unifont/index.html
- https://developer.mozilla.org/en-US/docs/Web/API/FontFaceSet/load
- https://www.w3.org/TR/css-font-loading-3/
- https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/fonts
- https://registry.npmjs.org/@fontsource/

**エディタとライブラリ**
- https://konvajs.org/docs/react/Transformer.html
- https://konvajs.org/docs/sandbox/Objects_Snapping.html
- https://konvajs.org/docs/sandbox/Editable_Text.html
- https://konvajs.org/docs/data_and_serialization/High-Quality-Export.html
- https://konvajs.org/docs/sandbox/Multi-touch_Scale_Stage.html
- https://github.com/fabricjs/fabric.js/releases
- https://fabricjs.com/docs/
- https://dndkit.com/react/hooks/use-draggable
- https://dndkit.com/react/components/drag-drop-provider
- https://github.com/soldair/node-qrcode
- https://github.com/kazuhikoarase/qrcode-generator
- https://github.com/metafloor/bwip-js
- https://github.com/lindell/JsBarcode

**プリンターと接続**
- https://goojprt-pt210-sdk.readthedocs.io/en/latest/（api/commands.html、api/status.html、api/constants.html、api/transport.html、api/raster.html）
- https://github.com/filipsedivy/goojprt-pt210-sdk
- https://github.com/Jeroen7V/EMPS/pull/8
- https://github.com/KevinGong2013/Printer/pull/79
- https://github.com/adcondev/poster
- https://github.com/selfcustody/krux/issues/939
- https://github.com/0xMH/fichero-printer/blob/main/docs/PROTOCOL.md
- https://github.com/Jorgelig-Labs/web-bluetooth-receipt-printer-spike
- https://www.ht-instruments.it/media/filer_public/f0/4e/f04e8540-41bc-46d3-ae45-10e98973ab45/mpt-ii_user_manual.pdf
- https://img.waimaoniu.net/2205/MPT-II-user%20manual%20-EN-Type%20C%20@YAEN200825(1).pdf
- http://www.posthermalprinter.com/108.html
- https://manuals.plus/ae/1005002378447954
- https://developer.chrome.com/docs/capabilities/bluetooth
- https://issues.chromium.org/issues/360888485
- https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md
- https://googlechrome.github.io/samples/web-bluetooth/get-devices.html