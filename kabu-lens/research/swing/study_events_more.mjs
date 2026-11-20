// ほかの開示の種類でも「翌日の寄りで買う」が使えるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_more.mjs
// 対象：research/irevents.json（IR BANK の開示）。15:00 以降の発表・決算の日（irhist）と同じ日は除く・売買代金1億円以上
// 買う：翌日の寄りが終値×1.02 以下なら寄りで（今の企業の行動と同じ）。売る：その日の引け／5日目の引け。TOPIX との差 − 0.2%
// 種類（先に決めた）：記念配当・特別配当／株主優待の新設・拡充／株主優待の廃止／自己株式の消却／業務提携・資本業務提携／
//   特別利益／特別損失／子会社化・株式取得／立会外分売／第三者割当／新株予約権
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const KINDS = [
  ['記念配当・特別配当', t => /(記念配当|特別配当)/.test(t) && !/(減配|無配)/.test(t)],
  ['株主優待の新設・拡充', t => /株主優待/.test(t) && /(新設|導入|拡充|変更.*拡充)/.test(t) && !/廃止/.test(t)],
  ['株主優待の廃止', t => /株主優待/.test(t) && /廃止/.test(t)],
  ['自己株式の消却', t => /消却/.test(t) && /自己株式/.test(t)],
  ['業務提携・資本業務提携', t => /(業務提携|資本提携)/.test(t) && !/解消/.test(t)],
  ['特別利益', t => /特別利益/.test(t)],
  ['特別損失', t => /特別損失/.test(t)],
  ['子会社化・株式取得', t => /(子会社化|株式取得|株式の取得)/.test(t) && !/自己株式/.test(t)],
  ['立会外分売', t => /立会外分売/.test(t) && !/(結果|中止)/.test(t)],
  ['第三者割当', t => /第三者割当/.test(t) && !/自己株式の処分/.test(t)],
  ['新株予約権', t => /新株予約権/.test(t) && !/(ストック|役員|従業員|株式報酬)/.test(t)]
]
const rows = []
for (const [code, list] of Object.entries(irev)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  const kd = new Set((irh[code] || []).filter(Boolean).map(r => r.date))
  const B = st.bars
  const seen = new Set()
  for (const r of list) {
    if (!r?.date || (r.time || '') < '15:00' || kd.has(r.date)) continue
    const i = st.idx.get(r.date)
    if (i === undefined || i < 20 || i + 6 >= B.length || st.turn[i] < 1e8) continue
    const k = i + 1
    if (B[k].h === B[k].l) continue
    for (const [name, f] of KINDS) {
      if (!f(r.title || '') || seen.has(name + r.date)) continue
      seen.add(name + r.date)
      const k0 = bi.get(B[k].date)
      const k1 = bi.get(B[k].date)
      const k5 = bi.get(B[k + 4].date)
      if (k0 === undefined || k5 === undefined) continue
      const gap = (B[k].o / B[i].c - 1) * 100
      rows.push({
        name, date: r.date, gap, ok: B[k].o <= B[i].c * 1.02,
        d1: (B[k].c / B[k].o - 1) * 100 - (bench[k1].c / bench[k0].o - 1) * 100 - 0.2,
        d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k5].c / bench[k0].o - 1) * 100 - 0.2
      })
    }
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
console.log('寄指で買える日（終値+2%以内）だけ。その日の引け／5日目の引け（選ぶ／確かめる／最後の確認）。かっこは件数。窓は全部の平均')
for (const [name] of KINDS) {
  const all = rows.filter(r => r.name === name)
  const z = all.filter(r => r.ok)
  const c = k => [0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r[k])))).join('/')
  const n = [0, 1, 2].map(p => z.filter(r => per(r) === p).length).join('・')
  console.log(`  ${name.padEnd(14)} 窓${fmt(mean(all.map(r => r.gap)))}  その日 ${c('d1')}  5日 ${c('d5')}（${n}）`)
}
