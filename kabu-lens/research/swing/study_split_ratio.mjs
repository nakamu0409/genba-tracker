// 株式分割の比率（開示 PDF から取り出した「1株につき N 株」）や、優待・配当にふれているかで、寄指で買って5日目の引けで売る成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_split_ratio.mjs   （先に collect_split_detail.mjs で research/split_detail.json を作る）
// 今の買い方：翌日の寄指（終値×1.02以下）で買い、5営業日目の引けで売る。TOPIX との差 − 0.2%
// 結果（11/21・開示 1,005件中 比率が読めたのは87%。寄指で買えて日足のそろった分割は144件だけ）：比率2は5日で −2.64(21)／−0.62(25)／+0.46(7)、5以上は +7.01(1)／+0.65(8)／+1.27(9)。優待・配当にふれているかは向きがそろわない。件数が少なすぎて決まりは変えない（比率2が弱いかは、練習口座と本番の記録で見続ける）
// 分け方（先に決めた）：比率 2／3〜4／5以上／読めない、株主優待にふれている・いない、配当にふれている・いない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../split_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  if (e.kind !== 'split') continue
  const x = det[`${e.code}|${e.date}|${e.time}`]
  if (!x || x.err) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const k0 = bi.get(B[k].date)
  const k4 = bi.get(B[k + 4].date)
  if (k0 === undefined || k4 === undefined) continue
  rows.push({
    date: e.date, ratio: x.ratio ?? null, yutai: !!x.yutai, div: !!x.div,
    d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2,
    d1: (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} 5日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d5); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  その日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d1)))).join('/')}`)
console.log(`寄指で買えた株式分割 ${rows.length}件（開示 PDF の読めたもの）。TOPIX との差 − 0.2%（選ぶ／確かめる／最後の確認）`)
line('全部', rows)
console.log('■ 比率（1株につき N 株）')
line('2', rows.filter(r => r.ratio === 2))
line('3〜4', rows.filter(r => r.ratio >= 3 && r.ratio <= 4))
line('5以上', rows.filter(r => r.ratio >= 5))
line('読めない', rows.filter(r => r.ratio === null))
console.log('■ 株主優待にふれている')
line('ふれている', rows.filter(r => r.yutai))
line('ふれていない', rows.filter(r => !r.yutai))
console.log('■ 配当にふれている')
line('ふれている', rows.filter(r => r.div))
line('ふれていない', rows.filter(r => !r.div))
