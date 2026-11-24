// スイングは実際に何日持つのか（2026-11-24 本人の質問。今の決まり：翌日の寄りで買う（終値+2%以内）、損切り＝終値 − 2×ATR、目標 3R、最長40営業日）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_hold_days.mjs
import { loadAll, simulate, mean, median, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14'
const per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const D = loadAll()
const rows = []
for (const s of D.swing) {
  const B = D.stocks[s.code].bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  rows.push({ p: per(s.date), days: t.x - t.e + 1, reason: t.reason, r: t.r, pct: t.pct, stopPct: (s.stop / t.entry - 1) * 100 })
}
const bucket = d => (d <= 5 ? '1〜5日' : d <= 10 ? '6〜10日' : d <= 20 ? '11〜20日' : d <= 39 ? '21〜39日' : '40日（期限）')
const B5 = ['1〜5日', '6〜10日', '11〜20日', '21〜39日', '40日（期限）']
console.log(`件数 ${rows.length}。持った日数の平均 ${mean(rows.map(r => r.days)).toFixed(1)}日・真ん中 ${median(rows.map(r => r.days))}日。損切りの幅の真ん中 ${median(rows.map(r => r.stopPct)).toFixed(1)}%`)
for (const [nm, f] of [['損切り', r => r.reason === 'stop'], ['目標', r => r.reason === 'target'], ['期限', r => r.reason === 'time']]) {
  const z = rows.filter(f)
  console.log(`  ${nm}：${(z.length / rows.length * 100).toFixed(0)}%・持った日数の平均 ${mean(z.map(r => r.days)).toFixed(1)}日・平均R ${fmt(mean(z.map(r => r.r)), 2)}`)
}
console.log('持った日数ごと：割合・平均R（前半／後半／直近の割合）')
for (const b of B5) {
  const z = rows.filter(r => bucket(r.days) === b)
  const pp = [0, 1, 2].map(p => { const a = rows.filter(r => r.p === p); return (a.filter(r => bucket(r.days) === b).length / a.length * 100).toFixed(0) + '%' }).join('／')
  console.log(`  ${b.padEnd(8)} ${(z.length / rows.length * 100).toFixed(0)}%・平均R ${fmt(mean(z.map(r => r.r)), 2)}  （${pp}）`)
}
