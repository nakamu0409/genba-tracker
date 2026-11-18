---
description: 【場中の判定】5分足から今の地合い・VWAP・支えと壁・買い場かどうかを出し、記録帳にチャートを残す
argument-hint: <銘柄名か銘柄コード>（複数可。例: 7203 6758）
---

対象: $ARGUMENTS

場中（9:00〜15:30）に、5分足から「今どういう流れか」「買うならどこか」を見る。判定はスクリプトに任せ、自分で条件を足したり緩めたりしない。

1. 銘柄名しか無いときは、記録帳に同梱の universe-wide.json か株探でコードを確かめる（分からなければ本人に聞く）。
2. `node .claude/scripts/kabu-lens.mjs --intraday <コード> [...]` を実行する。
3. 1銘柄ごとに、短く伝える。
   - 何時時点か（time）と、**株価は15〜20分遅れ**であること。楽天の画面の今の値段と合わせて見るよう添える。
   - 今の値段・前日比・始値からの騰落・VWAP（今日の平均の買値）との位置。
   - 場中の地合い（regime）：TREND_UP＝上昇、TREND_DOWN＝下降、CHOPPY＝もみ合い、PANIC＝急落。日足の向き（daily_trend：25日線の上で上向きなら UP）。
   - 近い支え（supports）と壁（resistances）を2つずつ。
   - 合図（signal）と理由（reasons）をそのまま。TAKE＝買い場、WAIT＝待つ、SKIP＝見送り。
   - TAKE なら、指値の目安（limit）と場中の損切りの目安（stop_intraday）。持ち越すなら損切りは /kau の値段（日々の値幅の2倍）を使うこと。
   - 「合図はまだ試し中。過去60日の5分足では、TAKE の上乗せはほぼ無かった。急騰の追いかけ（前日比+8%以上）と急落中（PANIC）の見送りは、データでも裏付けがある」と1行添える。
4. 記録帳（Artifact の list で題名「トレード記録帳」を探す）の collection "intraday" に1銘柄1件 set する。doc_id は「<date>-<コード>-<time の : を除いた4桁>」。項目：結果の JSON の code, name（日本語の銘柄名に置き換える。Yahoo の名前は英語のため）, date, time, price, open, vwap, from_prev_pct, regime, daily_trend, supports, resistances, signal, kind, reasons, limit, stop_intraday, bars（チャート用。そのまま）と、final: false、createdAt。夜の記録が「大引けまで」「翌日まで」の答えを足す。
5. 買いたいと言われたら、必ず /kau を通す（場中の判定は /kau の代わりにならない）。
