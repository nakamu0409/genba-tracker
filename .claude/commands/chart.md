---
description: 【ステップ4.5 タイミング】株価の日足から買いスコアと高値づかみ危険度を出し、「今買うか・押し目を待つか」を判断する
argument-hint: <銘柄名> [銘柄コード]
---

対象: $ARGUMENTS

`kabu-lens/AGENT_PROMPT.md` のコードブロックの中身を指示として使い、次の手順で進めてください。

1. パケットを用意する:
   - 銘柄コード（例: 7203、285A）がわかれば `node .claude/scripts/kabu-lens.mjs <コード>` を実行する。Yahoo Finance の日足から計算し、結果を表示して `kabu-lens/packets/latest/TSE_<コード>_D.json` に保存する（TradingView は不要）
   - 銘柄コードが引数に無ければ、`stock-research/<銘柄名>/` のファイルから探す。それでも不明なら Web 検索で確認し、ユーザーに「<銘柄名>（<コード>）で合っていますか」と一言添えて進める
   - ユーザーがこの会話に JSON（schema が "kabu-lens/v1"）を貼った場合や、TradingView 版から届いた新しいパケットが `kabu-lens/packets/latest/` にある場合は、そちらを使ってよい
   - スクリプトが失敗したら（ネットワークがその取得先を許可していない、コードが違うなど）、エラーをそのまま伝えて止める。数字を推測で作らない
   - スクリプト版のパケットは `earnings` が常に null。決算日は手順3の catalysts.md か Web 検索で確認する
2. パケットの `date_jst` が今日から3営業日以上古ければ、最初にそのことをはっきり書く。 `unconfirmed_bar_dropped` が true なら「今日の足は取引中のため使っていない」と書く。
3. `stock-research/<銘柄名>/` に thesis.md・dcf.md・catalysts.md があれば読み、次も判断に入れる:
   - DCF の理論株価と安全域: 今の株価で安全域が残っているか（無ければ WAIT_PULLBACK か AVOID 寄り）
   - thesis の「売る条件」: すでに当てはまっていないか
   - catalysts の決算日: パケットの earnings.next_date が null のときはこちらを使う
4. 株数・損益比などの計算は暗算せず `node -e` か `node .claude/scripts/stock-calc.mjs` で確定させる。
5. 結果を `stock-research/<銘柄名>/chart.md` に追記する（日付の見出しをつけ、前回の判断の下に足す）。形式:

```markdown
## YYYY-MM-DD（パケットの日付: YYYY-MM-DD）
判定: BUY / WAIT_PULLBACK / WAIT / AVOID（確信度 ○○）
- 地合い / 買いスコア / 高値づかみ危険度:
- 押し目待ちの価格帯:
- 買値・損切り・目標1/2・株数（買う場合）:
- 理論株価との関係（dcf.md より）:
- この判断が外れるとしたら:
- 次に見る日:
```

最後に、チャートは「いつ買うか」の参考で「何を買うか」の根拠ではないこと、AIは株価の未来を当てないこと、最後に決めるのは本人であることを一言添える。売買推奨はしません。
