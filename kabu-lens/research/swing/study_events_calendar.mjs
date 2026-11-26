// 企業の行動の翌朝の買い（今の決まり：自社株買いは良い条件＋割合2%以上で2つ以上、増配、株式分割は5日）が、曜日・月で変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_calendar.mjs
// 分け方：買う日の曜日（月〜金）、発表の月（決算の多い月＝2・5・8・11月とそれ以外）、同じ日に企業の行動がいくつ出たか（1／2〜3／4以上）
// 結果（11/21・956件）：曜日・月・同じ日の数のどれも、3つの期間で向きがそろわない（例：月曜 −0.50／+0.67／+1.12、4つ以上の日 −0.06／+0.15／+0.99）。決まりは変えない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const cnt = {}
for (const e of D.events) cnt[e.date] = (cnt[e.date] || 0) + 1
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
  if (k0 === undefined || kx === undefined) continue
  rows.push({
    date: e.date, kind: e.kind, wd: new Date(B[k].date + 'T00:00:00Z').getUTCDay(), mon: +e.date.slice(5, 7), n: cnt[e.date],
    r: (B[k + hold].c / B[k].o - 1) * 100 - (bench[kx].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(14)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a))}(${a.length})` }).join(' ')}`)
console.log(`今の決まりで買える企業の行動 ${rows.length}件（自社株買い・増配はその日、分割は5日。TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認）`)
line('全部', rows)
console.log('■ 買う日の曜日')
for (const [n, w] of [['月', 1], ['火', 2], ['水', 3], ['木', 4], ['金', 5]]) line(n, rows.filter(r => r.wd === w))
console.log('■ 発表の月')
line('2・5・8・11月', rows.filter(r => [2, 5, 8, 11].includes(r.mon)))
line('それ以外', rows.filter(r => ![2, 5, 8, 11].includes(r.mon)))
console.log('■ 同じ日に出た企業の行動の数')
line('1つ', rows.filter(r => r.n === 1))
line('2〜3', rows.filter(r => r.n >= 2 && r.n <= 3))
line('4以上', rows.filter(r => r.n >= 4))
