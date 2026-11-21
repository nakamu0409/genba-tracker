// 増配の幅（開示 PDF から取り出した「今回 ÷ 前回の予想 − 1」）で、翌日の寄指の買いの成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_div_size.mjs   （先に collect_div_detail.mjs で research/div_detail.json を作る）
// 今の買い方：翌日の寄指（終値×1.02以下）で買い、その日の引けで売る（1日）。参考に5日。TOPIX との差 − 0.2%
// 分け方（先に決めた）：増配の幅 10%未満／10〜20%／20〜50%／50%以上／読めない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../div_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  if (e.kind !== 'divup') continue
  const x = det[`${e.code}|${e.date}|${e.time}`]
  if (!x || x.err) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const k0 = bi.get(B[k].date)
  const k4 = bi.get(B[k + 4].date)
  if (k0 === undefined || k4 === undefined) continue
  rows.push({
    date: e.date, up: x.up_pct ?? null,
    d1: (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2,
    d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(12)} その日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d1); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  5日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d5)))).join('/')}`)
console.log(`寄指で買えた増配 ${rows.length}件（開示 PDF の読めたもの）。TOPIX との差 − 0.2%（選ぶ／確かめる／最後の確認）`)
line('全部', rows)
for (const [n, a, b] of [['10%未満', 0, 10], ['10〜20%', 10, 20], ['20〜50%', 20, 50], ['50%以上', 50, 1e9]]) line(n, rows.filter(r => r.up !== null && r.up >= a && r.up < b))
line('読めない', rows.filter(r => r.up === null))
