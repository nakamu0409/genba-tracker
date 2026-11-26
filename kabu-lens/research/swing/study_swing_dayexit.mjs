// 本人の質問（11/25）：スイングの候補を、損の上限で100株も買えない日に「翌日の寄りで買って同じ日の引けで売る」（デイトレにする）とどうか
// 翌日の寄り（終値×1.02 以下のときだけ）→ 引け の%と全体比%（日経平均連動の寄り→引けを引く）。損切りは考えない（その日のうちに売る）。手数料なし・滑り0.1%×2
// 比べる：同じ候補を2日・5日持つ、と今の決まり（3R・40日）のR。期間：前半／後半／直近
// 結果（11/25。前半／後半／直近）：寄り→引け −0.23／−0.21／−0.23%（滑り込み。全体比 −0.20／−0.21／−0.18%）、勝ち42%。2日目の引け −0.20／−0.19／−0.19%、5日目 −0.08／−0.14／+0.18%。
//   今の決まり（3R・40日）は +0.06／+0.11／+0.26R。スイングの候補のもうけは、数週間かけて伸びる分。その日のうちに売ると3つの期間とも負ける（採らない）
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14'
const per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, bench, swing } = loadAll()
const bi = new Map(bench.map((b, i) => [b.date, i]))
const G = { oc: [[], [], []], ex: [[], [], []], win: [[], [], []], h2: [[], [], []], h5: [[], [], []], R: [[], [], []] }
for (const s of swing) {
  const B = stocks[s.code].bars, j = s.i + 1
  if (j + 5 >= B.length) continue
  const o = B[j].o
  if (o > s.close * 1.02 || o <= s.stop) continue
  const k = bi.get(B[j].date); if (k === undefined) continue
  const p = per(B[j].date)
  const oc = (B[j].c / o - 1) * 100 - SLIP * 200
  G.oc[p].push(oc); G.win[p].push(oc > 0 ? 1 : 0)
  G.ex[p].push(oc - (bench[k].c / bench[k].o - 1) * 100)
  G.h2[p].push((B[j + 1].c / o - 1) * 100 - SLIP * 200)
  G.h5[p].push((B[j + 4].c / o - 1) * 100 - SLIP * 200)
  const r = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40 }); if (r && Number.isFinite(r.r)) G.R[p].push(r.r)
}
const line = (t, a, u = '%') => console.log(t.padEnd(22) + a.map(x => `${fmt(mean(x), 2)}${u}(${x.length})`).join(' ／ '))
console.log('前半／後半／直近')
line('寄り→引け', G.oc); line('寄り→引け 全体比', G.ex); line('勝ち（引けで売る）', G.win.map(a => a.map(x => x * 100)))
line('2日目の引け', G.h2); line('5日目の引け', G.h5); line('今の決まり（3R・40日）', G.R, 'R')
