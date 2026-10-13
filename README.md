# Receipt Printer

Web Bluetooth (BLE) / Web Serial対応のESC/POS帳票エディターです。見本帳票の内容を独立した入力欄で編集し、同じCanvas描画からプレビュー、PNG、ESC/POSラスタデータを生成します。

## ローカル実行

```bash
npm install
npx panda codegen
npm run dev -- --host 127.0.0.1 --port 4317 --strictPort
```

`http://127.0.0.1:4317/` を開きます。Offkaiの読み込みは同一オリジンのVite開発サーバールートが許可済みホストへサーバー側リクエストを行います。GitHub Pagesなど静的公開版では `VITE_STATIC_DEPLOY=true` を付けてビルドし、サーバー経由のOffkai取込を画面上で無効化します。ビルド後に確認する場合は次を実行します。

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4317 --strictPort
```

## 使い方

- 見出し、サブ見出し、日時・会場、座席、整理番号、注意書きを個別に編集できます。
- 見本ロゴは提供された原画像の左領域をCanvasで切り出して表示します。画像アップロード後は位置と拡大率を調整できます。
- 初期フォントは同梱のIBM Plex Sansです。日本語、半角カタカナ、全角文字、`○`は同梱のIBM Plex Sans JPへフォールバックします。IBM PlexのSIL Open Font License 1.1全文は `public/fonts/IBMPlex-OFL.txt` に置いています。許諾済みの `woff`、`woff2`、`ttf`、`ttc`、`otf` を読み込むとプレビューとラスタ生成に同じフォントを使います。
- IBM Plex Sans JPのhmtxはupem 1000、ASCIIが可変幅、半角カタカナが500、漢字・全角文字・`○`が1000です。Canvas側で字形を横方向へ変形せず、フォント本来の進み幅を使います。
- PNGは1819×685の横長Canvasから保存します。ESC/POSデータは印字幅を128〜2048 dot（8 dot単位）で指定でき、初期値は一般的な58mm幅の384 dotです。左右余白を指定すると白余白を確保して内容を縮小し、横向き・縦送り回転を選べます。
- カット方式は全切り、部分切り、カットなしから選べます。全切り・部分切りはESC/POSのGS V65/66 n、カットなしで追加送りを指定した場合はESC J nを使います。nは機種依存の送り単位で、mmやdotへの換算はしません。プリンターごとのカッター互換性は未検証です。
- Web Bluetoothはボタン操作からデバイスを選択し、指定UUIDのCharacteristicへ書き込みます。Characteristicの書き込み方式を検出し、分割して順番に送信します。
- 実機がない状態では印刷送信を実行できません。`.escpos.bin` の保存で生成データを確認できます。
- Offkaiからはイベント名、日時、会場だけを帳票へ反映します。整理番号はチェックボックスを選んだ場合だけ反映します。トークンと取得した個人データは保存しません。
- 帳票本文と印刷設定はバージョン付きのローカル保存へ自動保存します。Offkai URL、トークン、カスタムフォント本体は保存しません。小容量のアップロードロゴだけ安全に保存対象になります。

## 検証

```bash
npm run type-check
npm run build
```

見本フォントの同一性、Bluetooth機器への実送信、紙への印字結果はこの環境では未検証です。
