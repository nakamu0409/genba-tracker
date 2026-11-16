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

- 株価は Yahoo Finance（query1/query2.finance.yahoo.com）、PTSとランキングは株探（kabutan.jp, s.kabutan.jp）。クラウド環境のネットワーク設定でこの4つを許可してある。ほかのサイト（みんかぶ、日経、TradingView など）は開けない。
- Node の fetch はプロキシを通すため、スクリプトが自分で `NODE_USE_ENV_PROXY=1` を付けて起動し直す。だめなら curl に切り替わる。
- `kabu-lens.pine`（TradingView版）は、TradingView 上での動作確認をしていない。

### トレード記録帳

- 探し方: Artifact ツールの `action: "list"` で題名「トレード記録帳」を探す。URL はリポジトリに書いていない。
- ページの元ファイルの控えは `kabu-lens/ops/trade-ledger.html`。直すときは、まず `action: "read"` で今の版を取り（本人や別のセッションが直しているかもしれない）、直して同じ URL へ公開し直し、控えも同じ内容に更新する。
- **`kabu-lens.mjs` を同梱している。** 定期実行はリポジトリを持たないので、記録帳から `Artifact read path:"kabu-lens.mjs"` でスクリプトを取って動かす。`.claude/scripts/kabu-lens.mjs` を直したら、必ず記録帳にも `files: {"kabu-lens.mjs": ...}` で公開し直す（忘れると定期実行だけ古いまま）。
- データベース（ArtifactData ツール。読み書きは本人だけ）:
  - `settings/main`: capital, cash, riskPct, maxPosPct, maxPositions, dayTradeMax, dayLossPct, extra（本人の決めごと。1行に1つ）, universe（基本の約170銘柄）
  - `settings/backtest`: 検証結果の要約
  - `settings/history`: 証券会社の取引履歴を集計したもの（銘柄ごとの損益、1日の買いの回数）。金額はここにだけ置き、リポジトリには書かない
  - `trades`: 売買の記録。status が open は保有中。entry, qty, stop, target, events, note
  - `watchlist`: 監視リスト
  - `signals`: 買い候補の追跡。ID は `<コード>-<日付>-pass|blocked`
  - `movers`: ランキングの記録。昼の ID は `<日付>-<up|down>-<コード>`、朝は `<日付>-open-<up|down>-<コード>`（`slot: "open"`）。夜が結果を足す。昼は「後場の始値→終値」、朝は「記録したときの株価→終値」（どちらも `afternoon_pct` に入る）
  - `settings/movers_stats`: 答え合わせの累計（危険度ごと・材料の有無ごとの件数など）。朝の分は中の `open` に分けて持つ。記録帳のページの「ランキングの危険度の答え合わせ」がこれを表示する
- 本人が資金や保有を変えたと言ったら、ここを更新する。

### 定期実行（4つ。平日・日本時間）

| 名前 | 時刻 | 内容 |
|---|---|---|
| 朝の株ウォッチ | 8:22 | 保有の確認、PTS、今日の注意点 |
| 朝のランキング（寄り付き後） | 9:36 | 9:15ごろの値上がり・値下がりランキングの危険度と材料。`movers` に `slot: "open"` で記録 |
| 昼の状況確認 | 11:47 | 相場、保有の含み損益、今朝の候補、値上がり・値下がりランキング（各20銘柄）の危険度と材料。`movers` に記録 |
| 夜の点検（保有と買い候補） | 22:20 | 買い候補の判定、追跡の答え合わせ、昼のランキングの答え合わせ、記録帳への書き戻し、PTS |

- `list_triggers` で名前から探す。どれも「毎回新しいセッション」「環境はデフォルト」「スマホ通知あり」。
- 指示文を直すときは `get_trigger` で全文を取り、直した全文を `update_trigger` で送る（一部だけの差し替えはできない）。
- 指示文には銘柄・資金を書かない。すべて記録帳から読ませる。
- 指示文の控えは `kabu-lens/ops/prompt-morning.md`・`prompt-open.md`（朝のランキング）・`prompt-midday.md`・`prompt-night.md`（記録帳のURLは `<記録帳のURL>` に置き換えてある）。指示文を直したら控えも直す。
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
| 答え合わせ | `afternoonResult` `moversResult` `mergeMoverStats` `summarizeMoverStats` | `--movers-result`。昼の記録に後場の結果を足し、危険度ごとの累計を出す |
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

`/theme`（探す）→ `/kessan`（読む）→ `/bear`（疑う）→ `/comps` `/dcf`（値付け）→ `/chart`（タイミング）→ `/thesis` `/catalysts` `/earnings`（記録）。`/stock-research` が通しで実行する。
結果は `stock-research/<銘柄名>/` に Markdown で残す。`/chart` は `kabu-lens/AGENT_PROMPT.md` の読み方に従う。`/kiken` は危険度。
銘柄の調査メモ（公開情報の整理）はリポジトリに置いてよい。本人の保有・株数・買値は書かない。

### トレード記録帳のページ（`kabu-lens/ops/trade-ledger.html`）

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
- 業種の強さは、一貫した関係が無かったので組み込んでいない。逆張りは利幅が小さすぎて不採用。
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
- 記録帳のページに「今日の買いの回数」の表示は無い（`/kau` が記録帳の今日の記録を数える）。本人が記録を入れないと歯止めが効かないので、入れ忘れが続くようなら、ページに「今日◯回目」を大きく出す。
- 本人がまだ決めていないこと: 損失の上限を変えるか／資金を追加したときの設定／保有株の損切りの値段の入力／決算をまたいだ保有株のその後の方針。くわしい中身は記録帳の `settings/main` と `trades` の note を見る。
