// 企業の行動の1回の損益の分布（最悪の日）：1銘柄に資金の何%を入れると、1回でいくら減りうるか（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_worst.mjs
// 今の買い方（翌日の寄指＝終値×1.02以下。自社株買い〈良い条件1つ以上〉・増配はその日の引け、分割は5日目の引けか −8%の逆指値）。手数料・TOPIX は引かない（そのままの%）
import { loadAll, fmt } from './lib_signals.mjs'

const D = loadAll({ withSwing: false })
const { stocks } = D
const rs = []
for (const e of D.events) {
  if (e.kind === 'buyback' && !(e.score >= 1)) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const o = B[k].o
  let r
  if (e.kind === 'split') {
    const stop = o * 0.92
    r = null
    for (let j = k; j < k + 5; j++) {
      if (j > k && B[j].o <= stop) { r = (B[j].o / o - 1) * 100; break }
      if (B[j].l <= stop) { r = (stop / o - 1) * 100; break }
    }
    if (r === null) r = (B[k + 4].c / o - 1) * 100
  } else r = (B[k].c / o - 1) * 100
  rs.push({ date: e.date, kind: e.kind, r })
}
rs.sort((a, b) => a.r - b.r)
const q = p => rs[Math.floor(rs.length * p)].r
console.log(`${rs.length}件。1回のそのままの損益%：最悪 ${fmt(rs[0].r)}（${rs[0].date} ${rs[0].kind}）・下から1% ${fmt(q(0.01))}・5% ${fmt(q(0.05))}・真ん中 ${fmt(q(0.5))}・上から5% ${fmt(q(0.95))}`)
console.log('最悪の5件:', rs.slice(0, 5).map(r => `${r.date} ${r.kind} ${fmt(r.r)}`).join(' / '))
for (const pct of [30, 50, 70, 100]) console.log(`  1銘柄 ${pct}% のとき：最悪の1回で資金の ${fmt(rs[0].r * pct / 100)}%・下から1%の日で ${fmt(q(0.01) * pct / 100)}%`)
