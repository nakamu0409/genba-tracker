// 場中の買い場の形（絞り込む前）を、1日の値幅（ATR÷株価）ごとに分けて、損益を%とR（損切りまでの幅を1とした倍数）で比べる
// 使い方: node --max-old-space-size=6000 kabu-lens/research/day/study_vol.mjs
// ・見えてから20分後の足の始値で買う。損切りは場中の損切りの目安（買値の−1%より近くには置かない）、届かなければ大引け。逆指値は0.1%不利に約定
import { readFileSync } from 'node:fs'
import { intradayView, intradayContext } from '../../../.claude/scripts/kabu-lens.mjs'
const five = JSON.parse(readFileSync(new URL('./five.json', import.meta.url), 'utf-8'))
const ev = []
for (const [code, days] of Object.entries(five)) {
  if (!days) continue
  const dates = Object.keys(days).sort()
  const bars = Object.fromEntries(dates.map(d => [d, days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))]))
  const daily = dates.map(d => { const b = bars[d]; return { date: d, o: b[0].o, h: Math.max(...b.map(x => x.h)), l: Math.min(...b.map(x => x.l)), c: b[b.length - 1].c, v: b.reduce((s, x) => s + x.v, 0) } })
  for (let i = 26; i < dates.length; i++) {
    const past = daily.slice(0, i)
    if (past.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20 < 1e8) continue
    const ctx = intradayContext(past)
    const day = bars[dates[i]]
    for (const t of [630, 660, 690, 720, 750, 780]) {
      const v = intradayView(day.filter(b => b.m + 5 <= t), ctx)
      if (!v || !(v.signal === 'TAKE' || v.raw_take)) continue
      const k = day.findIndex(b => b.m >= t + 20)
      if (k < 0) continue
      const entry = day[k].o
      const swingLow = Math.min(...day.filter(b => b.m + 5 <= t).slice(-6).map(b => b.l))
      const stop = Math.min(Math.min(swingLow, v.vwap) - 0.3 * (v.atr5 || 0), entry * 0.99)
      let exit = day[day.length - 1].c
      for (const b of day.slice(k)) {
        if (b.o <= stop) { exit = b.o * 0.999; break }
        if (b.l <= stop) { exit = stop * 0.999; break }
      }
      const atrPct = ctx.atrDay / ctx.prevClose * 100
      ev.push({ date: dates[i], atrPct, low: ctx.prevClose < 500, pct: (exit / entry - 1) * 100, hold: (day[day.length - 1].c / entry - 1) * 100, R: (exit - entry) / (entry - stop), riskPct: (entry - stop) / entry * 100, filtered: v.signal === 'TAKE' })
      break
    }
  }
}
const dates = [...new Set(ev.map(e => e.date))].sort(), mid = dates[Math.floor(dates.length / 2)]
const f = x => (x >= 0 ? '+' : '') + x.toFixed(2)
const avg = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length
const line = (name, xs) => {
  if (!xs.length) return console.log(name.padEnd(22), 'n=0')
  const A = xs.filter(x => x.date < mid), B = xs.filter(x => x.date >= mid)
  console.log(name.padEnd(22), `n=${String(xs.length).padStart(5)}`, `| 損切り+大引け 平均${f(avg(xs, 'pct'))}%（前${f(avg(A, 'pct'))}/後${f(avg(B, 'pct'))}） 勝${Math.round(xs.filter(x => x.pct > 0).length / xs.length * 100)}%`,
    `| R 平均${f(avg(xs, 'R'))}（前${f(avg(A, 'R'))}/後${f(avg(B, 'R'))}）`, `| 損切りの幅 平均${avg(xs, 'riskPct').toFixed(2)}%`, `| 持つだけ ${f(avg(xs, 'hold'))}%`)
}
console.log(`買い場の形（絞り込む前） ${ev.length}回、${dates[0]}〜${dates[dates.length - 1]}`)
for (const [lo, hi] of [[0, 2], [2, 3], [3, 4], [4, 6], [6, 100]]) line(`値幅 ${lo}〜${hi}%`, ev.filter(e => e.atrPct >= lo && e.atrPct < hi))
line('500円未満', ev.filter(e => e.low))
line('今の絞り込み後', ev.filter(e => e.filtered))
