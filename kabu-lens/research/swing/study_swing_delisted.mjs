// 生き残りの偏りの確かめ：上場をやめた銘柄（J-Quants・2年分）にもスイングの候補を出し、株価の高い・低いで成績を比べる（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_delisted.mjs
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補・売買代金1億円以上）。上場をやめた日まで決着しなければ、最後の日の終値で売ったことにする
// 比べる相手：今ある銘柄の、同じ日付の範囲の候補
import { readFileSync } from 'node:fs'
import { analyze } from '../../../.claude/scripts/kabu-lens.mjs'
import { loadAll, simulate, mean, fmt } from './lib_signals.mjs'

const D = loadAll()
const { bench, stocks } = D
const del = JSON.parse(readFileSync(new URL('../jq_delisted.json', import.meta.url), 'utf-8'))
const rowsDel = []
let used = 0
for (const [c5, x] of Object.entries(del)) {
  const code = c5.slice(0, 4)
  if (stocks[code]) continue
  const bars = (x.bars || []).map(b => ({ date: b.Date, o: +(b.AdjO ?? b.O), h: +(b.AdjH ?? b.H), l: +(b.AdjL ?? b.L), c: +(b.AdjC ?? b.C), v: +(b.AdjVo ?? b.Vo) })).filter(b => b.o > 0 && b.c > 0 && b.h > 0 && b.l > 0)
  if (bars.length < 300) continue
  let p
  try {
    p = analyze(bars, bench, {}, { history: true, avoidChase: true })
  } catch {
    continue
  }
  used++
  for (const sg of p.signal_history) {
    if (!sg.pass) continue
    let t = 0
    for (let k = Math.max(0, sg.i - 19); k <= sg.i; k++) t += bars[k].c * bars[k].v
    if (t / Math.min(20, sg.i + 1) < 1e8) continue
    let r = simulate(bars, sg.i, sg.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
    if (!r) {
      // 上場をやめて決着しなかった：最後の日の終値で売る
      const e = sg.i + 1
      if (e >= bars.length || bars[e].o > bars[sg.i].c * 1.02 || bars[e].o <= sg.stop) continue
      const entry = bars[e].o * 1.001
      r = { r: (bars[bars.length - 1].c * 0.999 - entry) / (entry - sg.stop), cut: true }
    }
    rowsDel.push({ date: bars[sg.i].date, r: r.r, price: bars[sg.i].c, cut: !!r.cut })
  }
}
const d0 = rowsDel.map(r => r.date).sort()[0]
const rowsLive = []
for (const s of D.swing) {
  if (s.date < d0) continue
  const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (t) rowsLive.push({ date: s.date, r: t.r, price: stocks[s.code].bars[s.i].c })
}
console.log(`上場をやめた銘柄 ${used} を使えた。候補 ${rowsDel.length}件（上場をやめて決着しなかったもの ${rowsDel.filter(r => r.cut).length}件）。${d0} 以降`)
const line = (n, z) => console.log(`  ${n.padEnd(26)} ${fmt(mean(z.map(r => r.r)), 3)}R（${z.length}件）`)
for (const [n, z] of [['上場をやめた銘柄', rowsDel], ['今ある銘柄', rowsLive], ['合わせた', [...rowsDel, ...rowsLive]]]) {
  console.log(`■ ${n}`)
  line('全部', z)
  line('1,500円未満', z.filter(r => r.price < 1500))
  line('1,500円以上', z.filter(r => r.price >= 1500))
}
console.log(`\n今ある銘柄の候補のうち、上場をやめた銘柄の候補の割合：${(rowsDel.length / (rowsDel.length + rowsLive.length) * 100).toFixed(1)}%`)
