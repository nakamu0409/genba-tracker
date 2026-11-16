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
node .claude/scripts/kabu-lens.mjs --backtest 7203 --trades
node .claude/scripts/kabu-lens.mjs --evaluate signals.json   # 買い候補の「買っていたら」の答え合わせ
```

- 株価は Yahoo Finance（query1/query2.finance.yahoo.com）、PTSとランキングは株探（kabutan.jp, s.kabutan.jp）。クラウド環境のネットワーク設定でこの4つを許可してある。ほかのサイト（みんかぶ、日経、TradingView など）は開けない。
- Node の fetch はプロキシを通すため、スクリプトが自分で `NODE_USE_ENV_PROXY=1` を付けて起動し直す。だめなら curl に切り替わる。
- `kabu-lens.pine`（TradingView版）は、TradingView 上での動作確認をしていない。

### トレード記録帳

- 探し方: Artifact ツールの `action: "list"` で題名「トレード記録帳」を探す。URL はリポジトリに書いていない。
- ページの元ファイルはリポジトリに無い。直すときは `action: "read"` で今の版を取り、それを元に同じ URL へ公開し直す。
- **`kabu-lens.mjs` を同梱している。** 定期実行はリポジトリを持たないので、記録帳から `Artifact read path:"kabu-lens.mjs"` でスクリプトを取って動かす。`.claude/scripts/kabu-lens.mjs` を直したら、必ず記録帳にも `files: {"kabu-lens.mjs": ...}` で公開し直す（忘れると定期実行だけ古いまま）。
- データベース（ArtifactData ツール。読み書きは本人だけ）:
  - `settings/main`: capital, cash, riskPct, maxPosPct, maxPositions, dayTradeMax, dayLossPct, extra（本人の決めごと。1行に1つ）, universe（基本の約170銘柄）
  - `settings/backtest`: 検証結果の要約
  - `trades`: 売買の記録。status が open は保有中。entry, qty, stop, target, events, note
  - `watchlist`: 監視リスト
  - `signals`: 買い候補の追跡。ID は `<コード>-<日付>-pass|blocked`
- 本人が資金や保有を変えたと言ったら、ここを更新する。

### 定期実行（3つ。平日・日本時間）

| 名前 | 時刻 | 内容 |
|---|---|---|
| 朝の株ウォッチ | 8:22 | 保有の確認、PTS、今日の注意点 |
| 昼の状況確認 | 11:47 | 相場、保有の含み損益、今朝の候補、値上がりランキングと飛びつく危険度 |
| 夜の点検（保有と買い候補） | 22:20 | 買い候補の判定、追跡の答え合わせ、記録帳への書き戻し、PTS |

- `list_triggers` で名前から探す。どれも「毎回新しいセッション」「環境はデフォルト」「スマホ通知あり」。
- 指示文を直すときは `get_trigger` で全文を取り、直した全文を `update_trigger` で送る（一部だけの差し替えはできない）。
- 指示文には銘柄・資金を書かない。すべて記録帳から読ませる。
- 名前に「旧」が付いた無効の2つは、Yahoo に繋がらない環境で動いていた古いもの。消さずに置いてある。

## 検証でわかったこと（くわしくは research の README）

- 買い方の条件は、「いつ買っても同じ」とほぼ差が無かった。効いたのは売り方で、**長く持つほうが良い**（目標は損切り幅の3倍・最長40営業日で追跡）。
- 地合いが「荒れている」ときの見送りは残した（3年では逆効果に見えたが、10年では一貫しなかった）。
- 好材料の窓開け（GAP: 窓+2%・出来高2倍・高値引けの陽線）は追跡に採用。2,200円以下の株では弱め。
- 業種の強さは、一貫した関係が無かったので組み込んでいない。逆張りは利幅が小さすぎて不採用。
- 昼の急騰株への飛びつきは、平均ほぼ0%・勝率47%。「勝てる特徴」は無く、「危ない特徴」だけあった → 危険度スコア（`chaseRisk`）。**「低」は安全という意味ではない。**

## 続きでやること・決まっていないこと

- 夜の点検は 2026年11月16日 22:20 が初回。追跡の書き戻しがうまく動いたか、翌日に確認する。
- 追跡がたまったら（目安は30件以上）、候補の種類ごとの成績を見てルールを見直す。
- 本人がまだ決めていないこと: 損失の上限を変えるか／資金を追加したときの設定／保有株の損切りの値段の入力／決算をまたいだ保有株のその後の方針。くわしい中身は記録帳の `settings/main` と `trades` の note を見る。
