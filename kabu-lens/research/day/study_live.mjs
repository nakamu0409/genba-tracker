// 今ためているデータで確かめること（2026-11-25 本人と決定。HANDOFF の「今ためているデータで確かめること」）。5分足（five.json、8/20〜）で、今の時点の途中経過を出す
// 1) スイングをいつ買うか（swingEntryVariants）：10年の検証と同じ作り方のスイングの候補（lib_signals）の翌日を、open／base（今の決まり：9:15以降 終値×1.02 の指値）／pull1（終値×0.99 の指値）／vwap10／late で買ったとき
//    買えた割合、base より何%安いか・何R得か、大引けまでの%、base で買えたのに買えなかった回数と、その base の5日後の引けまでの%（買えなかった損）
// 2) 自社株買い・増配をいつ売るか（eventExitVariants）：寄指で買えた日の、寄りから各時刻までの%
// 決まりを変える提案は60営業日分たまってから（それまでは途中経過）
// 途中経過（11/25、5分足60日 8/20〜11/18。決まりは変えない）：
//  1) スイングの候補4,635回。base（今）買えた97%。pull1 48%・base より −0.45%（+0.08R）、vwap10 84%・−0.30%（+0.06R）、late 89%・−0.23%（+0.05R）。
//     ただし安く待つと買えなかった株ほど上がる（買えなかった分の base の5日後：vwap10 +1.22%（572回）、late +1.53%（350回）、pull1 +0.13%（2,179回））。差し引きはまだ分からない（決着したRで見る）
//  2) 自社株買い（買えた24回）：大引け +1.37%（勝ち75%）、trail2 +1.44%、9:30 +0.97%。大引けまで持つのが良い。増配（18回）：大引け −0.89%、9:30 −0.15%。この60日は増配が負け（数が少ない）
import { readFileSync } from 'node:fs'
import { swingEntryVariants, eventExitVariants } from '../../../.claude/scripts/kabu-lens.mjs'
import { loadAll, mean, fmt } from '../swing/lib_signals.mjs'
const F = JSON.parse(readFileSync(new URL('./five.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSmall: true })
const { stocks, swing } = D
const days = new Set(); for (const v of Object.values(F)) for (const d of Object.keys(v)) days.add(d)
const first = [...days].sort()[0], lastD = [...days].sort().at(-1)
console.log(`5分足 ${days.size}日（${first}〜${lastD}）`)
// 1)
const K = ['open', 'base', 'pull1', 'vwap10', 'late']
const G = Object.fromEntries(K.map(k => [k, { filled: 0, toClose: [], vsBase: [], vsBaseR: [], missed: [], n: 0 }]))
let nS = 0
for (const s of swing) {
  const B = stocks[s.code]?.bars; if (!B) continue
  const nx = B[s.i + 1]; if (!nx || !F[s.code]?.[nx.date]) continue
  const r = swingEntryVariants(F[s.code][nx.date], { close: s.close, stop: s.stop }); if (!r) continue
  nS++
  const base = r.v.base
  const after5 = B[s.i + 5]?.c
  for (const k of K) {
    const p = r.v[k], g = G[k]
    if (p == null) { if (base != null && after5) g.missed.push((after5 / base - 1) * 100); continue }
    g.filled++; g.toClose.push((r.dayClose / p - 1) * 100)
    if (base != null) { g.vsBase.push((p / base - 1) * 100); if (base > s.stop) g.vsBaseR.push((base - p) / (base - s.stop)) }
  }
}
console.log(`\n■ 1) スイングの候補 ${nS}回`)
for (const k of K) { const g = G[k]; console.log(`  ${k.padEnd(7)} 買えた ${(g.filled / nS * 100).toFixed(0)}%  base より ${fmt(mean(g.vsBase))}%（${fmt(mean(g.vsBaseR))}R 得）  大引けまで ${fmt(mean(g.toClose))}%  base では買えたのに買えなかった ${g.missed.length}回（その base の5日後の引けまで ${fmt(mean(g.missed))}%）`) }
// 2)
const E = { buyback: [], divup: [] }; let miss = { buyback: 0, divup: 0 }
for (const e of D.events) {
  if (e.kind !== 'buyback' && e.kind !== 'divup') continue
  const B = stocks[e.code]?.bars; if (!B) continue
  const nx = B[e.i + 1]; if (!nx || !F[e.code]?.[nx.date]) continue
  const r = eventExitVariants(F[e.code][nx.date], { prevClose: B[e.i].c }); if (!r) continue
  if (!r.filled) { miss[e.kind]++; continue }
  E[e.kind].push(r.ret)
}
for (const [k, rows] of Object.entries(E)) {
  console.log(`\n■ 2) ${k === 'buyback' ? '自社株買い' : '増配'}：寄指で買えた ${rows.length}回・買えなかった ${miss[k]}回。寄りからの%（勝ち）`)
  if (!rows.length) continue
  for (const t of Object.keys(rows[0])) console.log(`  ${t.padEnd(9)} ${fmt(mean(rows.map(r => r[t])))}%（${(rows.filter(r => r[t] > 0).length / rows.length * 100).toFixed(0)}%）`)
}
