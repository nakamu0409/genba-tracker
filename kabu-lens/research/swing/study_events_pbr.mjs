// 自社株買い・増配・株式分割の翌日の買いを、PBR（2年分の J-Quants）で分ける（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_pbr.mjs
// 買い方は今の決まり（翌日の寄指＝終値×1.02以下。自社株買い・増配はその日の引け、分割は5日目の引けで売る）。TOPIX との差 − 0.2%
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt } from './lib_signals.mjs'

const fins = JSON.parse(readFileSync(new URL('../jq_fins.json', import.meta.url), 'utf-8'))
const num = v => (v === '' || v === null || v === undefined || !Number.isFinite(+v) ? null : +v)
const byCode = {}
for (const list of Object.values(fins)) for (const r of list) (byCode[r.Code.slice(0, 4)] ||= []).push(r)
for (const l of Object.values(byCode)) l.sort((a, b) => a.DiscDate.localeCompare(b.DiscDate))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  const l = byCode[e.code]
  if (!l || e.date < '2024-09-01') continue
  let bps = null
  for (const r of l) {
    if (r.DiscDate > e.date) break
    if (num(r.BPS) !== null) bps = num(r.BPS)
  }
  if (!(bps > 0)) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  const hold = e.kind === 'split' ? 5 : 1
  if (k + hold >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const x = k + hold - 1
  const k0 = bi.get(B[k].date)
  const k1 = bi.get(B[x].date)
  if (k0 === undefined || k1 === undefined) continue
  const r = (B[x].c / B[k].o - 1) * 100 - (bench[k1].c / bench[k0].o - 1) * 100 - 0.2
  const grp = e.kind === 'buyback' ? (e.score >= 1 ? '自社株買い（良い条件1つ以上）' : '自社株買い（良い条件なし）') : e.kind === 'divup' ? '増配' : '株式分割'
  rows.push({ grp, r, pbr: B[e.i].c / bps })
}
for (const g of [...new Set(rows.map(r => r.grp))]) {
  const z = rows.filter(r => r.grp === g)
  const cell = f => { const a = z.filter(f).map(r => r.r); return `${fmt(mean(a))}%（${a.length}）` }
  console.log(`■ ${g}：PBR 1倍未満 ${cell(r => r.pbr < 1)}  1〜2倍 ${cell(r => r.pbr >= 1 && r.pbr < 2)}  2倍以上 ${cell(r => r.pbr >= 2)}`)
}
