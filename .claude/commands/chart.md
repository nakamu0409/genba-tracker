---
description: 【ステップ4.5 タイミング】株レンズのチャートデータで「今買うか・押し目を待つか」を判断する
argument-hint: <銘柄名> [銘柄コード]
---

対象: $ARGUMENTS

`kabu-lens/AGENT_PROMPT.md` のコードブロックの中身を指示として使い、次の手順で進めてください。

1. パケットを探す（見つかった順に使う）:
   - ユーザーがこの会話に貼った JSON（schema が "kabu-lens/v1" のもの）
   - `kabu-lens/packets/latest/` で、銘柄コードが一致するファイル（例: `TSE_7203_D.json`）。日足（`_D`）と週足（`_W`）の両方があれば、週足で向き、日足でタイミングを見る
   - `kabu-lens/packets/history.jsonl` の同じ銘柄の直近20行（流れの変化を見るため）
   - どれも無ければ、TradingView に株レンズを入れてパケットを送る方法（`kabu-lens/README.md`）を案内して終わる。数字を推測で作らない
2. パケットの `date_jst` が今日から3営業日以上古ければ、最初にそのことをはっきり書く。
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
