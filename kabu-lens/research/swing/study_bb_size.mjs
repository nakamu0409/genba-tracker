// 自社株買いの規模（開示 PDF から取り出した取得の割合・期間・方法）で、翌日の買いの成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_bb_size.mjs   （先に collect_bb_detail.mjs で research/bb_detail.json を作る）
// 今の買い方：翌日の寄指（終値×1.02以下）で買い、その日の引けで売る。TOPIX との差 − 0.2%。良い条件の無いものも含めて全部見る
// 分け方（先に決めた）：取得の割合（発行済株式総数に対する%）1%未満／1〜2%／2〜5%／5%以上、取得期間 3か月以内／3〜6か月／6か月超、
//   取得方法（市場／ToSTNeT／公開買付／信託）、今の「良い条件」の数との重なり
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  if (e.kind !== 'buyback') continue
  const x = det[`${e.code}|${e.date}|${e.time}`]
  if (!x || x.err) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const k0 = bi.get(B[k].date)
  const k4 = bi.get(B[k + 4].date)
  if (k0 === undefined || k4 === undefined) continue
  rows.push({
    date: e.date, score: e.score ?? 0, pct: x.pct ?? null, days: x.days ?? null, method: x.method,
    d1: (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2,
    d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2,
    gap: (B[k].o / B[e.i].c - 1) * 100
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(18)} その日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d1); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  5日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d5)))).join('/')}  窓 ${fmt(mean(z.map(r => r.gap)))}`)
console.log(`寄指で買えた自社株買い ${rows.length}件（開示 PDF の読めたもの）。TOPIX との差 − 0.2%（選ぶ／確かめる／最後の確認）`)
line('全部', rows)
console.log('■ 取得の割合（発行済株式総数に対する%）')
for (const [n, a, b] of [['1%未満', 0, 1], ['1〜2%', 1, 2], ['2〜5%', 2, 5], ['5%以上', 5, 1e9]]) line(n, rows.filter(r => r.pct !== null && r.pct >= a && r.pct < b))
line('割合が読めない', rows.filter(r => r.pct === null))
console.log('■ 取得期間')
for (const [n, a, b] of [['3か月以内', 0, 95], ['3〜6か月', 95, 190], ['6か月超', 190, 1e9]]) line(n, rows.filter(r => r.days !== null && r.days >= a && r.days < b))
console.log('■ 取得方法')
for (const m of ['市場', 'ToSTNeT', 'TOB', '信託', 'その他']) line(m, rows.filter(r => r.method === m))
console.log('■ 今の「良い条件」の数 × 割合2%以上')
for (const sc of [0, 1, 2]) {
  line(`条件${sc}${sc === 2 ? '以上' : ''}・2%以上`, rows.filter(r => (sc === 2 ? r.score >= 2 : r.score === sc) && r.pct >= 2))
  line(`条件${sc}${sc === 2 ? '以上' : ''}・2%未満`, rows.filter(r => (sc === 2 ? r.score >= 2 : r.score === sc) && r.pct !== null && r.pct < 2))
}
