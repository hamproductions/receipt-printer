# アイデア一覧（ブレインストーミング結果）

4つの観点（パーティ・推し活、日常、1bitアート、技術）から48案を出し、重複と既存機能を除いて順位付けした。原文は英語のまま保存する。

## Top 10 next

1. **Amidakuji Ladder**
   - Do: enter names and prizes, set the ladder length with a slider, print it, fold the results flap and trace paths with a finger. An on-screen reveal settles disputes.
   - Prints: names on top, 4 to 8 rails with random rungs running 20 to 60 cm, a "fold here" line, and the results printed upside down at the bottom.
   - Effort: S

2. **Tear-Down Countdown Chain** (merges Countdown Tear Calendar)
   - Do: set a target date, add milestone notes and an optional {pick:} cheer line, print once and tear off one segment each morning.
   - Prints: one segment per remaining day with "あと 12 日", the date, any milestone in a heavier frame, and a zigzag tear line. The last segment is a full "TODAY!!" with the event name.
   - Effort: S

3. **Role Slips: Werewolf / Word Wolf / Insider / Secret Santa**
   - Do: pick a game and player count. The app shuffles roles or word pairs and prints one slip per player, then a moderator slip.
   - Prints: tear-off slips with "PLAYER 3, fold up, don't peek", a pattern-fill privacy band, the role or word upside down below the fold, and the answer key last.
   - Effort: S

4. **Maze Race Tape**
   - Do: pick a length (30 cm to 2 m), a difficulty and a player count, print, then race with pens. The seed lets you reprint the same maze, and the solution can print separately.
   - Prints: a 1-bit maze the full 384 px wide with START and GOAL, a seed footer, and an optional solution strip.
   - Effort: S

5. **Glitch & Databend Filter**
   - Do: apply a seeded row shift, pixel sort, scanline drop or "jammed printer" row stretch to any block or the whole canvas. It works with per-copy rerolls, so every copy glitches differently.
   - Prints: tickets or photos that look like a broken receipt printer on purpose.
   - Effort: S

6. **Lucky Star Strips**
   - Do: type wishes or member names. They are laid into 4 lanes at origami lucky-star proportions. Cut, fold into stars, fill a jar for a 生誕祭.
   - Prints: 25 cm segments with 4 dashed-cut lanes, each holding a rotated message, end motifs and a "start knot here" mark.
   - Effort: S

7. **Endless Scroll Generators** (merges Cellular Automaton Roll and Endless Generative Scroll; ship the cellular automaton first)
   - Do: pick a generator (Rule 30/90/110, a hand-drawn first row, Truchet, flow field), set the length in cm and a seed, print.
   - Prints: one unbroken 30 cm to 2 m 1-bit artwork with a "seed 48213 / 1.2m" footer that reprints exactly.
   - Effort: S for the cellular automaton, M for the full generator set

8. **Photo Booth Strip** (merges Purikura Booth Strip and Photo Booth Strip)
   - Do: tap Start for a 3-2-1 countdown with pose prompts. It takes 4 mirrored webcam shots, auto-dithers them, and lets you add stamps and a finger doodle. Copies print one strip per friend.
   - Prints: about 25 cm with 4 square dithered frames, a date header, the doodle layer, a "MEMBERS: 4 / {date}" footer and tear lines.
   - Effort: M

9. **Slit-Scan Camera** (reuses the booth capture pipeline, so build it right after #8)
   - Do: start the camera, move or have friends walk past, stop, pick a dither, print.
   - Prints: a long time-smear strip built from the center webcam row, one row per frame, with time running down the paper.
   - Effort: M

10. **Oshi Gacha Machine**
    - Do: load your own photo deck with names and rarity weights, press the capsule button, watch the pull animation, and a card prints. Pull history and pity count are stored locally.
    - Prints: a 384x560 card with the dithered photo, name, rarity stars, a skill line, "No.{copy}", the date, and a frame that gets more ornate with rarity. Cards separate on a ticket-edge tear.
    - Effort: M

## Bigger bets

- **Phone Remote via QR Handshake** (L): WebRTC offer and answer pass by QR, so there is no signalling server. Each phone sends text, a photo, or a shake-to-omikuji to the laptop's printer. Party queue. It needs a fallback for networks where LAN host candidates fail.
- **Live Mic Tape** (M to L, merges Cheer Meter Tape, Audio Waveform Ribbon and Live Seismograph): ship the record-then-print waveform with a rank title first (M). Live streaming of raster rows with marker labels comes second (L), once BLE throughput is proven.
- **Poster Tiler** (M, merges Uchiwa Tiler, Poster Tiler and Tear-Apart Panorama Puzzle): huge type or an image sliced into N strips with registration ticks, "STRIP 3/6" labels and overlap margins, plus an assembled preview.
- **Morning Paper** (M, merges Morning Weather Tape): Open-Meteo, Nager.Date and Wikipedia on-this-day data, plus moon and sunrise computed locally. Ship the {weather} {temp} {rain%} {sunrise} {moon} tokens first, since they also upgrade every existing preset.
- **Self-Reprinting Slip** (M): the design is gzipped into the URL hash, with an optional "reprint me / もう一枚" footer QR scanned by BarcodeDetector. This is the growth loop: paper becomes the share link.
- **Exquisite Corpse Relay** (M): pass-the-phone drawing where only the last 12 px of each section are visible to the next player. Each section prints as soon as it is finished, gets folded under, and everyone unrolls at the end.

## Cut

- **Vertical Banner Type**: repeats the existing banner preset.
- **Halftone Dot Lab**: overlaps the dither lab. If wanted, add AM halftone as a 13th algorithm, not a separate feature.
- **Typographic Gradient Stack**: already buildable with text blocks, and the audience is niche.
- **Mirror Kaleidoscope Photo**: low payoff, a novelty that wears off after one print.
- **ASCII / Kana Mosaic Photo**: M effort for a one-time wow. Revisit after the generators ship.
- **Plotter Line-Art Photo**: M effort, niche, and the spiral-from-brightness tuning is a time sink.
- **Karaoke Judge Receipt**: L effort, and scoring pitch in the browser without the original melody will feel arbitrary.
- **Route Ribbon**: the OSRM demo and Nominatim usage policies forbid app traffic. Also L effort.
- **Hashtag Tape**: it prints unmoderated public posts on a shared printer, and a runaway roll wastes paper.
- **Kitchen Timer Slips**: needs the tab open and the printer connected for a long time, and a phone alarm already does the job better.
- **Desk Interval Log**: same connection problem, and it wastes paper on a timer.
- **Pomodoro Tape**: same connection problem. The value is in the timer, not the print.
- **Habit Stamp Strip**: the static grid is already buildable with existing blocks and the todo preset.
- **Jar & Fridge Labels**: low fun for this audience.
- **Scan-to-List Shopping Slip**: Open Food Facts has weak Japanese coverage, and phone notes already win here.
- **Wallet Currency Card**: low fun, and the rates are stale the day after printing.
- **One-Line Diary Scroll**: too close to the receipt-of-the-day and todo presets.
- **Fold-Quiz Vocab Strip**: spaced repetition and furigana layout are scope creep for a printer toy.
- **Recipe Step Ribbon**: parsing freeform recipes is unreliable.
- **Live Setlist Tape**: mostly typing, with a small upside over the existing ticket preset.
- **Share-to-Print**: plumbing that needs a PWA install and a service worker. Low fun, so park it as infrastructure.
- **Agent Print Inbox**: internal plumbing with no payoff for party or fan users.
- **Real Tape Measure**: feed drift on a cheap printer makes the word "exact" false.
- **Camera Flipbook**: deferred, not dead. It reuses the booth capture, so queue it after #8 and #9.
