// 箱の中で安く買って高く売る（11/26 本人の案：ヤクルトが 2,700〜3,000円 を行き来しているので、箱の下で買い上で売るをくり返す。値段は決め打ちでなく、勝てる決め方を探す）
// 後から値段を決めないように、買う日より前の N 日（lookN）の高値・安値だけで箱を決める：幅＝(高値−安値)/安値。幅が maxW% 以下なら「箱」とみる
// 買い＝安値＋幅×buyAt の指値（その日の安値が届けば約定。寄りが下なら寄り）、売り＝安値＋幅×sellAt の指値（次の日から）、損切り＝箱の安値×(1−stopPct%)、最長 maxDays 日で引け。
// 1銘柄1つずつ持つ。滑り：買い・売りとも0.1%不利。全体（1306）との差ではなくそのままの%（同じ期間に何もしない場合と比べるため、同じ日に買って同じ日数持った場合の平均も出す）
// 使い方: node study_range.mjs [コード]（省略で全銘柄。売買代金1億円以上）
// 結果（11/26。前半／後半／直近）：全銘柄（売買代金1億円以上）で12通りの決め方のどれも、「同じ日に買って同じ日数持つだけ」より 0.1〜0.4% 悪い（3つの期間とも）。
//   例 N40・幅≦10%・買い0.25・売り0.65：−0.32／+0.57／+0.41%（勝率54〜64%）、持つだけ −0.01／+0.80／+0.56%。勝率は上がるが、箱を下に抜けたときの損切りで消える
//   ヤクルト（2267）だけ：回数が1〜25回と少なく、決め方によって勝ち負けが変わる（偶然の範囲）。ここ数か月の 2,700〜3,000円 の箱がうまくいったのは、後から見て決めた値段だから → 採らない
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const only = process.argv[2]
const { stocks } = loadAll({ withSwing: false })
const CFG = []
for (const lookN of [40, 60]) for (const maxW of [10, 15]) for (const [buyAt, sellAt] of [[0.2, 0.8], [0.25, 0.65], [0.1, 0.6]]) for (const stopPct of [3]) CFG.push({ lookN, maxW, buyAt, sellAt, stopPct, maxDays: 40 })
const SL = 0.001
for (const c of CFG) {
  const R = [[], [], []], days = [[], [], []], base = [[], [], []]
  let wins = [0, 0, 0]
  for (const [code, st] of Object.entries(stocks)) {
    if (only && code !== only) continue
    const B = st.bars
    let i = c.lookN
    while (i < B.length - 1) {
      if (!only && st.turn[i - 1] < 1e8) { i++; continue }
      let hi = -Infinity, lo = Infinity
      for (let k = i - c.lookN; k < i; k++) { hi = Math.max(hi, B[k].h); lo = Math.min(lo, B[k].l) }
      const w = (hi - lo) / lo * 100
      const buyPx = lo + (hi - lo) * c.buyAt
      if (w > c.maxW || B[i].l > buyPx) { i++; continue }
      const entry = Math.min(B[i].o, buyPx) * (1 + SL)
      const sellPx = lo + (hi - lo) * c.sellAt, stop = lo * (1 - c.stopPct / 100)
      let j = i, exit = null
      // 買った日に損切りに届いたら損切り（同じ日の順番は分からないので悪いほう）
      if (B[i].l <= stop) exit = Math.min(B[i].o, stop) * (1 - SL)
      while (exit === null && ++j < B.length) {
        const b = B[j]
        if (b.l <= stop) exit = Math.min(b.o, stop) * (1 - SL)
        else if (b.h >= sellPx) exit = Math.max(b.o, sellPx) * (1 - SL)
        else if (j - i >= c.maxDays) exit = b.c * (1 - SL)
      }
      if (exit === null) break
      const p = per(B[i].date), r = (exit / entry - 1) * 100
      R[p].push(r); days[p].push(j - i); if (r > 0) wins[p]++
      // 比べる相手：同じ日の引けで買い、同じ日数後の引けで売る
      base[p].push((B[Math.min(j, B.length - 1)].c / B[i].c - 1) * 100)
      i = j + 1
    }
  }
  console.log(`N${c.lookN} 幅≦${c.maxW}% 買い${c.buyAt} 売り${c.sellAt} 損切り−${c.stopPct}%：` + R.map((x, p) => `${fmt(mean(x))}(${x.length}回・勝率${x.length ? Math.round(wins[p] / x.length * 100) : '-'}%・${x.length ? Math.round(mean(days[p])) : '-'}日、同じ日数持つだけ ${fmt(mean(base[p]))})`).join(' ／ '))
}
