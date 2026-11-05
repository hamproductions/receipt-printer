# inkless

58mm ESC/POS サーマルプリンター（FUNFANG / GOOJPRT PT-210 互換、203dpi、384 dot）向けの、ドラッグ&ドロップ帳票デザイナー。

## 起動

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4318 --strictPort
```

http://127.0.0.1:4318/ を Chrome または Edge で開く（Web Bluetooth / Web Serial / WebUSB は secure context が必要。localhost は可）。

## receipt-printer からの移行

receipt-printer の機能はすべて inkless に移した。プリセット「Offkai ticket」と「Boom Boom BEE ticket」、Offkai 取込、MS ゴシック既定、回転・カッター・80 mm 幅、旧プリセット JSON の取り込みに対応する。対応表は docs/adr/0003-replace-receipt-printer.md。

## できること

- ブロック: 見出し、テキスト、価格行、サイコロ、写真、QR、バーコード（Code128 / Code39 / EAN-13 / UPC-A / ITF-14）、罫線、破線、ジグザグ、チケット縁、枠、円、パターン塗り。
- エディター: Ctrl / Cmd + ホイール（トラックパッドのピンチ）でカーソル位置を中心に最大 800% まで拡大、Space + ドラッグまたは中ボタンドラッグで移動。上と左に mm 定規、定規からドラッグしてガイド線を追加（紙の外へドラッグで削除）。スナップは Off / Snap（紙端・中央・他要素・ガイド）/ Snap + mm（1 mm グリッドも）。カーソル位置を dot と mm で表示。
- 選択: カーソル下で最も小さい要素を優先（枠線の内側はクリックが通る、テキストは実際の文字幅で判定）、Alt+クリックで下の要素へ切替、Shift+クリックで追加、空白ドラッグで範囲選択、Cmd+A で全選択、レイヤー一覧から選択。
- ドラッグ移動（複数同時）、8方向リサイズ、回転（90°スナップ、Shift で 15°）、紙端・中央・他要素へのスナップ、Alt でスナップ無効。整列・等間隔・端から端まで。
- テキスト: 23書体（ピクセル、レシート、ディスプレイ、手書き、日本語）、自前フォント読込、サイズ、太さ、揃え、行間、字間、斜体、白抜き。ダブルクリックで直接編集。
- ライブトークン: `{date}` `{time}` `{copy}` `{dice}` `{coin}` `{num:1-100}` `{pick:a|b|c}`。複数部印刷では部ごとに振り直す。
- ディザは既定でオフ。画像は閾値で白黒にするだけ（Offkai のロゴも含む）。「Dither new photos」で新しい写真だけディザを使える。「Remove dithering from all...」で既存の画像からまとめて外せる。
- 白黒の画像（ほぼ全画素が黒か白）は自動で判定し、PNG のまま保存、ディザなし（Line art）、拡大は最近傍補間、紙幅に収まる整数倍で配置する。「Keep pixels sharp」「Whole-pixel size」でいつでも同じ扱いにできる。
- 写真: ダブルクリックでトリミング（ドラッグで位置、ホイールで拡大、Enter/Esc で終了）。枠なし / ポラロイド / 細枠、枠の余白と下余白は調整可能。12種の1bit化（Floyd、Atkinson、Stucki、Jarvis、Sierra、Bayer、Grain、Stipple、Halftone、Engraving、Crosshatch、Line art）。各タイルは実ドット寸法のプレビュー。明るさ、コントラスト、ガンマ、閾値。貼り付け・ドロップで追加。
- プリセット37種（うち横向き6種: Long banner、Wide ticket、Wide boarding pass、Desk name plate、Shelf label、Sale sign）。新規: Grocery、Setlist、Fortune cookie、Raffle、Certificate、Contact card、Cafe order、Timetable、Recipe、Score sheet、生誕祭、Role slip、Parking ticket、Thank-you。以前からの18種: Blank、Receipt of the day、Live ticket、Omikuji、Todo、Long banner（ロール方向に回転印刷）、Polaroid、Name tag、Boarding pass、Coupon、Wi-Fi card、Bingo card（部ごとに別の数字）、Meme、Day planner、領収書、Gift tag、Quote card、Calibration strip。すべて左右余白なしの 384 dot 幅。
- 印刷: プレビューの Canvas をそのまま送る。末尾の余白（既定 12 mm、0〜40 mm）は紙の一部としてプレビューに描かれ、見えない空送りは追加しない。Bluetooth / USB / Serial 接続、テキスト試験印刷、太さ（閾値）、加熱時間（ESC 7）、部数、中断（送信途中の帯を0で埋めて ESC @）。1m 超は確認、30cm 超は警告、印刷時間の目安表示。
- 保存: 自動保存（localStorage）、マイデザイン、JSON 書き出し・読み込み、PNG、ESC/POS バイナリ。

## プリセットアプリ（設定駆動）

各プリセットは src/apps/manifests/<id>.json の1ファイル。リストの数値は `{price:>8.2}` で小数桁を指定できる。可変テキストが伸びると下の要素を押し下げ、`when` で非表示になった行は詰める（縦向きのみ）。フィールドを宣言すると右パネルに入力フォームが自動で出て、紙に即反映される。新しいアプリは JSON を追加するだけで一覧に出る。仕様は docs/adr/0002-config-driven-apps.md。

## ディープリンク

- `#app=<プリセットid>&<フィールド>=<値>` でプリセットを値入りで開く。例: `http://127.0.0.1:4318/#app=offkai-ticket&serial=S0123&subtitle=イベント名`。数値・トグル（true/false）・選択肢を型どおりに読み、リストは JSON。知らないキーは無視して通知する。
- `#d=<gzip+base64url>` はデザイン全体。右パネルの「Copy share link」で作る。`#` 以降はサーバーに送られない。長すぎる場合は写真を外す。「Copy preset link」はプリセットと入力値だけのリンク。
- 開いた後は URL から `#` 部分を消す。元の内容は Undo で戻る。

## WebMCP（AIエージェント向けツール）

ブラウザが WebMCP に対応している場合、`document.modelContext.registerTool`（旧 `navigator.modelContext` にも対応）で次のツールを登録する。src/webmcp.ts と src/agentTools.ts。

- 読み取り: `inkless_get_design`（用紙、設定、全要素）、`inkless_get_preview`（印刷される1bit PNG）、`inkless_list_presets`、`inkless_list_fonts`
- 編集（すべて undo 可能）: `inkless_load_preset`、`inkless_add_element`、`inkless_update_elements`（複数を1手で）、`inkless_delete_elements`、`inkless_select`、`inkless_set_paper`、`inkless_undo`、`inkless_redo`
- 印刷: `inkless_print`（接続はブラウザの制約でユーザーのクリックが必要。未接続ならエラーを返す）

編集は要素の既存プロパティのみ許可し、型違い・id/kind の変更は拒否する。

ローカル確認: Chrome 149 以降で chrome://flags/#enable-webmcp-testing を有効にする（または `--enable-features=WebMCP` で起動）。Model Context Tool Inspector 拡張でツールを一覧・実行できる。

## 検証

```bash
npm run type-check
npm run build
```

実機への送信はこの環境では未検証。プレビューと送信ビットマップの一致は実ブラウザで 0 dot 差を確認済み。
