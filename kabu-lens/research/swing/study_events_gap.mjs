// 企業の行動：翌日の寄りの窓ごとの成績（今は終値+2%以内だけ買う。+2〜+5%を買ったらどうか）（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_gap.mjs
// 自社株買い・増配は寄り→その日の引け、分割は寄り→5日目の引け。TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  const B = stocks[e.code].bars
  const k = e.i + 1
  const hold = e.kind === 'split' ? 5 : 1
  if (k + hold >= B.length || B[k].h === B[k].l) continue
  const x = k + hold - 1
  const k0 = bi.get(B[k].date)
  const k1 = bi.get(B[x].date)
  if (k0 === undefined || k1 === undefined) continue
  const grp = e.kind === 'buyback' ? (e.score >= 1 ? '自社株買い（良い条件1つ以上）' : '自社株買い（良い条件なし）') : e.kind === 'divup' ? '増配' : '株式分割'
  rows.push({ grp, date: e.date, gap: (B[k].o / B[e.i].c - 1) * 100, r: (B[x].c / B[k].o - 1) * 100 - (bench[k1].c / bench[k0].o - 1) * 100 - 0.2 })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
for (const g of [...new Set(rows.map(r => r.grp))]) {
  console.log(`■ ${g}`)
  for (const [n, a, b] of [['窓 0%未満', -1e9, 0], ['0〜+2%（今買う）', 0, 2.0001], ['+2〜+3%', 2.0001, 3], ['+3〜+5%', 3, 5], ['+5%以上', 5, 1e9]]) {
    const z = rows.filter(r => r.grp === g && r.gap >= a && r.gap < b)
    console.log(`  ${n.padEnd(14)} ${[0, 1, 2].map(p => { const q = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(q))}(${q.length})` }).join('  ')}`)
  }
}
