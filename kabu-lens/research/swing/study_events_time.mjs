// 企業の行動：発表の時刻・曜日・前の日までの値動きで成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_time.mjs
// 今の買い方（翌日の寄指＝終値×1.02以下。自社株買い〈良い条件1つ以上〉・増配はその日の引け、分割は5日目）。TOPIX との差 − 0.2%
// 分け方：発表の時刻（15:00〜15:29／15:30〜15:59／16:00以降）、発表の曜日、発表の日までの20日の騰落（−10%未満／−10〜0／0〜+10／+10%以上）、25日線より上か下か
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  if (e.kind === 'buyback' && !(e.score >= 1)) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  const hold = e.kind === 'split' ? 5 : 1
  if (e.i < 25 || k + hold >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const x = k + hold - 1
  const k0 = bi.get(B[k].date)
  const k1 = bi.get(B[x].date)
  if (k0 === undefined || k1 === undefined) continue
  let m25 = 0
  for (let j = e.i - 24; j <= e.i; j++) m25 += B[j].c
  m25 /= 25
  rows.push({
    date: e.date, time: e.time || '', dow: new Date(e.date).getDay(),
    r20: (B[e.i].c / B[e.i - 20].c - 1) * 100, above: B[e.i].c > m25,
    r: (B[x].c / B[k].o - 1) * 100 - (bench[k1].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(14)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a))}(${a.length})` }).join('  ')}`)
console.log('平均%（選ぶ／確かめる／最後の確認）')
line('全部', rows)
console.log('■ 発表の時刻')
line('15:00〜15:29', rows.filter(r => r.time >= '15:00' && r.time < '15:30'))
line('15:30〜15:59', rows.filter(r => r.time >= '15:30' && r.time < '16:00'))
line('16:00以降', rows.filter(r => r.time >= '16:00'))
console.log('■ 発表の曜日')
for (const [d, n] of [[1, '月'], [2, '火'], [3, '水'], [4, '木'], [5, '金']]) line(n, rows.filter(r => r.dow === d))
console.log('■ 発表の日までの20日の騰落')
for (const [n, a, b] of [['−10%未満', -1e9, -10], ['−10〜0%', -10, 0], ['0〜+10%', 0, 10], ['+10%以上', 10, 1e9]]) line(n, rows.filter(r => r.r20 >= a && r.r20 < b))
console.log('■ 25日線')
line('上', rows.filter(r => r.above))
line('下', rows.filter(r => !r.above))
