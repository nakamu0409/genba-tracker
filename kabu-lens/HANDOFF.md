# 株の仕組みの引き継ぎメモ

別のセッション・別のモデルでも続きができるように、仕組みの全体と決まりをまとめたもの。2026年11月16日時点。
株の作業を始める前に、まずこれを読む。

## 絶対に守ること

- **このリポジトリは公開されている。** 保有銘柄・株数・買値・資金の額・記録帳のURLをリポジトリに書かない（コミットしない）。それらは記録帳のデータベースにだけ置く。
- 作業ブランチは `claude/adoring-clarke-yc84j3`。頼まれない限りプルリクエストは作らない。
- 売買の推奨を断定しない。最後に決めるのは本人。数字は推測で埋めない。計算は暗算せずスクリプトで行う。
- 検証していないルールを「勝てる」と言わない。新しい考えは `kabu-lens/research/` で過去データにかけ、期間の前半・後半の両方で同じ傾向かを確かめてから採用する。

## 使う人

日本語で話す。日本株の短期売買（スイング中心、デイトレも少し）を練習中。楽天証券・現物のみ。日中は画面を見られることが多い。
細かいところは「任せる」と言うことが多いので、質問を重ねず、おすすめを決めて進めてよい。説明はやさしい日本語で、専門用語には一言説明を付ける。

## 全体の形

| もの | 場所 | 役割 |
|---|---|---|
| 株レンズ（計算の本体） | `.claude/scripts/kabu-lens.mjs` | 株価を取り、スコア・買い候補・PTS・危険度を出す |
| テスト | `tests/stock/kabuLens.test.ts` | `npx vitest run tests/stock` |
| コマンド | `.claude/commands/`（chart, kiken, kessan, bear, comps, dcf, thesis, catalysts, earnings, theme, stock-research） | 5ステップの銘柄調査と、チャート・危険度 |
| 検証 | `kabu-lens/research/`（日足）、`kabu-lens/research/day/`（1時間足） | ルールを過去データで確かめる。結果は各 README.md |
| トレード記録帳 | claude.ai のアーティファクト（題名「トレード記録帳」） | 保有・資金・ルール・買い候補の追跡。データベース付き |
| 定期実行 | Claude のスケジュール（3つ） | 朝・昼・夜にスマホへ通知 |

### 株レンズの使い方

```bash
node .claude/scripts/kabu-lens.mjs 7203 6758      # 日足の分析（kabu-lens/v1 のJSON）
node .claude/scripts/kabu-lens.mjs --now 7203     # 今の株価（15〜20分遅れ）
node .claude/scripts/kabu-lens.mjs --pts 7203     # PTS（夜間取引）
node .claude/scripts/kabu-lens.mjs --chase [コード] # 急騰株に飛びつく危険度。省略でランキング上位
node .claude/scripts/kabu-lens.mjs --dip [コード]   # 急落株をいま買う危険度
node .claude/scripts/kabu-lens.mjs --movers        # 値上がり・値下がりの両方（各20銘柄、材料ニュースつき）
node .claude/scripts/kabu-lens.mjs --movers-result recs.json [--stats stats.json]  # 昼の記録の答え合わせ
node .claude/scripts/kabu-lens.mjs --check 7203 3100 --state state.json  # 買う前チェック
node .claude/scripts/kabu-lens.mjs --backtest 7203 --trades
node .claude/scripts/kabu-lens.mjs --evaluate signals.json   # 買い候補の「買っていたら」の答え合わせ
```

- 株価は Yahoo Finance（query1/query2.finance.yahoo.com）、PTSとランキングは株探（kabutan.jp, s.kabutan.jp）。
- 2026年11月17日に、クラウド環境（デフォルト）のネットワーク設定へ次を足した。まだスクリプトには組み込んでいない。どれも curl にブラウザの User-Agent を付けて取る。
  - **松井証券** finance.matsui.co.jp: 銘柄ページ `/stock/<コード>/index`（ほかに `/daily_bar/`・`/news/`・`/settlement/`）、ランキング `/ranking-rise/index`（値上がり）、`/ranking-day-trading-morning/index`（デイトレ適性。売買代金と値動きの大きい株。表は1つで、順位・銘柄・現在値・出来高・売買代金・株価変動率）、`/ranking-tick/index`、`/ranking-industry-rise/index`。決算発表スケジュール `/find-by-schedule/index` は表が中身なしで返る（画面の中で読み込む形らしい）。ログインが要る板情報などは取れない。
  - **TDnet（適時開示の公式）** www.release.tdnet.info: `/inbs/I_list_001_YYYYMMDD.html`（その日の開示一覧。時刻・コード・会社名・表題。続きは `_002`, `_003`…）。過去約1か月まで。
  - **IR BANK** irbank.net: `/<コード>/results`（年度ごとの業績。約10〜20年。`-L` で転送を追う必要がある）、`/<コード>/ir`（適時開示の一覧。今年ぶんだけで、昔へは日ごとにしかさかのぼれない）、`/<コード>/pl`（1Q だけの決算履歴）。四半期ごとの発表日を長く取る方法は見つからなかった。robots.txt は検索ページ以外を許可。IR BANK には MCP の接続（IRBANK Connect、無料・本人確認あり）もある。
  - **株予報** kabuyoho.jp: `/sp/reportTop?bcode=<コード>`。決算・業績の分析。
  - **JPX** www.jpx.co.jp: 銘柄一覧など。
  - **みんかぶ** minkabu.jp: 許可したが、サイト側が 403 で断る。使えない。
- 日経、TradingView、楽天証券・松井証券の口座（ログインが要るもの）は開けない。
- Node の fetch はプロキシを通すため、スクリプトが自分で `NODE_USE_ENV_PROXY=1` を付けて起動し直す。だめなら curl に切り替わる。
- `kabu-lens.pine`（TradingView版）は、TradingView 上での動作確認をしていない。

### トレード記録帳

- 探し方: Artifact ツールの `action: "list"` で題名「トレード記録帳」を探す。URL はリポジトリに書いていない。
- ページの元ファイルの控えは `kabu-lens/ops/trade-ledger.html`。直すときは、まず `action: "read"` で今の版を取り（本人や別のセッションが直しているかもしれない）、直して同じ URL へ公開し直し、控えも同じ内容に更新する。
- **`kabu-lens.mjs` を同梱している。** 定期実行はリポジトリを持たないので、記録帳から `Artifact read path:"kabu-lens.mjs"` でスクリプトを取って動かす。`.claude/scripts/kabu-lens.mjs` を直したら、必ず記録帳にも `files: {"kabu-lens.mjs": ...}` で公開し直す（忘れると定期実行だけ古いまま）。
- データベース（ArtifactData ツール。読み書きは本人だけ）:
  - `settings/main`: capital, cash, riskPct, maxPosPct, maxPositions, dayTradeMax, dayLossPct, extra（本人の決めごと。1行に1つ）, universe（基本の約170銘柄）
  - `settings/backtest`: 検証結果の要約
  - `cands`: 約1,150銘柄の買い候補の追跡（ID は `<code>-<date>-pass|blocked`。signals と同じ形に turnover・atrPct・dev25・rs を足したもの）。集計は `settings/cands_stats`。**おすすめの精度を上げるためのデータ**。数百件たまったら `signalsReport` の分け方で、当たる条件・外れる条件を見て、`buy_candidate` の条件を見直す（見直したら、変更前と後の両方を前半・後半で確かめる）
  - `considered`: 本人が買おうとした銘柄（ID は `<日付>-<コード>`。code、name、date、price、stop、decision＝bought／passed／blocked、source＝kau／chat／plan／trade、reason）。夜の「決算の記録」が `--considered-result` で1・5・20日後を足し、累計は `settings/considered_stats`。記録帳の「買おうとした銘柄のその後」に出る
  - `five_index`: 5分足の保存（Yahoo は60日分しか出さないので、自分でためる）。ID は日付か「開始_終了」。assetId（記録帳のファイル置き場の ID）、from、to、days、format（"day"＝{date, bars:{code:[[分,始,高,安,終,出来高]]}} / "days"＝{days:{date:{code:[...]}}}）、bytes。2026-08-20〜11-17 は週ごとのファイル、11-18 からは毎晩の「候補の記録」（手順6c、`--intraday-wide --five-out`）が1日1ファイル足す（約2.4MB。置き場の上限は1GB＝約1年5か月分）。研究に使うときは、各 assetId を Artifact の read（path に assetId）で保存し、`node kabu-lens/research/day/merge_five.mjs <ファイル...>` で five.json に戻す。記録帳は2026-11-19から assets を宣言（db のルールはそのまま）
  - `settings/intraday_wide_stats`: 場中の判定の毎晩の自動記録。days（数えた日）と groups（ALL・TAKE・TAKE_RAW（絞り込む前）・TAKE_PULLBACK・TAKE_BREAKOUT・TAKE_1030_1100・WAIT・SKIP・RECLAIM_PM・TREND_UP・CHOPPY・TREND_DOWN・PANIC・CHASE8・LOW_ALL・LOW_TAKE_RAW・LOW_STRONG_CLOSE ごとの n、sumExC＝大引けまでの全体比の合計、sumExN＝翌日まで、winC）。記録帳の「場中の判定」に、過去60日の検証の値と並べて出る。20日分たまったら、検証と同じ向きの組だけを「使える」として合図に残す
  - `intraday`: 場中の判定（/bachu）。ID は `<日付>-<コード>-<HHMM>`。intradayView の結果（price、vwap、regime、daily_trend、supports、resistances、signal、kind、reasons、limit、stop_intraday）と、チャート用の今日の5分足 bars（[分, 始, 高, 安, 終, 出来高]）。夜の「決算の記録」が `--intraday-result` で rClose（大引けまで%）・rNext（翌日の大引けまで%）を足し、累計は `settings/intraday_stats`（TAKE・WAIT・SKIP ごと）。記録帳の「場中の判定（5分足）」にローソク足・VWAP・支えと壁つきで出る
  - `settings/history`: 証券会社の取引履歴を集計したもの（銘柄ごとの損益、1日の買いの回数）。金額はここにだけ置き、リポジトリには書かない
  - `trades`: 売買の記録。status が open は保有中。entry, qty, stop, target, events, note
  - `watchlist`: 監視リスト
  - `signals`: 買い候補の追跡。ID は `<コード>-<日付>-pass|blocked`
  - `movers`: ランキングの記録。昼の ID は `<日付>-<up|down>-<コード>`、朝は `<日付>-open-<up|down>-<コード>`（`slot: "open"`）。夜が結果を足す。昼は「後場の始値→終値」、朝は「記録したときの株価→終値」（どちらも `afternoon_pct` に入る）
  - `settings/movers_stats`: 答え合わせの累計（危険度ごと・材料の有無ごとの件数など）。朝の分は中の `open` に分けて持つ。記録帳のページの「ランキングの危険度の答え合わせ」がこれを表示する
- 本人が資金や保有を変えたと言ったら、ここを更新する。

### 定期実行（7つ。日本時間）

モデル: 朝の株ウォッチと夜の点検は Opus（注文票の判断があるため）、ほかの5つは Sonnet（2026年11月17日に本人の了承で切り替え。「精度が落ちないなら」という条件つき。通知の質が落ちたら Opus に戻す）。

| 名前 | 時刻 | 内容 |
|---|---|---|
| 朝の株ウォッチ | 8:22 | **今日入れる注文**（保有ごとの逆指値・逆指値付通常注文）、保有の点検、適時開示、次の決算日、買い候補 |
| 朝のランキング（寄り付き後） | 9:36 | 9:15ごろの値上がり・値下がりランキングの危険度と材料。`movers` に `slot: "open"` で記録 |
| 昼の状況確認 | 11:47 | 相場、保有の含み損益、今朝の候補、値上がり・値下がりランキング（各20銘柄）の危険度と材料。`movers` に記録 |
| 決算の記録（上方修正の追跡） | 21:38 | 保有株の適時開示の見張り（増資などは1行目）。その日の上方修正を `kessan` に記録し、次の営業日の始値で買った場合の1・5・20日後を足す。累計は `settings/kessan_stats`。`considered`（買おうとした銘柄）と `intraday`（場中の判定）の答え合わせもここ |
| 候補の記録（約1,150銘柄） | 23:07 | `--scan-wide` で約1,150銘柄の候補（通過・見送り）を `cands` に記録し、`--evaluate` で追跡、`--signals-report` で集計して `settings/cands_stats`。さらに `--intraday-wide` で前の営業日の場中の判定を全銘柄で再現し `settings/intraday_wide_stats` に足す（2026-11-18 分から。検証期間と重ならない本番の記録）。その日の5分足を記録帳のファイル置き場に保存し `five_index` に足す。通知なし |
| 週の振り返り（金曜） | 金 20:13 | 1週間の売買・ルールを守れたか・仕組みの成績。`weekly` に記録 |
| 夜の点検（保有と買い候補） | 22:20 | **明日の注文票**（保有の注文と、買い候補の指値・逆指値。逆指値が値幅制限の外なら下限の1円上。note の「終値が◯円を超えたら損切りを上げる」作戦を点検。`frozen` の保有は「放置」と1行）、今日の売買の振り返り、買い候補の判定と追跡、ランキングの答え合わせ、書き戻し |

- `list_triggers` で名前から探す。どれも「毎回新しいセッション」「環境はデフォルト」「スマホ通知あり」。
- 指示文を直すときは `get_trigger` で全文を取り、直した全文を `update_trigger` で送る（一部だけの差し替えはできない）。
- 指示文には銘柄・資金を書かない。すべて記録帳から読ませる。
- 指示文の控えは `kabu-lens/ops/prompt-morning.md`・`prompt-open.md`（朝のランキング）・`prompt-kessan.md`（決算の記録）・`prompt-weekly.md`（週の振り返り）・`prompt-cands.md`（候補の記録）・`prompt-midday.md`・`prompt-night.md`（記録帳のURLは `<記録帳のURL>` に置き換えてある）。指示文を直したら控えも直す。
- 名前に「旧」が付いた無効の2つは、Yahoo に繋がらない環境で動いていた古いもの。消さずに置いてある。

## 実装のくわしい中身

### `.claude/scripts/kabu-lens.mjs`（約1,100行。外部ライブラリなし、Node だけで動く）

上から順に次の部品が並んでいる。数字の既定値はすべて先頭の `DEFAULTS` にあり、検証で決めた理由がコメントで書いてある。

| 部品 | 関数 | 内容 |
|---|---|---|
| 指標 | `sma` `ema` `rma` `rsi` `atr` `dmi` `percentRank` | TradingView と同じ計算（RSI・ATR は RMA）。データが足りない位置は null |
| 分析 | `analyze(bars, bench, info, options)` | 日足の配列から `kabu-lens/v1` のパケットを作る。この関数が本体 |
| 追跡 | `evaluateSignal` `summarize` `exitFor` | 候補の翌営業日の始値で買ったとして、損切り・目標・期限のどれで終わったかを R（損切り幅の何倍か）で出す |
| 検証 | `backtest` | 1銘柄の過去の買いシグナルをまとめて追跡する |
| 株価 | `fetchYahoo` `parseYahoo` | Yahoo の chart API（`/v8/finance/chart/<コード>.T`）。取引時間中は今日の足を外す。株価は0.1円に丸める |
| 今の株価 | `fetchNow` `parseYahooNow` | `--now`。日経平均・TOPIX連動ETF（1306）と、上げ・下げの上位 |
| PTS | `fetchPts` `parseKabutanStock` `parseKabutanRanking` | `--pts`。株探の個別ページとPTSランキング |
| 危険度 | `chaseRisk` `dipRisk` `chaseFeatures` `parseKabutanMovers` `parseKabutanNews` `fetchChase` | `--chase`（値上がり）`--dip`（値下がり）`--movers`（両方）。株探のランキングと銘柄ニュース＋Yahoo の1時間足 |
| 広い候補と成績 | `scanCandidates` `candidateRow` `signalsReport` | `--scan-wide <一覧.json>`（約1,150銘柄を1〜2分）、`--signals-report <候補.json>`（形・理由・スコア・過熱度・地合い・株価帯・売買代金ごとの平均Rと勝率） |
| 買おうとした銘柄 | `consideredOutcome` `consideredResult` `mergeConsideredStats` | `--considered-result`。記録したときの値段から1・5・20日後、途中の安値、損切りに届いたか |
| 答え合わせ | `afternoonResult` `moversResult` `mergeMoverStats` `summarizeMoverStats` | `--movers-result`。昼の記録に後場の結果を足し、危険度ごとの累計を出す |
| 次の決算日 | `fetchNextEarnings` `estimateNextEarnings` `parseIrbankHistory` | `--next-earnings <コード...>`。株探の予定日、無ければ IR BANK の過去の発表日＋364日の見込み（`estimated: true`）。買う前チェックも使う |
| 適時開示 | `fetchTdnet` `parseTdnetList` `tagTdnet` | `--tdnet [YYYYMMDD] [コード...]`。DILUTION・DANGER・LOSS・REVISION・TOB などの印。`flagged` が注意の要るもの |
| 松井のランキング | `fetchMatsuiRanking` `parseMatsuiRanking` | `--matsui [day-trading-morning\|rise\|tick]`。`--movers` にも `daytrade` として入る |
| 決算の見出し | `fetchKessan` `parseKabutanKessanList` `classifyKessan` `kessanOutcome` `kessanResult` `mergeKessanStats` | `--kessan [YYYYMMDD]`（その日の決算・業績修正の見出しを分類つきで取る）、`--kessan-result`（上方修正の記録のその後と累計） |
| 値動きの相関 | `returnCorrelation` | 直近60日の日々の騰落の相関。買う前チェックが保有株ごとに出し、0.7以上で「一緒に動きすぎ」、0.5以上で「やや一緒に動く」と警告（止めはしない） |
| 株が増える資金調達 | `parseDilution` `summarizeDilution` `fetchDilution` | IR BANK の適時開示一覧（`/<コード>/ir`、リンクの title に表題と提出日時がある）から、行使価額修正条項付の新株予約権（MSワラント）・転換社債・第三者割当の新株を拾う（ストック・オプションと訂正は除く）。買う前チェックが警告を出す（止めはしない）：直近30日に大量行使・行使完了＝「強い注意」、行使完了前＝「残っている」、5年で2回以上＝「くり返す会社」。2026年10月のウインテスト（急騰の天井で第13回の大量行使→行使完了→下落）がきっかけ（本人の希望、11月18日） |
| 場中の判定 | `intradayView` `intradayContext` `splitFiveMin` `fetchIntraday` `intradayOutcome` `intradayResult` `mergeIntradayStats` | `--intraday <コード[:今の値段]...>`（遅延を埋めるため、本人が楽天で見た今の値段を「:値段」で渡すと5分足の後ろにつないで判定し直す。本人の楽天のスクショからも値段と板を読む）：Yahoo の5分足（15〜20分遅れ）から VWAP、短い平均（9本・20本）、寄り30分の高安、支えと壁、場中の地合い（TREND_UP / TREND_DOWN / CHOPPY / PANIC）、日足の向き（25日線の上下と傾き）、合図（TAKE＝押し目かブレイク / WAIT / SKIP＝日足が下向き・急落中・前日比+8%以上）。TAKE は 2026-11-19 から絞り込みあり（10:30〜13:00、VWAP から+1.5%未満、始値から−1〜+4%、9本と20本の平均の差0.5%未満、1日の値幅が株価の4%未満、25日線から+10%未満。外れたら WAIT にして理由を出し、`raw_take` に元の形）。研究の README に根拠。`/bachu` が使う。`--intraday-result` で答え合わせ。`--intraday-wide` は全銘柄の1日分を再現して数える（`intradayWideDay` `mergeIntradayWide` `fetchIntradayWide`）。目印 `marks`：RECLAIM_PM＝後場に VWAP を取り戻した形（合図とは別。検証で翌日まで+0.2%ほど）。LOW_STRONG_CLOSE＝低位株・荒い株（前日終値500円未満か、1日の値幅が4%以上。`low_group`）の強い引け（14:30以降・前日比+20%以上・VWAPの上・値幅の上3割・直近3本が張り付いていない。1時間足3年で翌日13時まで全体比+4.2%、139回。研究 README の「強い引け」）。`--intraday-replay <コード> <日付>` で、ある日を30分ごとに再現。Yahoo の5分足は 9:00 の足が欠けることがあるので始値は日足の値を使う |
| 買う前チェック | `preTradeCheck` `parseKabutanEarningsDate` `businessDaysBetween` | `--check <コード> <値段> --state <状態.json>`。株数・損切り・止める理由を出す。`/kau` が使う |
| 通信 | `fetchText` `fetchJson` | fetch が失敗したら curl で取り直す |
| 入口 | `main` `runBacktest` `evaluateFile` | コマンドの引数を見て振り分ける |

`analyze` が出すパケットの主な項目（例は `kabu-lens/sample_packet.json`）:

- `regime`: 地合い。TREND_UP / TREND_DOWN / RANGE / HIGH_VOLATILITY（ATR% が過去250本の上位10%）
- `scores`: 買いスコア（トレンド・モメンタム・出来高・週足・対TOPIX、各20点）。点の付け方は `kabu-lens/README.md`
- `overheat`: 高値づかみ危険度（0〜100）。60以上で買いシグナルを止める
- `setup` / `event`: BUY_SETUP（買いの形が出た）／BUY_BLOCKED（出たが止めた）など。種類は PULLBACK（押し目）・BREAKOUT・MOMENTUM
- `trade`: ルールどおりに買っていた場合の仮の売買の状態。実際の保有とは関係ない
- `gap_up`: 好材料の窓開けかどうか
- `buy_candidate`: `{pass, kind, why_not, entry_ref, stop, target, hold_days, exit_rule}`。**夜の点検はこれをそのまま使う**（AI に判定させない）。pass の条件は「買いの形が出た日（または GAP）で、下降トレンド・荒れた地合い・過熱でなく、25日線からの乖離が8%以下」
- `candle` `recent_candles` `trend` `relative_strength` `range_52w` `structure` `levels` `earnings`（決算日はデータに無いので null）

押し目の条件には「長期線が10本前より上（上向き）」が入っている。横ばいの相場で押し目が出てしまう不具合を直したもの。Pine 版にも同じ条件がある。

### 買い候補の追跡（「買っていたらどうなったか」）

1. 夜の点検が、対象銘柄（保有・監視リスト・`settings.universe`）を `kabu-lens.mjs` にかけ、`buy_candidate` を記録帳の `signals` に書く（pass と、止められた blocked の両方）。
2. 次の夜から、`--evaluate` で各候補のその後を出し、同じ文書に結果（結果の種類、R、%）を書き戻す。
3. 買う値段は翌営業日の始値。始値が候補の終値より2%以上高ければ「買わない」。損切りは終値 − 2×ATR。目標は損切り幅の3倍、最長40営業日。GAP は目標なしで40営業日。
4. 記録帳のページが `signals` を読んで、種類ごとの成績を表示する。

### 急騰株の危険度（`chaseRisk`）

入力は6つ: 今日の上げ%、株価、出来高が普段の何倍か、今日の高値からの%、直前5日の上げ%、普段の1日の値幅%。点の付け方:

| 特徴 | 点 |
|---|---|
| 今日の上げ | 10%以上 8、15%以上 15、20%以上 25 |
| 株価 | 300円未満 12、100円未満 25 |
| 出来高 | 普段の10倍以上 6、30倍以上 20 |
| 高値から | 3%以上下 5、5%以上下 12、8%以上下 25 |
| 直前5日 | 15%以上 12、30%以上 25 |
| 普段の値幅 | 5%以上 8、8%以上 20 |

合計（上限100）が 15未満は LOW、35未満は MID、35以上は HIGH。出力には過去の検証の数字（`history`）も付く。根拠と限界は `kabu-lens/research/day/README.md`。

### 急落株の危険度（`dipRisk`）

前場に5%以上下げた株を後場に買った場合の検証から作った。**反発しやすい特徴は見つからず**、「さらに崩れやすい特徴」にだけ点を付けている: 10%以上の急落 8／株価100円未満 25／安値から3%以上戻している 5・5%以上 20／直前5日で+15%以上 8・+30%以上 25・−15%以下 12／普段の値幅5%以上 8・8%以上 20。区切りは急騰と同じ（15・35）。日経平均が−2%以下の日（相場全体の崩れ）は、点数があてにならない（`market_wide_selloff`）。

### 材料ニュース

株探の銘柄ニュース（`/stock/news?code=`）から、前営業日15時以降の見出しを最大3つ取る。自動のテクニカル記事・まとめ記事・英語の開示は外す。上げ材料か下げ材料かは、通知を書く側が見出しから判断する。**点数には入れていない**（`has_news` を記録して、答え合わせで差を見る）。

### 検証スクリプト（`kabu-lens/research/`）

- `fetch.mjs`: `codes.json` の銘柄の日足10年分を取り `bars.json` に保存（大きいのでコミットしない）
- `study.mjs`〜`study5.mjs`: 買い方・売り方・地合いの見送り・窓開け・逆張りなどの比較。`fetch_sector.mjs`: 業種の強弱
- `day/fetch_intraday.mjs` `day/study_day.mjs` `day/score_day.mjs`: 1時間足で、急騰株に昼から飛びついた場合と危険度スコアの検証
- どれも、期間を前半・後半に分けて両方で同じ傾向かを見る。片方だけ良いものは採用しない
- ESLint の対象から外してある（`eslint.config.mjs`）

### 5ステップのコマンド（`.claude/commands/`）

- `/bachu <銘柄...>`：場中の判定（`--intraday`）。結果を伝えて記録帳の `intraday` に残す。買うなら必ず `/kau` も通す

`/theme`（探す）→ `/kessan`（読む）→ `/bear`（疑う）→ `/comps` `/dcf`（値付け）→ `/chart`（タイミング）→ `/thesis` `/catalysts` `/earnings`（記録）。`/stock-research` が通しで実行する。
結果は `stock-research/<銘柄名>/` に Markdown で残す。`/chart` は `kabu-lens/AGENT_PROMPT.md` の読み方に従う。`/kiken` は危険度。
銘柄の調査メモ（公開情報の整理）はリポジトリに置いてよい。本人の保有・株数・買値は書かない。

### トレード記録帳のページ（`kabu-lens/ops/trade-ledger.html`）

並び（2026年11月17日に整理）: 資金とルール（今日の買い ◯/2回）→ 保有中 → 売買の記録（取引履歴の実現損益の一言つき）→ 週の振り返り（`weekly`）→ 監視リスト →「仕組みの成績」（買い候補の成績・ランキングの答え合わせ・決算・修正のその後）。閉じたフォームが表示されたままだった不具合は `[hidden] { display: none !important; }` で直した。

1つの HTML ファイル。`window.claude.use("db")` でデータベースにつなぎ、`trades`・`watchlist`・`settings/main`・`signals` を読み書きする。公開するときの設定:

- capabilities: `db`、ルールは `[{path: "", read: "owner", write: "owner"}]`（本人だけ読み書き。ページ自体はリンクを知っていれば開けるが、データは見えない）
- files: `{"kabu-lens.mjs": <.claude/scripts/kabu-lens.mjs のコピー>}`（contentType は text/javascript）
- capabilities を使う前に `artifact-capabilities`、ページを書く前に `artifact-design` のスキルを読む

### ゼロから作り直す場合の順番

1. `npx vitest run tests/stock` が通ることを確かめる（スクリプトは壊れていないか）。
2. クラウド環境のネットワークで、query1.finance.yahoo.com・query2.finance.yahoo.com・kabutan.jp・s.kabutan.jp を許可する（`update_environment`。本人の承認が要る）。
3. `kabu-lens/ops/trade-ledger.html` を上の設定で公開する。本人に資金・保有を聞いて `settings/main` と `trades` に入れる。`universe` は `kabu-lens/research/codes.json` を元にする。
4. `kabu-lens/ops/prompt-*.md` の指示文で、`<記録帳のURL>` を実際のURLに置き換えて、定期実行を3つ作る（`create_trigger`、`create_new_session_on_fire: true`、通知は push）。
5. 1つを手で動かし（`fire_trigger`）、通知の中身を確かめる。

## 会話の中で守ること

- **本人が銘柄について聞いたとき（「◯◯は？」）や、買う・見送ると言ったときは、記録帳の `considered` に1件入れる**（その時点の値段、decision、source: "chat"）。`/kau` は自動で入れる。あとで「判断が役に立ったか」を集計するため。
- 損失の上限 3%・1銘柄の上限 62% は、本人が「下げなくていい」と決めた（2026年11月17日）。勝手に変えない。

## 本人の売買の傾向（くわしい数字は記録帳の `settings/history`。リポジトリには金額を書かない）

証券会社の取引履歴を集計してわかったこと。

- **負けのほとんどは「下がった株の買い増し」から出ている。** 値動きの荒い低位株を、下がるたびに買い足した少数の銘柄に損失が集中している。
- **1日の買いの回数が、決めた上限を超える日が半分以上あった。**
- **勝ったのは、1回で買って待った取引。** 検証の結論（買い方より持ち方）と同じ。

だから、道具の優先順位は「良い銘柄を探す」より「ルールを破る買いを止める」。`/kau`（買う前チェック）はそのためのもの。止める理由（blocks）を弱めたり、抜け道を示したりしない。

記録帳に入っていない売買が多かったので、記録帳の数字だけで成績を語らない（一度、実態より良い成績を伝えてしまった）。成績は取引履歴と突き合わせる。取引履歴は、証券会社のサイトの取引履歴の画面をPDFで保存して送ってもらうと読める（`pdfplumber` で読む。`pdftotext` は日本語の対応が入っていない。ページ全体の長いスクリーンショットは縮小されて読めない）。受渡金額だけの一覧で、株数と単価は載っていない。

## 検証でわかったこと（くわしくは research の README）

- 買い方の条件は、「いつ買っても同じ」とほぼ差が無かった。効いたのは売り方で、**長く持つほうが良い**（目標は損切り幅の3倍・最長40営業日で追跡）。
- 地合いが「荒れている」ときの見送りは残した（3年では逆効果に見えたが、10年では一貫しなかった）。
- 好材料の窓開け（GAP: 窓+2%・出来高2倍・高値引けの陽線）は追跡に採用。2,200円以下の株では弱め。
- **ただし、銘柄を約1,400に広げて確かめ直すと、窓開けの上乗せは再現しなかった（2026年11月17日）。** 追跡は続けるが「効く」とは言わない。上げたあと（直前20日で+10%以上）の窓開けは基準より悪く、見送る理由になる。下げたあとの窓開けは良く見えるが、年ごとに一貫せず、銘柄の選び方（消えた株が入っていない）で良く出ている疑いがあるので採用していない。**「下がっている株を買う」根拠にしない。**
- **決算が良かった株を翌日に買っても、長く持つ成績は基準と変わらなかった（約2年・1.1万件。2026年11月17日）。** 上方修正の直後5日だけ少し良い（約0.7%の上乗せ）。上方修正で最初に+12%以上反応した株は5日で+4.3%だが、回数が少なく、まだ根拠にしない。
- **年度の業績の増減（IR BANK、約10年・3,800件）も、本決算のあとの株価と関係が無かった（2026年11月17日）。** 決算の良し悪しは発表のあとすぐ織り込まれる。
- **決算・修正への最初の反応が+12%以上の株が上がりやすく見えたのは、ストップ高に張り付いて買えなかった日のせいだった（訂正済み）。** 張り付いて買えなかった日を除くと超過5日は約+0.4%で、手数料を引くと残らない。直近60日では買えた21件が −3.7%。買う根拠にしない（research の README の「訂正」と「訂正の訂正」）。日足で検証するときは、1日じゅう値幅が無い日だけを「買えなかった」として除く（始値＝高値の日は、高く始まって下げただけで買えるので除かない）。
- 記録帳の trades に `frozen: true` が付いた保有は、本人が「損切りせず放置する」と決めたもの（2026年11月18日に初めて使用）。status は open のまま保有中に表示するが、資金の合計（settings.capital）・銘柄数・/kau の positions には数えない。損切り未設定の警告は止めない。
- 業種の強さは、一貫した関係が無かったので組み込んでいない。「Aが上がったら翌日Bが動く」の先回りは、夜のうちの情報が寄り付きに織り込まれるので狙わない（本人と相談して、2026年11月17日）。銘柄どうしの相関は、勝つためではなく、同じ方向に動く株を重ねて持たないための警告に使う。逆張りは利幅が小さすぎて不採用。
- 昼の急騰株への飛びつきは、平均ほぼ0%・勝率47%。「勝てる特徴」は無く、「危ない特徴」だけあった → 危険度スコア（`chaseRisk`）。**「低」は安全という意味ではない。**

## 続きでやること・決まっていないこと

- 昼のランキング（値上がり・値下がり各20銘柄、材料つき）と、夜の答え合わせは 2026年11月17日 が初回。昼に `movers` へ記録できたか、夜に後場の結果が書き戻されて `settings/movers_stats` ができたかを確認する。
- 答え合わせがたまったら（目安は各30件以上）、危険度ごとの「3%以上下げた割合」が過去の検証どおりかを見る。材料あり・なしで差があれば、そのとき初めて点数に入れることを検討する（今は材料を点数に入れていない。過去のニュースのデータが無く、検証できないため）。
- **朝のランキングの点数は、直近60日でしか確かめていない。** 点の付け方は昼と同じで、通知に出す「過去の結果」だけ朝用（`OPEN_HISTORY`、`--movers --open`）。点数の向きは朝でも合っていたが、朝は「低」でも3%以上下げる割合が13〜17%と高く、中と高の差は小さい（`research/day/README.md`）。15分足は60日分しか取れないので、数か月後に `fetch_open.mjs` で取り直して、同じ傾向かを確かめる。答え合わせ（`movers_stats.open`）とも見比べる。
- 夜の指示文は朝の記録について書いていない（`--movers-result` の出力の `morning_slot` と `note` を読んで報告する想定）。夜の通知に朝の分が出ていなければ、夜の指示文の手順8に一言足す。
- 夜が読む `movers` は1日100件まで（昼40＋朝40＝80件）。ランキングをさらに広げるなら、夜の指示文の limit も上げる。
- 夜の点検は 2026年11月16日 22:20 が初回。追跡の書き戻しがうまく動いたか、翌日に確認する。
- 追跡がたまったら（目安は30件以上）、候補の種類ごとの成績を見てルールを見直す。
- 決算発表予定日は、株探の銘柄ページに載っているときだけ取れる（発表が近い時期だけ出るらしい）。載っていなければ null で、「遠い」という意味ではない。朝と夜の定期実行にはまだ組み込んでいない。
- 記録帳のページの「資金とルール」に「今日の買い ◯/2回」を出す（その日の date の trades を数える。上限で警告）。記録を入れないと数えられない。ページには「上方修正のその後」（`settings/kessan_stats`）の表もある。
- **適時開示の見張り（保有株）は、決算の記録（21:38）に入れた（2026年11月18日から）。** `--tdnet <日付> <コード...>` の flagged が出たら通知の1行目に出る。
- **松井のデイトレ適性ランキングは、朝のランキング（9:36）にだけ入れた。** 昼の状況確認の指示文はまだ変えていない（`--movers` の出力には `daytrade` と各銘柄の `in_daytrade_ranking` が入っている）。
- **決算の型は朝の通知から外した。** 21:38の「決算の記録」が、前営業日の決算・修正で反応+7%以上のものを `kessan` に記録して5日後・20日後を追う（`react12`・`react7_12`）。各30件たまったら、検証（超過5日 約+2%）どおりかを見る。外れていれば朝の通知から外す。9:36の朝のランキングの指示文はまだ変えていない（`--movers` の各銘柄には `earnings_news` が入っている）。
- **上方修正の追跡は 2026年11月17日 21:38 が初回。** 記録帳の `kessan` に記録ができたか、翌営業日に最初の反応（react）が入ったか、約1週間後に5日後の結果と `settings/kessan_stats` ができたかを確認する。確かめたいのは2つ: (a) 上方修正の直後5日は基準より良いか、(b) 最初の反応が+12%以上の株は5日後も上がるか（過去2年の検証では+4.3%、勝率約3割）。各30件たまるまで結論を出さない。記録帳のページにはまだ表示が無い。
- 本人がまだ決めていないこと: 損失の上限を変えるか／資金を追加したときの設定／保有株の損切りの値段の入力／決算をまたいだ保有株のその後の方針。くわしい中身は記録帳の `settings/main` と `trades` の note を見る。
