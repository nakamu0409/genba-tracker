// 練習口座（paperStep）を、過去60日の5分足（five.json）でさかのぼって動かしてみる
// 使い方: node --max-old-space-size=6000 kabu-lens/research/day/paper_backfill.mjs [--swing]
//   --swing を付けると、1時間足（hour.json）から作った日足で、その日の夜の買い候補（analyze → candidateRow の通過）も出してスイングも動かす
import { readFileSync, writeFileSync } from 'node:fs'
import { paperNew, paperStep, paperSummary, intradayContext, analyze, candidateRow } from '../../../.claude/scripts/kabu-lens.mjs'

const five = JSON.parse(readFileSync(new URL('./five.json', import.meta.url), 'utf-8'))
const swing = process.argv.includes('--swing')
const toBars = rows => rows.map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))
const dailyOf = (days, dates) => dates.map(d => {
  const b = days[d]
  return { date: d, o: b[0][1], h: Math.max(...b.map(x => x[2])), l: Math.min(...b.map(x => x[3])), c: b[b.length - 1][4], v: b.reduce((s, x) => s + x[5], 0) }
})
const codes = Object.keys(five).filter(c => five[c])
const allDates = [...new Set(codes.flatMap(c => Object.keys(five[c])))].sort()
const daily = Object.fromEntries(codes.map(c => [c, dailyOf(five[c], Object.keys(five[c]).sort())]))

// スイング用：1時間足から日足（3年分）
let hourDaily = null
if (swing) {
  const hour = JSON.parse(readFileSync(new URL('./hour.json', import.meta.url), 'utf-8'))
  hourDaily = {}
  for (const [c, days] of Object.entries(hour)) {
    if (!days) continue
    const ds = Object.keys(days).sort()
    hourDaily[c] = ds.map(d => {
      const b = days[d]
      return { date: d, o: b[0][1], h: Math.max(...b.map(x => x[2])), l: Math.min(...b.map(x => x[3])), c: b[b.length - 1][4], v: b.reduce((s, x) => s + x[5], 0) }
    })
  }
}

let st = paperNew()
const all = []
const cands = []
for (let i = 26; i < allDates.length; i++) {
  const date = allDates[i]
  const stocks = {}
  for (const c of codes) {
    const bars = five[c][date]
    if (!bars?.length) continue
    const past = daily[c].filter(b => b.date < date)
    if (past.length < 26) continue
    const turnover = past.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turnover < 1e8) continue
    stocks[c] = { name: c, bars: toBars(bars), ctx: intradayContext(past), turnover }
  }
  const r = paperStep(st, { date, stocks, cands })
  st = r.state
  all.push(...r.trades)
  // その日の夜の買い候補（翌営業日に使う）
  if (swing) {
    for (const c of Object.keys(stocks)) {
      const hb = hourDaily[c]?.filter(b => b.date <= date)
      if (!hb || hb.length < 210) continue
      try {
        const pk = analyze(hb.slice(-400), [], { symbol: `TSE:${c}` })
        const row = candidateRow(pk, { code: c, name: c })
        if (row?.pass && row.date === date) cands.push(row)
      } catch {}
    }
  }
  const h = st.history[st.history.length - 1]
  console.error(date, '資産', h.equity, '決着', r.trades.length, '持ち', st.positions.length)
}
const sum = paperSummary(st, all)
console.log(JSON.stringify(sum, null, 2))
writeFileSync(new URL(`./paper_backfill${swing ? '_swing' : ''}.json`, import.meta.url), JSON.stringify({ summary: sum, state: st, trades: all }))
