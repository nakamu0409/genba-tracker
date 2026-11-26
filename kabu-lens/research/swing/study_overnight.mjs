// 相場全体：夜の間（引け→翌朝の寄り）と昼の間（寄り→引け）の値上がり（TOPIX 連動ETF・10年。2026-11-21）
// 使い方: node kabu-lens/research/swing/study_overnight.mjs
// あわせて個別株（wide.json の全銘柄）の平均も見る。年ごと
import { loadAll, mean, fmt } from './lib_signals.mjs'

const D = loadAll({ withSwing: false })
const { bench, stocks } = D
const yr = {}
for (let i = 1; i < bench.length; i++) {
  const y = bench[i].date.slice(0, 4)
  const o = (yr[y] ||= { on: 0, id: 0, n: 0, son: [], sid: [] })
  o.on += Math.log(bench[i].o / bench[i - 1].c)
  o.id += Math.log(bench[i].c / bench[i].o)
  o.n++
}
// 個別株：日ごとの全銘柄の平均（売買代金1億円以上）
const byDay = new Map()
for (const st of Object.values(stocks)) {
  const B = st.bars
  for (let i = 1; i < B.length; i++) {
    if (st.turn[i - 1] < 1e8 || B[i].h === B[i].l) continue
    const on = (B[i].o / B[i - 1].c - 1) * 100
    const id = (B[i].c / B[i].o - 1) * 100
    if (Math.abs(on) > 30 || Math.abs(id) > 30) continue
    const d = (byDay.get(B[i].date) || byDay.set(B[i].date, { on: [], id: [] }).get(B[i].date))
    d.on.push(on)
    d.id.push(id)
  }
}
for (const [d, v] of byDay) {
  const o = yr[d.slice(0, 4)]
  if (!o) continue
  o.son.push(mean(v.on))
  o.sid.push(mean(v.id))
}
console.log('年  TOPIX ETF：夜の間（合計%）／昼の間（合計%）  個別株の平均：夜の間（1日平均%）／昼の間（1日平均%）')
for (const [y, o] of Object.entries(yr).sort()) {
  console.log(`  ${y}  ${fmt((Math.exp(o.on) - 1) * 100, 1)}／${fmt((Math.exp(o.id) - 1) * 100, 1)}   ${fmt(mean(o.son), 3)}／${fmt(mean(o.sid), 3)}`)
}
