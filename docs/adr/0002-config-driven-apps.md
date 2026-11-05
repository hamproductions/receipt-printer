# 0002 プリセットを設定駆動のアプリにする

## 状態
採用

## 決定
プリセットは src/apps/manifests/<id>.json のマニフェスト1件ずつで定義する。マニフェストは入力フィールド（text、longtext、url、date、time、number、select、toggle、list）と、要素テンプレートを持つ。テンプレートの文字列は `{{key}}`、`{{sum:list.col}}`、`{{count:list}}` で値を参照し、list は `format`（`{col:<N}` などの桁揃え、全角は2桁）で1行ずつ展開する。要素の `when` で表示条件を付ける。

値は Doc.app.values に保存し、展開は描画時に行う（src/apps/bindings.ts、tokens.ts の expandTokens 経由）。そのため利用者が要素を動かしたり書体を変えたりしても、値の変更で上書きされない。「Turn into plain text」で展開済みの文字列に固定し、アプリとの結び付きを外せる。

## 理由
- プリセットごとのコードが不要になり、JSON を足すだけで新しいアプリが増える（import.meta.glob で自動登録）。
- フォームは型から自動生成し、WebMCP ツール（inkless_list_presets、inkless_load_preset の values、inkless_set_app_values）からも同じ値で操作できる。
- 既定値は以前の固定文字列と同一で、描画結果は変わらない（全アプリの描画ハッシュで確認）。
