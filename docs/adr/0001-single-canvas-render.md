# 0001 単一Canvas描画 + DOMオーバーレイ

## 状態
採用

## 背景
調査（docs/research.md §1）は react-konva を推奨した。目的はプレビューと印刷のドット一致。

## 決定
要素は src/render.ts で 1 dot = 1 px の Canvas に描き、最後に閾値で 1bit 化する。エディターはその Canvas をそのまま表示し、選択枠・ハンドル・インライン編集だけを DOM で重ねる。写真は要素ごとに先にディザし、印刷は escpos-web-print に `trim:false, dither:'threshold'` で渡す。

## 理由
- 表示と印刷が同じピクセル列になる（実測で 384×451 の 173,184 dot 中 0 dot 差）。
- Konva を使っても印刷時は別 Stage を toCanvas する必要があり、描画経路が2本になる。
- 依存を増やさない。

## 影響
- Canvas の再描画はレイヤー単位でキャッシュする（src/render.ts の layers）。フォント読込後はテキストレイヤーのみ破棄する。
- 回転した要素のヒットテストは DOM の transform に任せる。
