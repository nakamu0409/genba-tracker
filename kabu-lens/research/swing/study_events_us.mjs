// 企業の行動の翌朝の買い（自社株買い 良い条件1つ以上・増配・株式分割）が、前の夜の米国（S&P500 の1日の騰落）で変わるか（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_us.mjs
// 結果（10年・2,339件）：米国−2%以下の夜は寄指で買えた65%・寄り→引け全体比+1.32%（前半+0.83／後半+2.26・買えた53件ほど）、−2〜−1%は−0.23、−1〜+1%は+0.20、+1〜+2%は−0.13、+2%以上は+0.30（前半−0.59／後半+0.53）。向きがそろわず件数も少ないので決まりは変えない。米国が上げた夜は窓が開いて寄指で買えない日が増える（49%→32%）＝寄指が追いかけを自然に止めている
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const gs = JSON.parse(readFileSync(new URL('../world/GSPC.json', import.meta.url), 'utf-8')).chart.result[0]
const spx = gs.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: gs.indicators.quote[0].close[i] })).filter(x => x.c != null)
const usRet = d => { let a = -1; for (let j = 0; j < spx.length; j++) { if (spx[j].date < d) a = j; else break } return a > 0 ? (spx[a].c / spx[a - 1].c - 1) * 100 : null }
const cache = new Map()
const us = d => { if (!cache.has(d)) cache.set(d, usRet(d)); return cache.get(d) }
const rows = []
for (const e of D.events) {
  if (!['buyback', 'divup', 'split'].includes(e.kind)) continue
  if (e.kind === 'buyback' && !((e.score ?? 0) >= 1)) continue
  const B = stocks[e.code].bars, k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l) continue
  const k0 = bi.get(B[k].date); if (k0 === undefined) continue
  const u = us(B[k].date); if (u == null) continue
  const filled = B[k].o <= e.limit
  const oc = (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2
  rows.push({ date: e.date, kind: e.kind, u, filled, oc, gap: (B[k].o / B[e.i].c - 1) * 100 })
}
const A = SPLIT_DATE
const bk = [['米国 −2%以下', -99, -2], ['−2〜−1%', -2, -1], ['−1〜+1%', -1, 1], ['+1〜+2%', 1, 2], ['+2%以上', 2, 99]]
console.log('件数', rows.length)
for (const [n, a, b] of bk) {
  const z = rows.filter(r => r.u >= a && r.u < b)
  const f = z.filter(r => r.filled)
  const half = p => f.filter(r => (p ? r.date >= A : r.date < A)).map(r => r.oc)
  console.log(n.padEnd(10), '件', z.length, '寄指で買えた', (f.length / z.length * 100).toFixed(0) + '%', '窓', fmt(mean(z.map(r => r.gap))), '買えた分の寄り→引け(全体比)', fmt(mean(f.map(r => r.oc))), '前半/後半', fmt(mean(half(0))), fmt(mean(half(1))))
}
