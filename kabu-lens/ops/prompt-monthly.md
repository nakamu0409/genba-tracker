# 月の成績表（毎月1日）

- スケジュール: `CRON_TZ=Asia/Tokyo 47 10 1 * *`（毎月1日 10:47）
- 毎回新しいセッションで実行、スマホ通知あり、環境はデフォルト
- `<記録帳のURL>` は、実際の指示文ではトレード記録帳のURL

## 指示文の要点
1. 記録帳（<記録帳のURL>）の settings/main、trades、settings/paper・paper_aggr・paper_trades、累計の成績（cands_stats・intraday_wide_stats・marks_stats・nextday_stats・movers_stats・kessan_stats・considered_stats）、monthly（前の月までの成績表）、weekly を読む。
2. 本番（先月に決着した売買：件数・勝ち負け・損益、ルールどおり／ルール外それぞれの損益、swing/day ごと、月末の資金と前の月との差、放置中の含み損益）。
3. 練習口座（基本・攻めの増減%、track ごとの件数・勝率・損益）。
4. 合図の成績：累計から前の月の成績表に写した累計を引いて「先月の分」。30件未満は「まだ少ない」。30件以上でプラス・マイナスがはっきりしたものを2つずつ。
5. collection "monthly" に「<YYYY-MM>」で set（real＝closed・wins・losses・pnl・avgWin・avgLoss・ruleYes・ruleNo・rulePnlYes・rulePnlNo・frozenPnl、paper＝base と aggr にそれぞれ startEquity・endEquity・pct・tracks、cumulative＝累計の写し。記録帳の「振り返り」タブの表がこの項目名を読む）。書いてよいのは monthly だけ。
6. 通知12〜18行：1行目に大事な一文 → 本番 → 練習口座 → 効いている／効いていない → 来月ひとつ考えること → 「過去の検証と本番の数字がずれ続けるときは、決まりを見直す合図。最終判断はご自身で」。
