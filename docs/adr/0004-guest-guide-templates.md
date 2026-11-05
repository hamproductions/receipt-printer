# 0004 ゲストガイド: 独自フィールド、テンプレート、文字の収まり、セクション

## 決定
- **フィールド**: デザインごとに `fields` を持てる（組み込みプリセットのフィールドと合算）。型は text / longtext / date / time / password / url / number / toggle / list。`required`（印刷前に未入力を止める）、`perGuest`（テンプレート保存時に空にする）を持つ。値ごとに「Leave blank to handwrite」で記入欄（＿）として印字でき、必須扱いを満たす。
- **プレースホルダー検出**: 文字・QR・バーコード内の `{{key}}` で未定義のものを一覧し、名前から型を推定して一括作成する（date / arrival / departure → 日付、pin / password / code → パスワード）。
- **テンプレート**: 「Save as template」で localStorage の My templates に保存（レイアウト、フィールド、固定値）。My templates から開くと perGuest のフィールドが空の新しいコピーになる。「Update template」で上書き。送信したコピーは「Sent to printer」に残る。
- **Wi-Fi QR**: `{{wifi:key}}` で `\ ; , : "` をエスケープする。本文の表示と QR の値は同じフィールドから作る。
- **文字の収まり**: 文字要素ごとに Wrap and grow（既定）/ Shrink to fit box / One line, shrink。実際に読み込んだフォントで測り（日本語含む）、箱より長い単語はハイフン位置、次に文字単位で折る。
- **押し下げ**: フィールド値で伸びた文字は既定値との差で下の要素を押し下げる。プレーン文字の編集でも下の要素を移動する。
- **Check**: 最小サイズでも収まらない文字、実際のインク範囲が重なる要素、紙の外に出る要素を一覧し、紙面に赤枠と「Cut off in print」を表示。印刷時は一度確認を求める。
- **セクション**: 要素の `group` と `role`（heading / body）。クリックでセクション全体、もう一度クリックで単体を選択。行間、左右余白、揃え、見出し・本文の書体とサイズ（全セクションへ一括適用可）。Welcome、Stay details、Wi-Fi、Room access、House rules、Appliances、Departure checklist を用意し、必要なフィールドも同時に作る。アイコンは線画で描く。
- **表示**: 「Fit paper」（紙全体）と「Actual dots」（1 dot = 画面 1 ピクセル）。スクロールで見えていないだけの部分は「More paper below…」、印刷で切れる部分は赤表示で区別する。印字幅と拡大の有無を常に表示。
- **状態表示**: Saved / Printer not connected / Sending N% / Sent N KB at HH:MM. Check the paper.。送信完了を印刷完了とは表示しない。
