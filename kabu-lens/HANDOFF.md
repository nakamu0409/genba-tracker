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
  - `mite`: /mite の結果（ID は `<日付>-<コード>`）。`miteReport` の ledger をそのまま（3つの判定、スイングの指値・損切り・目標、少し長期の要点、買う前チェック）。記録帳の「総合判定（/mite）」にカードで出る。答え合わせは considered（mite_swing・mite_day を持つ）で、`mergeConsideredStats` がスイングの判定ごとの5日後（counted）・20日後（counted20）を `considered_stats.mite.swing` に数える
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

### 定期実行（9つ。日本時間）

モデル: 朝の株ウォッチ・夜の点検・月の成績表は既定のモデル（注文票やお金のまとめの判断があるため）。ほかは Sonnet（2026-11-20 本人の許可で、場中の買い場2つ・引け前の目印・精度点検も Sonnet にした。スクリプトの判定を並べるだけのもの）（2026年11月17日に本人の了承で切り替え。「精度が落ちないなら」という条件つき。通知の質が落ちたら Opus に戻す）。

| 名前 | 時刻 | 内容 |
|---|---|---|
| 朝の株ウォッチ | 8:22 | **今日入れる注文**（保有ごとの逆指値・逆指値付通常注文）、保有の点検、適時開示、次の決算日、買い候補 |
| 朝のランキング（寄り付き後） | 9:36 | 9:15ごろの値上がり・値下がりランキングの危険度と材料。`movers` に `slot: "open"` で記録 |
| 昼の状況確認 | 11:47 | 相場、保有の含み損益、今朝の候補、値上がり・値下がりランキング（各20銘柄）の危険度と材料、前場の買い場の一覧（`--scan-now`）。`movers` に記録 |
| 引け前の目印（持ち越し向き） | 14:57 | `--scan-now` で LOW_STRONG_CLOSE（低位株の強い引け）と RECLAIM_PM（後場の VWAP 奪回）が出ている銘柄を、大引け前に通知。記録はしない |
| 決算の記録（上方修正の追跡） | 21:38 | 保有株の適時開示の見張り（増資などは1行目）。その日の上方修正を `kessan` に記録し、次の営業日の始値で買った場合の1・5・20日後を足す。累計は `settings/kessan_stats`。`considered`（買おうとした銘柄）と `intraday`（場中の判定）の答え合わせもここ |
| 候補の記録（約1,150銘柄） | 23:07 | `--scan-wide` で約1,150銘柄の候補（通過・見送り）を `cands` に記録し、`--evaluate` で追跡、`--signals-report` で集計して `settings/cands_stats`。さらに `--intraday-wide` で前の営業日の場中の判定を全銘柄で再現し `settings/intraday_wide_stats` に足す（2026-11-18 分から。検証期間と重ならない本番の記録）。その日の5分足を記録帳のファイル置き場に保存し `five_index` に足す。通知なし |
| 週の振り返り（金曜） | 金 20:13 | 1週間の売買・ルールを守れたか・仕組みの成績。`weekly` に記録 |
| 精度点検（毎週土曜） | 土 10:13 | 合図の本番の成績（intraday_wide_stats・cands_stats・considered_stats・movers_stats）を検証の値と比べ、「検証どおり／ずれ／まだ少ない」を通知。`settings/accuracy_last` に記録し、2週続けてずれた組を「外す候補」にする（外すかは本人と相談） |
| 夜の点検（保有と買い候補） | 22:20 | **明日の注文票**（保有の注文と、買い候補の指値・逆指値。逆指値が値幅制限の外なら下限の1円上。note の「終値が◯円を超えたら損切りを上げる」作戦を点検。`frozen` の保有は「放置」と1行）、今日の売買の振り返り、買い候補の判定と追跡、ランキングの答え合わせ、書き戻し |

- `list_triggers` で名前から探す。どれも「毎回新しいセッション」「環境はデフォルト」「スマホ通知あり」。
- 指示文を直すときは `get_trigger` で全文を取り、直した全文を `update_trigger` で送る（一部だけの差し替えはできない）。
- 指示文には銘柄・資金を書かない。すべて記録帳から読ませる。
- 指示文の控えは `kabu-lens/ops/prompt-morning.md`・`prompt-open.md`（朝のランキング）・`prompt-kessan.md`（決算の記録）・`prompt-weekly.md`（週の振り返り）・`prompt-cands.md`（候補の記録）・`prompt-midday.md`・`prompt-night.md`・`prompt-accuracy.md`（精度点検）・`prompt-close.md`（引け前の目印）（記録帳のURLは `<記録帳のURL>` に置き換えてある）。指示文を直したら控えも直す。
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
| 場中の判定 | `intradayView` `intradayContext` `splitFiveMin` `fetchIntraday` `intradayOutcome` `intradayResult` `mergeIntradayStats` | `--intraday <コード[:今の値段]...>`（遅延を埋めるため、本人が楽天で見た今の値段を「:値段」で渡すと5分足の後ろにつないで判定し直す。本人の楽天のスクショからも値段と板を読む）：Yahoo の5分足（15〜20分遅れ）から VWAP、短い平均（9本・20本）、寄り30分の高安、支えと壁、場中の地合い（TREND_UP / TREND_DOWN / CHOPPY / PANIC）、日足の向き（25日線の上下と傾き）、合図（TAKE＝押し目かブレイク / WAIT / SKIP＝日足が下向き・急落中・前日比+8%以上）。TAKE は 2026-11-19 から絞り込みあり（10:30〜13:00、VWAP から+1.5%未満、始値から−1〜+4%、9本と20本の平均の差0.5%未満、1日の値幅が株価の4%未満、25日線から+10%未満。外れたら WAIT にして理由を出し、`raw_take` に元の形）。研究の README に根拠。`/bachu` が使う。`--intraday-result` で答え合わせ。`--intraday-wide` は全銘柄の1日分を再現して数える（`intradayWideDay` `mergeIntradayWide` `fetchIntradayWide`）。目印 `marks`：RECLAIM_PM＝後場に VWAP を取り戻した形（合図とは別。検証で翌日まで+0.2%ほど）。LOW_STRONG_CLOSE＝低位株・荒い株（前日終値500円未満か、1日の値幅が4%以上。`low_group`）の強い引け（14:30以降・前日比+20%以上・VWAPの上・値幅の上3割・直近3本が張り付いていない。張り付きの日を除いた検証は74回・平均+1.6%。研究 README の「訂正」）。`--intraday-replay <コード> <日付>` で、ある日を30分ごとに再現。Yahoo の5分足は 9:00 の足が欠けることがあるので始値は日足の値を使う |
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

- `/mite`（銘柄なし・「今日」）：今の買い場の一覧。`--scan-now`（`scanIntradayNow`、全銘柄の今の5分足を判定。約40秒）と、cands の最新日の通過（スイングの買い候補）
- `/mite <銘柄> [今の値段]`：買い時の総合判定（`--mite`、`miteReport`）。デイトレ（intradayView）・スイング（analyze の buy_candidate）・少し長期（200日線・52週・週足・決算日・資金調達と、株探の業績＝`fetchFinance`・`parseKabutanFinance`・`earningsMomentum`。検証では業績の伸びで買い時が決まらなかったので「参考のみ」。research/long/README.md）の3つと、それぞれの合図の成績（検証の値と本番の記録 intraday_wide_stats・cands_stats・backtest）、買う前チェック（preTradeCheck）をまとめる。Yahoo の日足は当日の終値が埋まるのが遅いので、5分足に新しい日があれば5分足から日足を1本作って足す（built_from_five）
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

### 検証の一覧（`settings/patterns`）
- 記録帳の「合図の成績」タブの一番上に出る。rows の1行＝1つの形：group（使える／避ける／上乗せなし／確かめ中）、name、hold、p1・p2・p3（選ぶ・確かめる・最後の確認。2年だけの検証は1年目・2年目）、unit（% か R）、verdict（good／bad／none／wait）、status（今の扱い）、note。
- 新しい検証をしたら、ここに行を足すか直す（`ArtifactData` で update）。控えは `kabu-lens/research/patterns.json`。

### 記録帳のページ（2026-11-20 に作り直し）

- 5つのタブ：今日（資金とルール・保有中・/mite・場中の判定）／売買（売買の記録・買おうとした銘柄・監視リスト）／練習口座／合図の成績（候補・買い候補・企業の行動とPTS・引け前の目印・ランキング・決算）／振り返り（週・月の成績表・精度点検）。`#today` などでタブを直接開ける。
- データの置き場所と名前は変えていない。新しく表に出したのは `settings/nextday_stats`・`settings/marks_stats`・`settings/accuracy_last`・`monthly`（項目名は月の成績表の指示文で決めた real.closed・real.pnl・real.rulePnlNo・paper.base.pct など）。
- 長い説明は各欄の「この表の見方」にたたんだ。控えは `kabu-lens/ops/trade-ledger.html`。

### 調べもののデータのしまい場所（記録帳の asset）

- `kabu-lens/research/*.json`・`day/*.json`・`swing/bench1306.json` は git に入らず、コンテナが消えると無くなる。2026-11-20 に記録帳の asset へしまった（本人の許可あり。売買の記録は asset に入れない）。
- しまい方：gzip → base64 → 14MB ごとの `.txt`（asset は `.gz` を受け付けない）。小さいファイルは `{name: base64}` の JSON 1つにまとめた。
- どの asset がどのファイルかは、記録帳の DB の `research_store`（doc_id はしまった日）。files[] に path・sha256・parts（順番どおりの asset id）か bundle。
- 戻すとき：`research_store` の最新 doc を index.json に保存 → Artifact の read（`path` に asset id）で全部落とす → `node kabu-lens/research/restore_data.mjs index.json <落とした先>`。sha256 が合わないものは書かない。
- しまい直すとき（データが増えたら月1くらい）：同じ手順で新しい日付の doc を作る。古い asset は新しい doc ができてから消してよい（容量の節約）。
- しまっていないもの：`bars.json`・`day/paper_backfill*.json`・`day/events_down.json`（取り直せる・小さい）。

### J-Quants（2026-11-20 から。本人が Free で登録）

- V2。キーは環境の通信の設定（api.jquants.com の x-api-key）に保存してあり、通信のときに自動で付く。コードやリポジトリにキーを書かない。
- Free で取れるのは 2024-08-28〜2026-08-28（2年分・最新の約12週は取れない）。1分5回まで。`equities/master`・`equities/bars/daily`・`fins/summary`（財務のまとめ。開示の日時・売上・利益・予想など）は使える。`markets/calendar` は期間外の日付だと 400。
- `kabu-lens/research/collect_jquants.mjs` が日付ごとに `fins/summary?date=` と `equities/bars/daily?date=` を取り、`research/jq_fins.json`・`jq_daily.json`・`jq_master.json` にためる（git に入らない。途中から続けられる）。全部で3〜4時間。
- 2024-08 と 2026-08 の銘柄一覧を比べると、期間中に消えた銘柄が303ある。これらを入れて検証し直すと、Yahoo の今ある銘柄だけの偏りが無くなる。
- 使い道：決算の中身（進み具合・増益率・予想の修正）と翌日・5日後の値動き（2年分）、上場廃止を含めた急騰の押し目・企業の行動の検証のやり直し。
- 全銘柄の日付ごとの日足は時間がかかりすぎた（30日分で止めた・`jq_daily.json`）。代わりに消えた303銘柄だけを銘柄ごとに取った（`collect_delisted.mjs` → `jq_delisted.json`。1分5回の上限に当たらないよう15.5秒あける）。
- 結果は `swing/README.md` の「決算の中身・世界の状況・上場廃止の銘柄」。決算後のドリフト（上方修正+20%以上で5日後+1.3%、下方修正で窓−3%以下は−1.1%）と、米国の下げ相場（S&P500 20日で−5%以下）でスイングが −0.12R になることが、前半・後半とも同じ向きで出た。どれもまだ決まりには入れていない。
- しまい場所：記録帳の `research_store/2026-11-20b`（前の分＋J-Quants・世界の指標17・決算短信1か月）。
- **スイングの候補から避ける形を外す（11/20 本人と決定・本番）**：`analyze` の `avoidChase`（既定で true）。7日続けて上げた（UP_7DAYS）・25日の単純平均から+25%以上（FAR_ABOVE_MA25）・その日に+15%以上で高値引け（LIMIT_UP_LIKE）は buy_candidate.pass を false にして why_not に理由を入れる。窓開け（GAP）にも当てる。10年の口座全体の検証（`study_combined.mjs`）で、3つの期間すべて年率が上がった唯一の変更。
- **11/20 本人と決めたつなぎ方（3つとも OK）**：
  - 練習口座に「決算後のドリフト」（track `pead`）：前の営業日に予想を+20%以上上方修正した株（株探の決算速報・universe-wide の銘柄）を寄りで買い、5日目の引けで売る。窓が+15%を超えたら買わない。寄りが前の日の終値より低ければ買わない（`peadGapMin: 0`。11/21 の `study_pead_detail.mjs` で、下げて始まった上方修正は2年とも負け）。`peadMax` 2。23:07 の `--paper-buyback` のときに自動で取る。
  - `--world`（`fetchWorld`・`worldBrief`）：前の夜の S&P500・SOX・VIX・ドル円・米金利と、10年の検証にもとづく目安の文（notes）。朝の株ウォッチの③と夜の点検の 5d で使う。
  - 米国の下げ相場（S&P500 が20日で−5%以下・`usBear`）：練習口座の基本の口座だけ `usBearSwingMax: 1`（新しいスイングを1件まで）にして、攻めの口座（制限なし）と比べる。本番の注文票は件数を変えず、1行の注意だけ。
  - 下方修正の株は、夜の点検で買い候補にしない（`settings/main.extra` にも1行）。
- **11/21 本人と決めたこと（3つ）**：
  - 決算の前に買わない決まりを緩めた。買わないのは「買う日が決算の反応の日」（前の日の15時以降か、その日の場中に決算が出る）のときだけ。`preTradeCheck` は決算が今日なら止め、1〜3営業日後なら注意だけ。夜の点検・朝の株ウォッチの指示文、`settings/main.extra` も同じに直した（根拠：`study_swing_earnings.mjs`）。
  - 練習口座の急落の反発：`crashMktOnly: true`（1306 の5日が −4%以下のときだけ）・`crashOpenMax: 2`・`crashPosPct: 5`。つられ下げは `tsurarePosPct: 10` のまま。両方の口座の params に書いた（params は PAPER_DEFAULTS と混ぜないので、新しい項目は DB の params にも書くこと）。
  - 練習口座の基本の口座（`settings/paper`）だけ `swingMaxPrice: 1500`（終値1,500円以上のスイングの候補は買わない）。攻めの口座は制限なし。
- **11/21 朝 本人と決めたこと（練習口座で試す）**：
  - 企業の行動の1銘柄の上限：基本の口座 `evPosPct: 50`、攻めの口座 `evPosPct: 70`（口座全体の検証で量を増やすと20組すべて良くなった。決算後のドリフトは maxPosPct のまま）。本番の上限はまだ変えていない。
  - 攻めの口座のスイングを「5R・60日」（`swingMaxDays: 60`）。
  - 基本の口座の「米国の下げ相場はスイング1件まで」を外した（`usBearSwingMax: null`）。夜の点検・朝の株ウォッチの usBear の1行は参考だけ（件数は変えない）。
- **11/21 本人と決定：練習口座を「案B」に**（本番はまだ変えない。練習口座で確かめてから）：
  - 基本の口座：企業の行動50%（`evPosPct: 50`）・発表前20日で上げていた順（`evOrder: 'mom'`）・TOPIX が200日線より下はスイング半分（`ma200Half: true`）・スイング5R・60日・強い引けを止める（`lowMax: 0`）。1,500円未満のスイングだけ（`swingMaxPrice: 1500`）は続ける。
  - 攻めの口座：企業の行動70%・`evOrder: 'mom'`・`ma200Half: true`・5R・60日・強い引けと急騰の追いかけを止める（`lowMax: 0`・`chaseMax: 0`）。
  - 攻めの口座は 11/21 に資金を200万円足して500万円（本人の希望・データ集め。それまでの推移にも同じ額を足した。`deposits` に記録）。現金ほぼ0円で企業の行動を買えなかったため、`swReserve: 70`（スイングは現金を資金の70%まで残す）も入れた。基本の口座は100万円のまま（本人の決定）。
  - 両方の口座に `evTurnCap: 1.5`（企業の行動の1銘柄は20日平均の売買代金の1.5%まで）を入れた（11/21）。500万円では抑えないと検証の年率を大きく見誤る（`PAIRED=turncap`）。
  - **11/21 本人と決定：練習口座を4つに**（比べるため）。`settings/paper`＝基本（案B）、`settings/paper_aggr`＝攻め（案Bを強めに）、`settings/paper_live`＝本番どおり（今の本番の決まりのまま。資金は本人の実際の額に合わせた＝リポジトリには書かない）、`settings/paper_events`＝企業の行動だけ（スイングなし・50%）。23:07 の候補の記録が `--paper3`・`--paper4`（`-name live`・`events`）で同じ日のデータで動かす。paper_trades の id は live- / events- で始まり、account が live / events。記録帳の練習口座のタブは4つのカードを2×2で出す。
  - **11/21 本人と決定：自社株買いの新しい条件を練習口座で試す**（`bbSizeRule: true`。基本・攻め・企業の行動だけの3つ。本番どおりは今の条件のまま）。開示 PDF から取得の割合を読み（`fetchBuybackPdf`・`parseBuybackPdf`）、割合2%以上を良い条件の1つに数え、2つ以上のものだけ買う。`--buyback` の出力にも `size_pct`・`score_with_size` を足した（本番の夜の注文票の買い方は変えていない）。**同じ日（11/21）に本人と決めて本番にも入れた**：`--buyback` が `skip = score_with_size < 2` で「見送り」を付ける（PDF が読めないときは、もとの良い条件だけで数える）。夜の注文票・朝の株ウォッチはこの印をそのまま使う。練習口座「本番どおり」（paper_live）にも `bbSizeRule: true` を入れた。settings/main の ruleLog と extra に1行ずつ足した。12月中旬の答え合わせでは、新しい条件で見送った銘柄の翌日の成績も確かめる。
  - **11/21 本人の希望：もしもの試算（練習口座の記録とは別）**。毎晩の `--intraday-wide ... --five-out` が、five-<日付>.json に練習口座のその日の入力（5分足以外：場中の前提 ctx・買い候補・企業の行動・usBear。`paperInputOf`）を `paper` として入れる。five は毎晩 asset に保存され five_index に assetId がある（11/24 の夜の分から paper 入り）。試算は、five_index の assetId で five を全部 read してフォルダに置き、`node .claude/scripts/kabu-lens.mjs --paper-replay <フォルダ> [--base 練習口座の状態.json] [--params '{"riskPct":5}']`（`paperInputFromFive`・`paperReplay`。--base はその口座の params から始めて --params で上書き）。結果は記録帳の collection "whatif" に set（doc_id は短い英数字。項目：name、question、basis＝"paper"（練習口座の日々）か "10y"（10年の検証）、params、summary（start、end、days、capital、equity、return_pct、cagr_pct（10年のとき）、max_drawdown_pct、tracks）、compare（{name, return_pct}：くらべる口座）、note、createdAt）。記録帳の練習口座タブの「もしもの試算」に出る。settings/paper* と paper_trades は変えない。
  - **11/21 組み合わせの探索**（`GRID=<設定> study_combined.mjs`。本人の実際の資金・evTurnCap 1.5・bbSizeRule。9項目1,728通りを前半だけ5回ずつで選び、上位15を後半・最後の確認で20回ずつ確かめた）。上位15はすべて「1回の損0.5%・200日線で半分にしない」、ほとんど「20日で上げていた順・5R・40日」。1つずつ確かめると、**1回の損0.5%だけ**が3つの期間とも今（1%）より良い（年率 前半16.3→23.8・後半22.4→28.7・直近42.9→44.6、一番下げはほぼ同じ）。上げていた順や5Rを足すと10年・前半・後半は良くなるが直近の1年は悪い（42.9→28.8〜32.4）ので、決めごと（3つとも良いものだけ）に通らない。**同じ日に本人と決めて本番を0.5%にした**（練習口座「本番どおり」も0.5%）。スイングをやらない形（直近の1年 +15.4%）や0.25%（直近 +24.3%）より、0.5%が3つの期間で良い。組み合わせ（上げていた順・5R）は練習口座で確かめる候補。
  - **11/21 まだ試していなかった形**（`swing/study_events_more2.mjs`）：優待の導入・拡充、市場変更の記念、復配、月末・月初（1306）。どれも上乗せなし・件数不足で決まりは変えない。優待の廃止のあとの窓下げからの戻り（その日 +1.1%、前半・後半とも。件数は約20ずつ）は、見続ける候補。**同じ日に本人と決めて記録だけ始めた**：`--buyback` の rows に kind "yutai_end"（`pickYutaiEnd`。skip・record_only。注文票では「見送り」の名前だけ）。候補の記録（23:07）が events に入れ、nextday_stats の組 yutai_end で翌日の寄り→引けを数える（記録帳の「合図の成績」に出る）。30件ほどたまったら判断（年10〜20件）。精度点検の指示文にはまだ入れていない
  - **11/21 その3**（`swing/study_more3.mjs`）：決算前の先回り・年末の節税売り・配当の権利取りの先回りは効かない。**連休明け**（1306 を連休の前の引けで買い、明けの日の引けで売る。年末年始を除く）は +0.31／+0.24／+0.67（ふつうの日 +0.03〜0.06）で3つの期間ともそろう。年8回ほど。**同じ日に本人と決めて練習口座で試す**：`holidayEtfPct`（基本・攻めに30。本番どおり・企業の行動だけは0）。`isPreHoliday`（次の営業日まで4日以上あく日。12/20〜1/7 は除く）の引けで 1306 を買い（資金の30%まで・空いている現金だけ）、明けの日の引けで売る（track "holiday"）。休場日は `TSE_HOLIDAYS`（2027年末まで。**毎年 JPX の休場日の一覧で足す**）。悪い知らせの検証は `swing/study_badnews.mjs`（決算と同じ日の悪い知らせは翌日も下げる。別の日で窓 −3% より下は少し戻るが弱い）。
  - **11/21 夜（本人が寝ている間）**：`swing/study_bb_size2.mjs`。取得の割合2%以上で売買代金3億円未満の自社株買いが3つの期間とも +1.0〜1.5%。同じ日はこれを先に買う（evOrder 'bbsmall'）は口座全体でわずかに良い（相談の候補。まだ入れていない）。寄指の上限 +1/+3/+5% は前半・後半で +2% と大差なく、直近の1年は上限で大きく動く（運の影響）。スイングの形をしぼる（study_combined の swKinds）：どれを外しても・1つだけにしても、3つの期間でそろって良くなるものはない（差は ±1〜2pt。今のまま全部）。曜日・月・同じ日の数も向きがそろわない（`swing/study_events_calendar.mjs`）。増配の幅は `collect_div_detail.mjs`（→ div_detail.json）・`swing/study_div_size.mjs`。
  - **11/21 運の幅と生き残りの偏り**：`MONTHLY=<cfg> study_combined.mjs` → `swing/mc_bootstrap.py`（3か月のかたまりで1万回）。今の本番の決まり（本人の資金）で、1年は真ん中 +29%・悪い10% −1%・良い10% +70%・マイナスの年11%、3年で −25% の歯止めに当たるのは10.5%。生き残りの偏り：上場廃止の会社（J-Quants 2年・売買代金1億円以上 98社）は72%が廃止の前に+15%以上上げていた（TOB など）、大きく下げての廃止は3%だけ。廃止の会社は開示の一覧が取れず企業の行動を直接は試せないが、偏りは「良い会社が抜けている」向きが主で、成績を水増ししている心配は小さい。
  - **11/21 株式分割の比率の検証**（`research/collect_split_detail.mjs` → `research/split_detail.json`（git に入れない。比率 ratio・優待 yutai・配当 div）、`swing/study_split_ratio.mjs`）。寄指で買えた分割は144件だけで、比率2が前半・後半でマイナス、5以上が3つともプラスだが件数が少なすぎる。決まりは変えない。
  - **11/21 本人の希望：日経平均先物**。`--world` の出力に nkFut（CME の円建て日経平均先物 NIY=F の今の値・時刻と、日経平均 ^N225 の最後の終値との差 vs_close_pct。`fetchNikkeiFut`・`nikkeiFutBrief`。Yahoo の15分足）。朝の株ウォッチの③に1行。先物が大きく下げていても企業の行動の寄指は取り消さない（`study_events_us.mjs`）。
  - **11/21 本人と決定：資金の下げの歯止め**。settings/main の capitalPeak（資金の一番高いとき）から ddStopPct（25）%以上下げたら新しい買いを止めて見直す（`drawdownStop`。`cashNow` が capitalPeak・drawdown_pct・dd_stop を出し、夜の点検が capitalPeak を書き戻し、dd_stop なら注文票に買いを入れない。`preTradeCheck`（/mite・/kau）も止める）。−20%くらいまでは10年の試算でも起きていた下げなので、決まりは変えずに続ける。入金したら capitalPeak にも同じ額を足す（deposits に記録し、cashBase にも足す）。11/21 に本人が入金したので capitalPeak は入金後の資金から始めた。
  - **11/21 本人と決定：見直しの決め方**。本番の決まりを変える前に、必ず今の資金で10年の試算（`WHATIF=<設定.json> node --max-old-space-size=7000 kabu-lens/research/swing/study_combined.mjs`。設定は [{id, name, cfg}]。cfg は study_combined の run の P と同じ。bbSizeRule も使える）をして、前半・後半・直近の3つとも良くなることを確かめ、記録帳の whatif に残す（試算は Claude が進めてよい。変えるかは本人が決める）。見直し日は 12/15 と3か月ごと（スケジュール「本番の決まりの見直し日」、ops/prompt-review.md）。11/21 の試算：本番（損1%）から1つだけ変えた比較では、1銘柄62%・損の合計1%×3・1日5回が一番良い位置（30%・100%・×5・2回・損2%はどれも悪い）。
  - **11/21 本人と決定：通知を整理**。場中の3つ（場中の買い場 10:56・後場 13:01、引け前の目印 14:50）は止めた（enabled: false。場中の判定・目印の記録は毎晩の候補の記録 23:07 が全銘柄で続けている）。決算の記録（21:38）は、保有株に flagged の開示がある日だけ通知し、ほかの日は記録と答え合わせだけ。平日の通知は 朝の株ウォッチ・朝のランキング・昼の状況確認・夜の点検 の4つ（ほかに金曜の週の振り返り・土曜の精度点検・月初の成績表）。古い停止中の2つ（夜の点検・朝の株ウォッチの旧版）は消した。夜の点検は、見送った自社株買いの理由（why の最後）を出すようにした。精度点検は練習口座4つを見るようにした。**ops/prompt-night.md と ops/prompt-kessan.md は、実際の指示文より古い**（11/20〜21 の変更が入っていない）。直すときは get_trigger で今の指示文を読んでから。あわせて `--buyback` の `score` を割合を足した数にした（もとの数は `score_base`）。夜の注文票の「良い条件◯つ」と、答え合わせの組 `buyback_s0〜s2`（nextday_stats）が新しい数え方になる（11/21より前の記録は古い数え方のまま混ざる。日数が少ないので大きな問題ではない）。毎週土曜の精度点検に、本番の決まりの点検として nextday_stats（自社株買い・増配・株式分割の買えた数・平均・買えた割合）を足した（`ops/prompt-accuracy.md`）。
  - `ma200Half` の判定は `below200`（1306 の2年分の日足・桁の誤りの日を除く）。11/21 時点で TOPIX は200日線より下なので、11/24 からスイングは半分で始まる。
- 場中の買い場・目印の検証し直しは `research/day/README.md` の最後。買い場は時期に左右され、VWAP 奪回はほぼ0。「買い場 × 窓 +2%以上」が強いが57日だけ。

### ゼロから作り直す場合の順番

1. `npx vitest run tests/stock` が通ることを確かめる（スクリプトは壊れていないか）。
2. クラウド環境のネットワークで、query1.finance.yahoo.com・query2.finance.yahoo.com・kabutan.jp・s.kabutan.jp を許可する（`update_environment`。本人の承認が要る）。
3. `kabu-lens/ops/trade-ledger.html` を上の設定で公開する。本人に資金・保有を聞いて `settings/main` と `trades` に入れる。`universe` は `kabu-lens/research/codes.json` を元にする。
4. `kabu-lens/ops/prompt-*.md` の指示文で、`<記録帳のURL>` を実際のURLに置き換えて、定期実行を3つ作る（`create_trigger`、`create_new_session_on_fire: true`、通知は push）。
5. 1つを手で動かし（`fire_trigger`）、通知の中身を確かめる。

## 会話の中で守ること

- **本人が銘柄について聞いたとき（「◯◯は？」）や、買う・見送ると言ったときは、記録帳の `considered` に1件入れる**（その時点の値段、decision、source: "chat"）。`/kau` は自動で入れる。あとで「判断が役に立ったか」を集計するため。
- 損失の上限・1銘柄の上限は本人が決める。勝手に変えない。11/17 に「3%・62%のまま」と決めたあと、**11/21 に本人と決めて損失の上限を1%にし、同じ日に組み合わせの探索のあと0.5%にした**（もしもの試算：実際の資金で10年、年率+14.3%→+23.5%・一番下げ−32%→−23%、前半・後半・直近とも良い。スイングが小さくなり、企業の行動に現金が回る）。1銘柄の上限は62%のまま。練習口座「本番どおり」も riskPct 1。12月中旬に、練習口座の「基本」が「本番どおり」より良ければ、本番を基本の決まりに移すか相談する。

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
- 低位株・荒い株（前日終値500円未満か、1日の値幅が4%以上）は別の決まり：場中の買い場は使わず、「強い引け（+20%以上・張り付きなし）」だけを使う。15:00〜15:25に買い、翌日に利確+5%・損切り−8%、どちらも無ければ翌日13時に売る。張り付いて買えない日を除いた検証は74回・平均+1.6%と小さい（研究 day/README の「訂正：強い引けは…」。最初は張り付きの日を数えて+4%前後と出ていた。2026年11月19日）。
- 業種の強さは、一貫した関係が無かったので組み込んでいない。「Aが上がったら翌日Bが動く」の先回りは、夜のうちの情報が寄り付きに織り込まれるので狙わない（本人と相談して、2026年11月17日）。銘柄どうしの相関は、勝つためではなく、同じ方向に動く株を重ねて持たないための警告に使う。逆張りは利幅が小さすぎて不採用。
- 昼の急騰株への飛びつきは、平均ほぼ0%・勝率47%。「勝てる特徴」は無く、「危ない特徴」だけあった → 危険度スコア（`chaseRisk`）。**「低」は安全という意味ではない。**

## 続きでやること・決まっていないこと
- **2026-11-21 のセッションの終わりに、途中のもの（次のセッションで続ける）**：
  - **自社株買いの規模**：`research/collect_bb_detail.mjs` が開示 PDF（f.irbank.net）から取得の割合・期間・方法を `research/bb_detail.json` に集めている（4,528件中 約3,600件まで。続きから再開できる。2時間で止まるので、止まったら回し直す）。途中の分は記録帳の asset にしまった（`research_store/2026-11-21-bb` に assetId。中身は {bb_detail, kronos_out}）。コンテナが新しくなったら、そこから bb_detail.json を戻してから再開する。集め終わったら `node --max-old-space-size=7000 kabu-lens/research/swing/study_bb_size.mjs`。途中では「取得の割合2〜5%は3つの期間ともプラス」「取得期間6か月超は3つの期間ともマイナス」（README の「自社株買いの規模・期間・方法」）。全部そろって同じなら、`buybackScore` に足すか本人と相談。
  - **株式分割の比率**：`research/collect_split_detail.mjs`（同じ作り）はまだ回していない。自社株買いが終わってから回す。
  - **Kronos**：30日分で「当たっていない」と判断して止めた（README）。予測の AI と PyTorch はスクラッチの kvenv・kronos（コンテナが新しくなると消える。やり直す必要はない）。Kronos のために足したネットワークの許可（Hugging Face・PyTorch の置き場所）は、本人の判断で残している。
  - 練習口座の4つは 11/24 の夜（23:07）が初回。翌朝、`settings/paper_live`・`paper_events` に history ができたか、記録帳の練習口座のタブに4つ出るかを確かめる。
- **2026-12 中旬ごろ（練習口座が約1か月たったら）**：練習口座（`settings/paper`・`paper_aggr`）と本番（`trades`）の実際の約定を、検証の想定と比べる。特に (a) 企業の行動を寄指で買えた割合と、寄値が `study_events_liquidity.mjs` の想定どおりか、(b) 案Bの各部分（evOrder・ma200Half・5R・60日・swReserve）の損益、(c) 1回ずつの平均が検証（企業の行動 +0.2〜+0.4%・スイング +0.1〜+0.25R）とずれていないか。
- **2027-02 ごろ（決算短信が3か月分たまったら）**：`archive` の `tanshin-<日付>` と `research/tanshin.json` を合わせ、営業利益の進み具合・前年比・予想の修正の有無で、翌日の窓・5日後が変わるかを確かめる（`study_fins.mjs` と同じ分け方。J-Quants の2年分と見比べる）。
- 5分足は 2026-08-20 から毎晩 `five_index`（記録帳の asset）にたまっている。半年分（2027-02 ごろ）たまったら、場中の買い場・目印（`research/day/README.md`）を確かめ直す。
- **2026-11-21 の夜の検証のまとめ**（くわしくは `research/swing/README.md` の 11/21 の節。一覧は `settings/patterns`）：
  - 1回ずつでは良いのに口座全体では上乗せにならないものが多い：急落の反発・続けて出る候補を先に買う・目標なし・損切り3×ATR。口座全体は「資金を早く回す」ほうが効く。決まりを変える前に、必ず `study_combined.mjs` の PAIRED（でたらめな順番20組）で確かめる。
  - スイングの候補は、株価1,500円未満・割安（PBR・PER が低い。ただし2年分だけ）・何度も続けて出ている株ほど1回の成績が良い。上場をやめた銘柄を足しても株価の差は変わらない。
  - 買い方は今の「次の日の寄り・終値+2%以内」で良い（下で待つ指値は損）。合図の日の引けで買うと少し良い（確かめ中）。
  - 56年の日経平均で、米国の下げ相場の間の日本株は、2010年代からはふつうと同じか良い。練習口座の「米国の下げ相場はスイング1件まで」は根拠が弱い。
  - **口座全体の成績のほとんどは企業の行動（自社株買い・増配・株式分割の翌日の寄指）から来る**（外すと年率 −12pt・20組すべて悪化）。注文票の先頭に置き、入れ忘れを防ぐことを一番大事にする。
  - 目標5R・60日は、口座全体で4つの期間すべてプラス（確かめ中。攻めの練習口座で試す案）。資金の分け方（1回1%・合計×3）は今のままが一番良い。
  - **まとめの案B**（`PKG=1 node study_combined.mjs`）：企業の行動50%・20日で上げていた順（`evOrder: 'mom'`）・TOPIX が200日線より下はスイング半分（`ma200Half`）・スイング5R・60日。10年の年率 +19%→+33%、一番下げはほぼ同じ（−20%）。練習口座の設定はすべて用意済み（evPosPct・evOrder・ma200Half・swingTargetR・swingMaxDays）。
  - 練習口座の low（強い引け）は約2年でほぼ0、chase（急騰の追いかけ）は1回 −1%（`research/day/README.md`）。外す候補。
  - 長い指数のデータ（Yahoo の chart API・period1=0）はリポジトリに入れず、スクラッチに置いて `study_index_dip_long.mjs`・`study_usbear_long.mjs` に渡す。


- 昼のランキング（値上がり・値下がり各20銘柄、材料つき）と、夜の答え合わせは 2026年11月17日 が初回。昼に `movers` へ記録できたか、夜に後場の結果が書き戻されて `settings/movers_stats` ができたかを確認する。
- 答え合わせがたまったら（目安は各30件以上）、危険度ごとの「3%以上下げた割合」が過去の検証どおりかを見る。材料あり・なしで差があれば、そのとき初めて点数に入れることを検討する（今は材料を点数に入れていない。過去のニュースのデータが無く、検証できないため）。
- **朝のランキングの点数は、直近60日でしか確かめていない。** 点の付け方は昼と同じで、通知に出す「過去の結果」だけ朝用（`OPEN_HISTORY`、`--movers --open`）。点数の向きは朝でも合っていたが、朝は「低」でも3%以上下げる割合が13〜17%と高く、中と高の差は小さい（`research/day/README.md`）。15分足は60日分しか取れないので、数か月後に `fetch_open.mjs` で取り直して、同じ傾向かを確かめる。答え合わせ（`movers_stats.open`）とも見比べる。
- 夜の指示文は朝の記録について書いていない（`--movers-result` の出力の `morning_slot` と `note` を読んで報告する想定）。夜の通知に朝の分が出ていなければ、夜の指示文の手順8に一言足す。
- 夜が読む `movers` は1日100件まで（昼40＋朝40＝80件）。ランキングをさらに広げるなら、夜の指示文の limit も上げる。
- 夜の点検は 2026年11月16日 22:20 が初回。追跡の書き戻しがうまく動いたか、翌日に確認する。
- 追跡がたまったら（目安は30件以上）、候補の種類ごとの成績を見てルールを見直す。
- 決算発表予定日は、株探の銘柄ページに載っているときだけ取れる（発表が近い時期だけ出るらしい）。載っていなければ null で、「遠い」という意味ではない。朝と夜の定期実行にはまだ組み込んでいない。
- 記録帳のページの「資金とルール」に「今日の買い ◯/2回」を出す（その日の date の trades を数える。上限で警告）。記録を入れないと数えられない。ページには「上方修正のその後」（`settings/kessan_stats`）の表もある。
- **開示の PDF は読んでよい（2026-11-20 本人の許可）。** 21:38 の決算の記録で、(3c) 保有株の DILUTION・DANGER・LOSS の開示は PDF の1〜2ページ目を読んで要点を通知に、(3d) その日の決算短信をすべて `--tanshin <日付>` で読み、`archive` の `tanshin-<日付>` に入れる。`parseTanshin` は1ページ目（pdftotext -layout）から今期の累計（売上・営業・経常・純利益と前年比）、通期予想、予想修正の有無、自己資本比率、営業利益の進み具合を取る。11/13 の40件で35件読めた（読めないのは ETF・外国株・IFRS の変わった表）。TDnet は約1か月しか残らないので、毎晩ためるのが大事。過去1か月分は `kabu-lens/research/collect_tanshin.mjs` で `research/tanshin.json` にためた（git に入らない）。ためたら「進み具合・増益率・修正の有無で、翌日の反応や5日後が変わるか」を確かめる。
- **適時開示の見張り（保有株）は、決算の記録（21:38）に入れた（2026年11月18日から）。** `--tdnet <日付> <コード...>` の flagged が出たら通知の1行目に出る。
- **松井のデイトレ適性ランキングは、朝のランキング（9:36）にだけ入れた。** 昼の状況確認の指示文はまだ変えていない（`--movers` の出力には `daytrade` と各銘柄の `in_daytrade_ranking` が入っている）。
- **決算の型は朝の通知から外した。** 21:38の「決算の記録」が、前営業日の決算・修正で反応+7%以上のものを `kessan` に記録して5日後・20日後を追う（`react12`・`react7_12`）。各30件たまったら、検証（超過5日 約+2%）どおりかを見る。外れていれば朝の通知から外す。9:36の朝のランキングの指示文はまだ変えていない（`--movers` の各銘柄には `earnings_news` が入っている）。
- **上方修正の追跡は 2026年11月17日 21:38 が初回。** 記録帳の `kessan` に記録ができたか、翌営業日に最初の反応（react）が入ったか、約1週間後に5日後の結果と `settings/kessan_stats` ができたかを確認する。確かめたいのは2つ: (a) 上方修正の直後5日は基準より良いか、(b) 最初の反応が+12%以上の株は5日後も上がるか（過去2年の検証では+4.3%、勝率約3割）。各30件たまるまで結論を出さない。記録帳のページにはまだ表示が無い。
- 本人がまだ決めていないこと: 損失の上限を変えるか／資金を追加したときの設定／保有株の損切りの値段の入力／決算をまたいだ保有株のその後の方針。くわしい中身は記録帳の `settings/main` と `trades` の note を見る。

### 2026-11-19 場中の判定の直し
- Yahoo の5分足の最後に付く「足になっていない最新の約定」と出来上がっていない足を、`splitFiveMin` で除く（`regularMarketTime` まで出来上がった足だけ）。一覧（--scan-now）と個別（--mite・--intraday）で合図がずれていた。検証（intradayReplay）と同じ扱いになった。
- `stop_intraday` は買値（limit）から1%以上離す。幅0.3%未満は75%が損切りに当たり、滑りを引くと上乗せ0だった（research/day/README.md「場中の損切りの幅」）。

### 2026-11-19 練習口座（シミュレーション）
- 仮の資金100万円で、合図どおりに買って売ったらどうなるかを毎晩数える（本人の売買とは別）。`paperNew`・`paperStep`・`paperSummary`（kabu-lens.mjs）。
  - デイトレ：場中の買い場（低位株・荒い株は除く）。見えてから20分後に指値の目安で指値、30分で約定しなければ取り消し。約定したら場中の損切りの目安に逆指値、届かなければ大引け。1日2回まで。
  - スイング：前の夜の cands（pass）を寄りで（終値の+2%以内）。損切り・目標・最長40営業日。同時に3銘柄まで。
  - 低位株の強い引け：14:30の判定で目印 → 14:50に買い、翌日 +5%／−8%／13時。1日1回まで。
  - 株数：損切りまでの損が資金の1%、1銘柄30%、現金の範囲、100株単位。成行は0.1%不利、手数料0。
- 毎晩の「候補の記録」（23:07）の手順6b で `--intraday-wide ... --paper /tmp/paper.json --paper-cands /tmp/pcands.json --paper-out /tmp/paper_new.json`、手順6d で `settings/paper`（状態）と `paper_trades`（決着した売買）に書く。いちばん新しい日の分だけすすめる（同じ日は2回すすまない。夜の実行が1日抜けると、その日は飛ぶ）。
- 記録帳の「練習口座」に資産の線・やり方ごとの成績・持っている株・最近の売買。土曜の精度点検にも1〜2行。
- 試運転：`kabu-lens/research/day/paper_backfill.mjs [--swing]`（five.json の34日）。100万円 → 1,024,770円（+2.5%、一番下げたとき −5.5%）。デイトレ68回・勝率54%・+13,040円、スイング決着4回・−28,440円（ほかに含み益の3銘柄）、低位株3回・+7,610円。結果は `settings/paper_backfill`。

### 2026-11-19 仕事中の時間に合わせた通知
- 本人が取引しやすいのは 9:00〜10:00 と 14:00〜15:00。ほかの時間もスマホで注文を置くことはできる。
- 「場中の買い場（短い通知）」を 10:56 と 12:50 に追加（ops/prompt-daybuy.md）。資金で買える買い場の上位3つを、指値と逆指値付の売りの形で送る。
- 「引け前の目印」を 14:57 → 14:50 に早めた（低位株の強い引けは14:30の判定。15:00までに注文できるように）。朝のランキング（9:36）はそのまま。

### 2026-11-19 保有の上限を「損の合計」に
- 本人と決めて、銘柄数の上限（maxPositions 3）をやめた。settings/main の `maxOpenRiskMult: 3`：持ち越す株が全部損切りに当たったときの損の合計を「1回の損の上限 × 3」までにする（preTradeCheck の caps に「損の合計の上限」。損切りの無い保有は上限いっぱいとみる）。style が day の保有（その日のうちに売るデイトレ）は数えない。extra にも1行。
- 状態ファイルの positions に stop と style を入れる（kau.md・mite.md）。

### 2026-11-19 攻めの口座
- 練習口座をもう1つ、同じ日の同じデータで動かす：`--paper2 状態 --paper2-params '{"riskPct":5,"maxPosPct":50,"swingMax":10,"dayMax":2,"lowMax":3}' --paper2-out 新しい状態`。状態は `settings/paper_aggr`、売買は `paper_trades`（id が aggr- で始まり account: "aggr"）。記録帳の練習口座の欄に1行で並ぶ。
- 試運転（34日）：今の口座 +2.5%（一番下げたとき −5.5%）に対し、攻めの口座 −13.0%（−17.0%）。この期間はスイングの候補が悪く（12回で勝ち1回）、攻めた分だけ負けが大きくなった。現物だけだと株数は現金で決まり、攻めても張れる量はあまり増えない。

### 2026-11-19 現金を遊ばせない（夜の点検）
- 本人と決定。夜の点検の手順3b：空き＝（1回の損失の上限 × maxOpenRiskMult）−（持ち越す保有の (終値 − stop) × qty。stop が無い保有は上限いっぱい）と、使える現金を出し、候補を上から順に株数を決めて注文票に入れる（空きか現金が尽きるまで、最大 dayTradeMax 件）。注文票の最初に「空き：損の合計 あと約◯円・現金 約◯円 → 明日の買い ◯件」。ops/prompt-night.md。
- 本人は積立を別にやっている。この株の口座は「上乗せを取りにいく口座」として扱う。

### 2026-11-19 自社株買いの翌日
- 10年の検証（research/swing/README.md）で、決算と別の日の15:00以降の自社株買いの発表は、翌日の寄指（終値×1.02以下）で買い大引けで売ると平均+0.43%（734回）。最初に出した+0.70%は場中の発表を混ぜた甘い数字で、同じ日に訂正した。良い条件（久しぶり・15時台前半・25日線の下）2つ以上で+0.70%前後、0は−0.06%なので見送り（buybackScore・fetchBuybackRepeat。--buyback の score・skip、練習口座も score 0 を除き score 順）。本人と決めて取り入れた。
- `--buyback [YYYYMMDD] --universe universe-wide.json`：TDnet の1日分から選ぶ（isBuybackTitle・pickBuybacks。立会外・経過・状況報告・決算と同じ日・15時前は除く）。limit＝終値×1.02 を呼値で切り捨て（tickFloor）＝寄指の値段。
- 夜の点検の手順5b・3a：自社株買いを注文票の先頭に（寄指で買い→引成で売り。dayTradeMax の回数に数える。持ち越さないので損の合計には入れず、現金からは引く）。
- 練習口座：`--paper-buyback` で前の営業日の分を TDnet から取り、track "bb"（寄りが limit 以下なら寄りで買い、大引けで売る。1日 bbMax=2 回まで）。記録帳では「自社株買いの翌日」。

### 2026-11-19 増配・株式分割も足した
- study_events.mjs：寄指で買える日の1日目（全体比）は 増配 +0.48%（431回、8/10年プラス）、株式分割は1日目−0.14%だが5日 +0.85%・20日 +1.41%。優待の新設・拡充は効かない。
- pickEvents（buyback・divup・split）。--buyback の出力に kind・expect_pct・sell。夜の注文票は expect_pct の順に dayTradeMax 件。株式分割は5営業日目の引成で売り、保険に寄値×0.92 の逆指値。
- 練習口座：track "bb"（自社株買い・増配。寄り→引け）と "split"（5日目の引け）。
- 11/19 本人の希望で dayTradeMax を 2→5（夜の注文票の企業の行動・スイングを取りこぼさないため）。extra に「場中に値動きを見て追加で買うのはそのうち2回まで」を添えた。練習口座の bbMax も 5。

### 2026-11-19 ルールの版
- settings/main に ruleVersion（日付）・ruleLog（版ごとの変更点）・ruleNote。ルールを変えるときは本人の承認のうえで ruleVersion をその日に、ruleLog に足す。練習口座の数字を見る前に条件をいじらない。
- 夜の点検の1行目に「（ルール ◯◯版）」。/kau・/mite の considered に ruleVersion。
- 参考にした記事：zenn.dev/okikusan のシリーズ Vol.6（ルールの検証と毎日の点検、版管理、判定時刻と約定時刻を分ける、作った期間と別の期間で確かめる）。
- 11/19 本人の希望で、買う前は /mite だけでよいことにした（/mite に /kau のチェックが入っている。/kau は株数だけ確かめたいとき、/bachu は場中のスクショつきで流れを見たいとき）。extra の「買う前チェック」の行を更新。

### 2026-11-19 記録を増やした（目印・企業の行動・夜のPTS）
- 本人の方針：「データは取れるだけ取っていこう」。23:07 の「候補の記録」に手順 6e〜6h を足した（ops/prompt-cands.md）。
- **引け前の目印**（`marks`、累計は `settings/marks_stats`）：`--intraday-wide` の出力 `marks` に、前の営業日の目印を1件ずつ出す（`marksOutcomes`）。低位株の強い引けは通知どおり（14:50の足の始値で買い、翌日 +5%／−8%／13時。`lowExit`）、後場の VWAP 奪回は初めて出た時刻の20分後の足で買い、翌日の大引けまで。`--marks-stats` で日ごとに累計（同じ日は2回足さない）。
- **企業の行動の全件**（`events`）：`--buyback <今日>` の rows を、見送り（skip）も含めて全部記録。寄指の値段は答え合わせのときに発表日の終値×1.02で計算する（`limitPct: 2`。夜は Yahoo の日足に今日の分がまだ無いことがあるため）。
- **夜のPTS**（`pts_moves`）：株探のPTSランキング上下それぞれ先頭15件。基準は当日の終値（ref）とPTSの値段（ref2）。出来高1万株未満は group に `_thin`。
- 答え合わせは `--next-day-result recs.json --stats st.json`（`nextDayOutcome`・`mergeNextDay`）。翌営業日の寄りの窓、寄指で約定したか（filled）、寄り→引け（と1306との差）、終値→終値、株式分割は5営業日目の大引けまで。累計は `settings/nextday_stats` の group ごと（buyback_s0〜s2・divup・split・up・down・up_thin・down_thin）。
- 11/19 の夜の分は、その日の定期実行が終わったあとに手で入れた（11/18 の目印22件、11/19 の自社株買い1件、PTS上下30件ずつ）。
- **記録帳のデータベースは全部で25,000件まで。** 答えが出終わった記録は、毎晩の定期実行が collection `archive` の doc「<collection>-<日付>」1件（`{col, date, count, records}`）にまとめ、元の記録を消す（11/19 本人了承）。
  - まとめるのは cands（23:07・決着したもの）、events・pts_moves（23:07・final）、marks（23:07・最初から1日1件で書く）、movers（22:20・答え合わせのあと）、kessan（21:38・final）。considered は件数が少なく記録帳のページ（最新15件・/mite との突き合わせ）に出るのでまとめない。signals・paper_trades・intraday・trades も対象外。
  - 消すには読んだときの version が要るので、一括の掃除はしない（数千件の version を書き写すことになる）。その夜に読んだ記録だけを、読んだ version で消す。手順は各指示文の「まとめる」：(a) 既存のまとめを out_dir で get → (b) `--archive-doc <col> <日付> 新しい記録.json --existing 既存.json` → (c) archive に set → (d) (c) が成功したときだけ元の記録を batch delete。
  - 累計（settings の *_stats）は別に持っているので数字は変わらない。cands の集計（`--signals-report`）は `--also <archive を out_dir に保存したフォルダ>` でまとめた分も足す。
  - 11/19 に、それまでの movers 236件を archive の3件に、目印22件を1件にまとめた。DB は約400件。

### 2026-11-19 練習口座に「急騰後の押し目（反発確認）」を足した
- 根拠：`research/swing/study_surge_pullback.mjs`（README の「急騰した株の押し目買い」）。少し下げたらすぐ買うのは −0.16R、反発を確認すると +0.02R。上乗せが残ったのは「1日+15%で高値引けの急騰 → 高値から−8%以上の押し（上げ幅の61.8%より浅い）→ 押したあと初めて前日の高値を超える陽線」の翌日の寄りで買う形だけ（1,136件・+0.12R、3Rなら+0.17R、前半後半とも+）。
- `surgePullback(daily)`：最後の足がその合図の日なら `{surgeDate, high, low, stop: 押しの安値×0.99, dropPct}`。直近1年で394回（合図があった日は約160日）。
- 練習口座の track `surge`：`fetchIntradayWide` が前の営業日までの日足で合図を見て（`paperDays[..].surge`）、`paperStep` が寄りで買う。損切りは押しの安値の1%下、目標3R（`surgeTpR`）、10営業日目（`surgeHold`。買った日を1日目）の引けまで。1日2件まで（`surgeMax`）。売買代金の大きい順。
- 本人の売買の決まりにはまだ入れていない（練習口座で本番の成績を見てから）。
- 11/20 から攻めの口座（`settings/paper_aggr`）に資金を200万円足した（本人の希望。現金切れでデイトレが0回だったため）。params.capital・cash と、それまでの history の equity・cash に同じ額を足し、300万円で始めたとみなす。`deposits` に記録。基本の口座は100万円のまま。

### 2026-11-20 夜の3つの検証の結論（くわしくは research/swing/README.md の「夜の3つの検証」）
- 地合いの決まりは足さない（前半・後半で同じ向きに効くものが無かった。スイングは地合いが悪い日のほうがむしろ少し良い）。
- 急騰の押し目の条件は今のまま（2,592通りを試したが、前半と後半の成績の相関は−0.04＝細かく合わせても意味がない）。
- 全部入りの10年：今の決まりで年率+20.8%（100万円なら月の平均+1.7万円・中央+1.3万円、マイナスの月34%、一番下げたとき−18%）。もうけの大半は企業の行動。1回の損を大きくすると、現金が埋まって企業の行動を買えなくなり、かえって悪くなる。
- 最大の弱点は企業の行動の上乗せの薄さ（寄り・引けが毎回0.1%不利なら年率+9.4%）。寄指と引成を正しく使うことが前提。生き残りの偏りで甘めに出ている。
- 11/20 本人に任されて「スイングの上限を下げる・現金を残す」を検証したが、どれも今のまま（上限×3・現金を残さない）より悪かった。決まりは変えていない。1回の損を上げないことだけが大事。

### 2026-11-20 攻めの練習口座に「低位株の急騰の追いかけ」（chase）を足した
- 本人の希望（「メドレックスのようにストップ高まで行く低位株、見ていたら取れたのでは」）。攻めの口座（`settings/paper_aggr` の params.chaseMax=1）だけ。基本の口座は chaseMax 0 で動かない。
- 決まり：低位株か荒い株（前日終値500円未満、または1日の値幅が4%以上）で、9:30〜11:30 の5分足で前日終値+10%以上で引けた最初の足を見て、次の足の始値で買う。損切り −8%、届かなければ大引け。1日1回、5分足の早い順。
- 5分足34日でさかのぼると（この決まりだけ・1回の損5%）：33回・勝率45%・1回平均 −1.48%・口座 −19%。場中の検証（前日比+8%以上の追いかけは大引けまで全体比 −0.21%）とも合う。本番で数週間ためて、それでも負けるなら外す。
- 11/20 本人の質問「崩れたらすぐ手放せば？」を5分足34日で確かめた（chase だけ・1回の損1%）。1回の平均：損切り−8% −3.1%／−5% −1.5%／−3% −1.1%／−8%＋高値から−5%で売る −1.5%／−8%＋高値から−3% −1.4%／**−5%＋高値から−3% −0.9%（いちばんまし）**／買う条件を+15% −3.4%・+20% −2.3%。どれもマイナス。早く手放すと損は小さくなるが、プラスにはならない。
- 攻めの口座は「−5%＋高値から−3%で売る」（`chaseSlPct: 5, chaseTrailPct: 3`）に変えて本番で確かめる。`chaseTrailPct`：買ってからの高値から −◯% の終値で売る（0 なら使わない）。

### 2026-11-20 本人と決めた6つの改善
1. **現金と資金の自動計算**：`cashNow`（`--cash-now settings.json trades`）。settings/main の cashBase・cashBaseAt（基準の日の大引けまでの現金。今は 2026-11-18 の値）から、後の売買で今の cash を出す。capital は現金＋放置していない保有の時価（放置の保有は frozenValue に別）。夜の点検の手順9b が毎晩 cash・capital・capitalAt を書き直す。楽天の買付余力が分かったら /kiroku で基準を置き直す。
2. **/kiroku**（`.claude/commands/kiroku.md`）：楽天の約定一覧・保有一覧・注文照会・買付余力の写真から、trades と settings/main を合わせる。読めない数字は推測しない。執行中0の保有は1行目に。
3. **朝の株ウォッチを作り直した**：① 入れる注文 ② 確認すること ③ 今日の上限 の3つだけ（ops/prompt-morning.md の末尾）。
4. **株価の遅れ**：Yahoo・株探の無料のデータは場中15〜20分遅れで、なくせない。11/20 にメドレックスの張り付き直しを見落とした。急ぐ場面は本人に楽天の画面の値段を添えてもらう（/mite・/bachu の `:値段`）。朝の通知の最後にもその1行を入れた。
5. **放置中の保有の見直し**：週の振り返り（金曜）が、放置中の含み損益と資金に対する割合を出し、「①このまま ②期限を決める ③売る線を決め直す」を本人に問いかける（売れ・持てとは言わない）。
6. **月の成績表**（trig_01Dj6uSrSS43YeCJqm8XEtzt、毎月1日 10:47、ops/prompt-monthly.md）：本番・練習口座・全部の合図の先月の分。collection "monthly" に累計の写しを残し、次の月との差で「その月の分」を出す。
- 11/21 夜：増配の幅（今回÷前回の予想）で翌日の寄指の成績を分けた（swing/study_div_size.mjs、開示PDF 2,400件）。3つの期間そろって良い組はなく、件数も少ない。増配は幅で選ばない（決まりは変えない）。
- **11/22 本人と決定（本番）：小さめの会社の大きい自社株買いを先に買う**。取得の割合2%以上・20日平均の売買代金3億円未満の自社株買い（`isSmallHotBuyback`）を `--buyback` の rows の一番上に置く（`small_hot: true`、`turnover_avg` を出す）。夜の点検の指示文（手順5b・3a・注文票の見出し）を直した（ops/prompt-night.md はまだ古い。直すときは get_trigger で今の指示文を読む）。練習口座の本番どおり（paper_live）は params.evOrder = 'bbsmall'。ruleVersion 2026-11-22。10年の口座全体の年率は前半23.8→23.8／後半28.7→29.1／直近44.6→46.6（前半は同じ）。
- 11/22：海外の公開スキル（claude-trading-skills・day-trader-skill）の合図を10年で確かめた（swing/study_ext_ideas.mjs）。モメンタムバースト（+4%・出来高増）、売り疲れのハンマー、売り抜けの日（ディストリビューション・デー）の数で絞る、のどれも3つの期間そろって良くならない。採らない。
- 11/22：寄り付きの値幅の上抜け（オープニングレンジ・ブレイクアウト）を1時間足2年・5分足60日で確かめた（day/study_orb.mjs）。どの形も全体比 −0.2% 前後（すべりの分だけ負け・上乗せゼロ）、勝率3割台。採らない。
