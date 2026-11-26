// 企業の行動の翌朝の買い（今の決まり）が、相場の地合い・株価の高さで変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_regime.mjs
// 分け方：TOPIX 連動ETF が200日線の上・下、TOPIX の20日の騰落（−5%以下／−5〜+5%／+5%以上）、株価（500円未満／500〜2,000円／2,000円以上）
// 結果（11/21・927件）：地合いがどうでもプラス（200日線の上 +0.43／+0.25／+0.58、下 +0.23／+0.60、20日で−5%以下の下げ相場でも +0.11／+0.63／+1.82）。地合いで止める必要はない。株価の高さは向きがそろわない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bc = []
for (let i = 0; i < bench.length; i++) bc.push(i > 0 && (bench[i].c / bench[i - 1].c > 1.3 || bench[i].c / bench[i - 1].c < 0.7) ? bc[i - 1] : bench[i].c)
const ma200 = i => { if (i < 200) return null; let s = 0; for (let k = i - 199; k <= i; k++) s += bc[k]; return s / 200 }
const rows = []
for (const e of D.events) {
  if (e.kind === 'buyback') {
    const x = det[`${e.code}|${e.date}|${e.time}`]
    if ((e.score ?? 0) + ((x?.pct ?? 0) >= 2 ? 1 : 0) < 2) continue
  }
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const k0 = bi.get(B[k].date)
  const hold = e.kind === 'split' ? 4 : 0
  const kx = bi.get(B[k + hold].date)
  const ke = bi.get(e.date)
  if (k0 === undefined || kx === undefined || ke === undefined || ke < 200) continue
  const m = ma200(ke)
  rows.push({
    date: e.date, above: bc[ke] > m, t20: (bc[ke] / bc[ke - 20] - 1) * 100, px: B[e.i].c,
    r: (B[k + hold].c / B[k].o - 1) * 100 - (bench[kx].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a))}(${a.length})` }).join(' ')}`)
console.log(`今の決まりで買える企業の行動 ${rows.length}件（TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認）`)
line('全部', rows)
console.log('■ TOPIX が200日線の')
line('上', rows.filter(r => r.above))
line('下', rows.filter(r => !r.above))
console.log('■ TOPIX の20日の騰落')
line('−5%以下', rows.filter(r => r.t20 <= -5))
line('−5〜+5%', rows.filter(r => r.t20 > -5 && r.t20 < 5))
line('+5%以上', rows.filter(r => r.t20 >= 5))
console.log('■ 株価')
line('500円未満', rows.filter(r => r.px < 500))
line('500〜2,000円', rows.filter(r => r.px >= 500 && r.px < 2000))
line('2,000円以上', rows.filter(r => r.px >= 2000))
