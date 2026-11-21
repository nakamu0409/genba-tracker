// 配当の権利落ちの日の値動き（株価のデータが配当で直されているか、高配当株のスイングが見かけ上損に見えるか）（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_exdiv.mjs
// 権利落ちの日：3月・9月の月末の2営業日前の翌日（＝月末の前の営業日）。2024-09・2025-03・2025-09・2026-03
// 予想配当利回り（J-Quants の FDivAnn ÷ 株価）で分け、その日の終値の前日比（TOPIX との差）を比べる
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt } from './lib_signals.mjs'

const fins = JSON.parse(readFileSync(new URL('../jq_fins.json', import.meta.url), 'utf-8'))
const div = {}
for (const l of Object.values(fins)) for (const r of l) if (r.FDivAnn !== '' && Number.isFinite(+r.FDivAnn) && +r.FDivAnn >= 0) (div[r.Code.slice(0, 4)] ||= []).push([r.DiscDate, +r.FDivAnn])
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const dates = bench.map(b => b.date)
const exDays = []
for (const ym of ['2024-09', '2025-03', '2025-09', '2026-03']) {
  const inMonth = dates.filter(d => d.startsWith(ym))
  exDays.push(inMonth[inMonth.length - 2]) // 月末の前の営業日が権利落ち（受け渡しが2営業日のため）
}
console.log('権利落ちの日:', exDays.join(' '))
for (const ex of exDays) {
  const k = bi.get(ex)
  const bm = (bench[k].c / bench[k - 1].c - 1) * 100
  const g = { '無配': [], '0〜2%': [], '2〜3.5%': [], '3.5%以上': [] }
  for (const st of Object.values(stocks)) {
    const i = st.idx.get(ex)
    if (i === undefined || i < 1 || st.turn[i - 1] < 1e8) continue
    const l = div[st.code]
    if (!l) continue
    let dv = null
    for (const [d, v] of l) { if (d >= ex) break; dv = v }
    if (dv === null) continue
    const y = dv / st.bars[i - 1].c * 100
    const r = (st.bars[i].c / st.bars[i - 1].c - 1) * 100 - bm
    g[y === 0 ? '無配' : y < 2 ? '0〜2%' : y < 3.5 ? '2〜3.5%' : '3.5%以上'].push(r)
  }
  console.log(`  ${ex}  ` + Object.entries(g).map(([n, a]) => `${n} ${fmt(mean(a))}%（${a.length}）`).join('  '))
}
