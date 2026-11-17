---
description: 【買う前チェック】買ってよい株数・損切りの値段を出し、ルールに反する買いを止める
argument-hint: <銘柄コード> <買う値段>（例: 7203 3100）
---

対象: $ARGUMENTS

買う前に必ず通すチェック。判定はスクリプトに任せ、自分で条件を足したり緩めたりしない。

1. トレード記録帳（Artifact の list で題名「トレード記録帳」を探す）のデータベースを ArtifactData で読む。
   - `settings/main`: capital, cash, riskPct, maxPosPct, maxPositions, dayTradeMax, extra（本人の決めごと）
   - `trades`: status が open のもの（保有中）。code, name, entry, last, qty。date が今日（日本時間）の記録の数が「今日すでに買った回数」
2. 次の形のファイルを作る（スクラッチパッドに置く）:
   `{"settings": {capital, cash, riskPct, maxPosPct, maxPositions, dayTradeMax}, "positions": [{code, name, entry, last, qty}], "buysToday": <回数>}`
   今日の買いの回数が記録帳から分からないとき（記録していない売買がありそうなとき）は、本人に「今日は何回買いましたか」と1回だけ聞く。
3. `node .claude/scripts/kabu-lens.mjs --check <コード> <買う値段> --state <そのファイル>` を実行する。
4. 結果を次の順で伝える。
   - **止める理由（blocks）があれば、最初に「このチェックでは買わない判定です」と書き、理由をそのまま並べる。** 「それでも買うなら」という抜け道は示さない。
   - ok が true なら: 買える株数（shares_100_unit。0 なら mini_shares_max の1株単位の株数）、買う金額（cost_jpy）、損切りの値段（stop）と、損切りになったときの損失額（loss_if_stopped_jpy）、目標の目安（target_3r。損切り幅の3倍）、何が上限になったか（limited_by）。
   - 注意（warnings）をそのまま並べる。
   - 決算発表予定日（earnings_date）。null なら「確認できず」。
   - settings.extra の決めごとのうち、この買いに関係するもの（例: 「◯◯まで新しく買わない」）があれば、それも止める理由として書く。
5. 記録帳の collection "considered" に1件 set する（あとで「買おうとした銘柄がその後どうなったか」を集計するため）。doc_id は「<今日の日付 YYYY-MM-DD>-<コード>」（同じ日に同じ銘柄を2回チェックしたら上書き）。項目：code、name、date、price（買う値段）、stop（出た損切り）、decision（止める理由があれば "blocked"、無ければ "passed"。本人が買ったと言ったら "bought" に update する）、source: "kau"、reason（止めた理由の要約。無ければ空）、final: false、createdAt。夜の記録がそのあとの値動きを足していく。
6. 買うと決めた場合に備えて、最後に一言添える: 「買ったら、損切りの逆指値（◯円以下で成行）を同時に入れて、記録帳に1件追加してください。記録が無いと、1日の回数の歯止めが効きません」。
7. 買う・買わないの最終判断は本人。断定的な推奨はしない。ただし blocks は本人が決めたルールなので、弱めずに伝える。
