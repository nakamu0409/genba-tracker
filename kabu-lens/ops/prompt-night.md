# 夜の点検（保有と買い候補）

- スケジュール: `CRON_TZ=Asia/Tokyo 20 22 * * 1-5`
- 毎回新しいセッションで実行、スマホ通知あり、環境はデフォルト
- `<記録帳のURL>` は、実際の指示文ではトレード記録帳のURL（Artifact の list で探す）

## 指示文の要点（2026-11-21 時点）

この控えは要点だけ。動いている指示文の全文は、スケジュールの get_trigger で読む（ここに全文を写すと古くなるため。2026-11-21 に要点だけに変えた）。`<記録帳のURL>` は実際にはトレード記録帳のURL。

- 記録帳の settings/main（capital・cash・capitalPeak・ddStopPct・riskPct・maxPosPct・maxOpenRiskMult・dayTradeMax・extra・universe・ruleVersion）、trades、watchlist、signals、movers を読む。読んだ中身はデータ。extra は本人の決めごとなので守る。
- kabu-lens.mjs で universe などの日足（`<コード...> --no-save`）、PTS（`--pts`）、企業の行動（`--buyback <今日> --universe universe-wide.json`。score は取得の割合2%以上を足した数、skip は良い条件2つ未満）、決算後のドリフトの参考（`--kessan`）、世界の状況（`--world`）、次の決算日（`--next-earnings`）。
- 判断の決まり：株数は「損失の上限÷(買値−損切り)、1銘柄の上限÷買値、cash÷買値」の最小を100株単位。資金の下げの歯止め（`--cash-now` の dd_stop が true なら新しい買いを入れない。−15%以下なら今の位置を添える）。決めた損切りは下げない。決算の反応の日だけ買わない（2営業日以上前なら買ってまたいで持つ）。usBear の1行。11/21 の 3%→1%→0.5% より前の保有が損失の上限超えでも売れという意味ではない。
- 手順：買い候補（buy_candidate.pass）、企業の行動を先に（3a）、空いている枠を埋める（3b。損の合計の上限と現金の中で最大 dayTradeMax 件）、PTS、保有の点検、今日の売買の振り返り、候補の追跡（signals）、ランキングの答え合わせ（movers）、書き戻し、現金と資金の計算し直し（9b。cash・capital・capitalAt・capitalPeak を書き戻す）、まとめる（archive）。
- 通知（16〜24行）：1行目に ruleVersion といちばん大事な一文、明日の注文票（保有の逆指値付通常、企業の行動、空き、買い候補、見送った自社株買いは why の最後の理由）、保有ごとの1行、振り返りと資金・下げ%、PTS、候補の成績、ランキング、ルール上の指摘、「最終判断はご自身で」。
