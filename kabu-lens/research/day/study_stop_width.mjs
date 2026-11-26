// 場中の買い場の「損切りの幅」ごとの成績と、幅に下限をつけた場合（滑り0.1%込み）。使い方: node --max-old-space-size=6000 kabu-lens/research/day/study_stop_width.mjs
import { readFileSync } from 'node:fs'
import { intradayView, intradayContext } from '../../../.claude/scripts/kabu-lens.mjs'
const five = JSON.parse(readFileSync(new URL('./five.json', import.meta.url), 'utf-8'))
const CHECK = [630, 660, 780]
const ev = []
for (const [code, days] of Object.entries(five)) {
  if (!days) continue
  const dates = Object.keys(days).sort()
  const bars = Object.fromEntries(dates.map(d => [d, days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))]))
  const daily = dates.map(d => { const b = bars[d]; return { date: d, o: b[0].o, h: Math.max(...b.map(x => x.h)), l: Math.min(...b.map(x => x.l)), c: b[b.length - 1].c, v: b.reduce((s, x) => s + x.v, 0) } })
  if (daily.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20 < 1e8) continue
  for (let i = 26; i < dates.length; i++) {
    const ctx = intradayContext(daily.slice(0, i)), day = bars[dates[i]]
    for (const t of CHECK) {
      const seen = day.filter(b => b.m + 5 <= t)
      const v = intradayView(seen, ctx)
      if (!v || v.signal !== 'TAKE') continue
      const k = day.findIndex(b => b.m >= t + 20)
      if (k < 0) continue
      ev.push({ date: dates[i], entry: day[k].o, after: day.slice(k), stop: v.stop_intraday, atr5: v.atr5, vwapNow: v.vwap })
      break
    }
  }
}

const r = (e, p) => (p / e.entry - 1) * 100
function sim(e, stop, slip = 0) {
  for (const b of e.after) {
    if (b.l <= stop) return r(e, Math.min(stop, b.o) * (1 - slip))
  }
  return r(e, e.after[e.after.length - 1].c)
}
const hold = e => r(e, e.after[e.after.length - 1].c)
const dates = [...new Set(ev.map(e => e.date))].sort(), mid = dates[Math.floor(dates.length / 2)]
const f = x => (x >= 0 ? '+' : '') + x.toFixed(2)
const st = (name, xs) => {
  if (!xs.length) return console.log(name, 'n=0')
  const m = ys => ys.length ? ys.reduce((s, z) => s + z.x, 0) / ys.length : NaN
  const A = xs.filter(z => z.d < mid), B = xs.filter(z => z.d >= mid)
  const hit = xs.filter(z => z.hit).length
  console.log(name.padEnd(34), `n=${String(xs.length).padStart(5)} 平均${f(m(xs))}（前${f(m(A))}/後${f(m(B))}） 勝${Math.round(xs.filter(z => z.x > 0).length / xs.length * 100)}% 損切りに当たる${Math.round(hit / xs.length * 100)}% 最悪${f(Math.min(...xs.map(z => z.x)))}`)
}
const width = e => (e.entry - e.stop) / e.entry * 100
console.log(`買い場 ${ev.length}回`)
const hitOf = (e, stop) => e.after.some(b => b.l <= stop)
for (const [lo, hi] of [[-99, 0.3], [0.3, 0.6], [0.6, 1], [1, 99]]) {
  const es = ev.filter(e => width(e) >= lo && width(e) < hi)
  console.log(`\n-- 損切りの幅 ${lo < 0 ? '0.3%未満（買値より上も含む）' : lo + '〜' + hi + '%'}`)
  st('大引けまで持つ', es.map(e => ({ d: e.date, x: hold(e) })))
  st('今の損切り', es.map(e => ({ d: e.date, x: sim(e, e.stop), hit: hitOf(e, e.stop) })))
  st('今の損切り・滑り0.1%', es.map(e => ({ d: e.date, x: sim(e, e.stop, 0.001), hit: hitOf(e, e.stop) })))
}
console.log('\n-- 全体：損切りの幅に下限をつけたら（滑り0.1%込み）')
for (const minW of [0, 0.5, 0.8, 1.0, 1.5]) {
  st(`下限${minW}%`, ev.map(e => { const s = Math.min(e.stop, e.entry * (1 - minW / 100)); return { d: e.date, x: sim(e, s, 0.001), hit: hitOf(e, s) } }))
}
for (const k of [1, 2, 3]) {
  st(`買値−5分足の値幅×${k}と今の低い方`, ev.map(e => { const s = Math.min(e.stop, e.entry - k * e.atr5); return { d: e.date, x: sim(e, s, 0.001), hit: hitOf(e, s) } }))
}
st('大引けまで持つ（参考）', ev.map(e => ({ d: e.date, x: hold(e) })))
