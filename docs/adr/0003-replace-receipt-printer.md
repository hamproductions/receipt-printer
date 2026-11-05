# 0003 receipt-printer を inkless に統合して置き換える

## 状態
採用

## 決定
../receipt-printer の機能を inkless に移し、receipt-printer は新規開発を止める。

| receipt-printer | inkless |
| --- | --- |
| 見本帳票（いきづらい部！ 2nd LIVE） | プリセット「Offkai ticket」（src/apps/manifests/offkai-ticket.json） |
| Boom Boom BEE プリセット（LOVELIVE! FEST ロゴ） | プリセット「Boom Boom BEE ticket」 |
| 見出し・サブ見出し・日時会場・座席・整理番号・注意書き | 同名のアプリ入力欄（注意書きは複数行） |
| 見本ロゴ（原画像 x20 y220 520×300 の切り出し） | public/apps/ikizuraibu-logo.png（同じ範囲を sips で切り出し） |
| ロゴのアップロード、自動余白トリミング、位置・拡大率 | 写真要素の差し替え（チケットのロゴ枠は差し替え時に自動トリミング）、ドラッグ・リサイズ・トリミング |
| 見本ロゴに戻す | 「Reset to sample」で文字とロゴを見本に戻す |
| MS ゴシック既定、無い端末は同梱 IBM Plex、使用中フォントの表示 | 書体「MS Gothic」、無い場合は旧アプリと同じ同梱 IBM Plex（public/fonts、オフライン可）。使用中フォントを書体欄に表示 |
| カスタムフォント読込 | 「Load your own font file」 |
| Offkai 取込（参加者URL、整理番号の任意反映、URL非保存、静的公開では無効） | 同じサーバー経由の取込を vite.config.ts に移植し、アプリ入力欄の上に表示 |
| 右90° / 左90° 回転 | 横向きデザインの「Turn the design」 |
| 印字幅 128〜2048 dot | 「Printer width」128〜2048 dot（8 dot 単位） |
| 前余白・後余白 | 後余白は「Blank paper at the end」、前余白は要素の位置（全選択して移動） |
| カット方式・追加送り | 「Cutter」と「Feed before the cut」 |
| 加熱時間、送信分割サイズ、テスト印字、全デバイスから接続、切断、未接続で「印刷」→接続して印刷 | 「Heat」、送信速度4段階、テストページ、接続ダイアログ、未接続で Print → 接続後にそのまま印刷 |
| 名前で保存（同名は上書き）・削除・書き出し・取り込み、自動保存 | My designs、Export/Import design、自動保存。旧プリセット JSON もそのまま取り込める |
| PNG / ESC/POS 書き出し、GitHub Pages | 同じ。.github/workflows/pages.yml を複製（VITE_STATIC_DEPLOY 対応） |

## 再現性
旧アプリの印刷パイプライン（内容外接矩形を 384 dot 幅へ拡大、上下 1.5 mm、前 6 mm・後 12 mm）を基準に、縮尺 0.713 で配置を変換した。旧アプリの createPrinterCanvas と inkless の印刷用ビットマップを同じブラウザで並べて描画し、ロゴ位置・文字サイズ・改行位置が一致することを目視で確認した（旧 384×1436、新 384×1417）。

## 差分
- 旧アプリは文字も含めて全体を Atkinson ディザで印刷した。inkless は文字を閾値処理、ロゴだけをディザするため文字が鮮明になる。
- Offkai の実データ取込は、参加者トークンが必要なため未検証（入力検証とエラー応答は確認済み）。
- 画面の言語は英語（旧アプリは日本語）。帳票の内容は日本語のまま。
- GitHub Pages のワークフローは複製済みだが、inkless はリモート未設定のため未公開。
