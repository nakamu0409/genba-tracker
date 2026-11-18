// 場中の合図（intradayView）を過去60日の5分足に当てはめ、当たっていたかを調べる
// 使い方: node kabu-lens/research/day/study_5m.mjs   （先に fetch_5m.mjs で five.json を作る）
// ・判定する時刻: 9:30〜14:30 の30分ごと（その時刻までに出来た足だけを使う）
// ・株価は約20分遅れで見えるので、買うのは「判定の時刻 + 20分」の足の始値（遅れを入れないと当たりすぎる）
// ・結果: その日の大引けまで / 翌日の大引けまで の騰落、大引けまでに一番下げた幅、同じ時刻の全銘柄平均との差
import { readFileSync } from 'node:fs'
import { intradayView, intradayContext } from '../../../.claude/scripts/kabu-lens.mjs'

const five = JSON.parse(readFileSync(new URL('./five.json', import.meta.url), 'utf-8'))
const CHECK = [570, 600, 630, 660, 780, 810, 840, 870]
const DELAY = Number(process.env.DELAY ?? 20)
const rows = []

for (const [code, days] of Object.entries(five)) {
  if (!days) continue
  const dates = Object.keys(days).sort()
  const bars = Object.fromEntries(dates.map(d => [d, days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))]))
  const daily = dates.map(d => {
    const b = bars[d]
    return { date: d, o: b[0].o, h: Math.max(...b.map(x => x.h)), l: Math.min(...b.map(x => x.l)), c: b[b.length - 1].c, v: b.reduce((s, x) => s + x.v, 0) }
  })
  const turnover = daily.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20
  if (turnover < 1e8) continue
  for (let i = 26; i < dates.length - 1; i++) {
    const ctx = intradayContext(daily.slice(0, i))
    const day = bars[dates[i]]
    const close = day[day.length - 1].c
    const next = daily[i + 1].c
    for (const t of CHECK) {
      const seen = day.filter(b => b.m + 5 <= t)
      if (seen.length < 3) continue
      const entryBar = day.find(b => b.m >= t + DELAY)
      if (!entryBar) continue
      const v = intradayView(seen, ctx)
      const entry = entryBar.o
      const after = day.filter(b => b.m >= entryBar.m)
      const low = Math.min(...after.map(b => b.l))
      rows.push({
        code, date: dates[i], t, signal: v.signal, kind: v.kind, regime: v.regime, trend: v.daily_trend,
        vsVwap: v.vs_vwap_pct, fromPrev: v.from_prev_pct,
        rClose: (close / entry - 1) * 100, rNext: (next / entry - 1) * 100, mae: (low / entry - 1) * 100
      })
    }
  }
}

// 同じ日・同じ時刻の全銘柄平均（地合いの分）を引く
const base = new Map()
for (const r of rows) {
  const k = r.date + r.t
  const b = base.get(k) || { n: 0, c: 0, x: 0 }
  b.n++
  b.c += r.rClose
  b.x += r.rNext
  base.set(k, b)
}
for (const r of rows) {
  const b = base.get(r.date + r.t)
  r.exClose = r.rClose - b.c / b.n
  r.exNext = r.rNext - b.x / b.n
}

const med = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
function line(name, xs) {
  if (!xs.length) return console.log(name.padEnd(28), 'n=0')
  const avg = k => (xs.reduce((s, r) => s + r[k], 0) / xs.length).toFixed(2)
  const win = (xs.filter(r => r.rClose > 0).length / xs.length * 100).toFixed(0)
  const days = new Set(xs.map(r => r.date)).size
  console.log(name.padEnd(28), `n=${String(xs.length).padStart(6)} 日数=${days}`, `大引け ${avg('rClose')}%（全体比 ${avg('exClose')}） 勝率${win}%`, `翌日 ${avg('rNext')}%（全体比 ${avg('exNext')}）`, `最大の下げ 中央${med(xs.map(r => r.mae)).toFixed(2)}%`)
}
console.log(`判定 ${rows.length}件（${new Set(rows.map(r => r.code)).size}銘柄、遅れ${DELAY}分）`)
line('全体', rows)
for (const s of ['TAKE', 'WAIT', 'SKIP']) line(`合図 ${s}`, rows.filter(r => r.signal === s))
for (const k of ['PULLBACK', 'BREAKOUT']) line(`TAKE ${k}`, rows.filter(r => r.kind === k))
for (const g of ['TREND_UP', 'CHOPPY', 'TREND_DOWN', 'PANIC']) line(`場中 ${g}`, rows.filter(r => r.regime === g))
for (const g of ['UP', 'FLAT', 'DOWN']) line(`日足 ${g}`, rows.filter(r => r.trend === g))
for (const g of ['UP', 'FLAT', 'DOWN']) line(`TAKE かつ日足 ${g}`, rows.filter(r => r.signal === 'TAKE' && r.trend === g))
for (const t of CHECK) line(`TAKE ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, rows.filter(r => r.signal === 'TAKE' && r.t === t))
line('PANIC（急落）のあと', rows.filter(r => r.regime === 'PANIC'))
line('前日比+8%以上', rows.filter(r => r.fromPrev >= 8))

// 前半・後半に分けても同じ向きか、中央値でも同じか（33日しかないので、数日の大きな動きで平均が振れる）
const dates = [...new Set(rows.map(r => r.date))].sort()
const mid = dates[Math.floor(dates.length / 2)]
function robust(name, xs) {
  const a = xs.filter(r => r.date < mid)
  const b = xs.filter(r => r.date >= mid)
  const m = (ys, k) => (ys.length ? (ys.reduce((s, r) => s + r[k], 0) / ys.length).toFixed(2) : '—')
  const md = (ys, k) => (ys.length ? med(ys.map(r => r[k])).toFixed(2) : '—')
  console.log(name.padEnd(24), `前半 n=${a.length} 大引け全体比 ${m(a, 'exClose')} 翌日全体比 ${m(a, 'exNext')}`, `| 後半 n=${b.length} 大引け全体比 ${m(b, 'exClose')} 翌日全体比 ${m(b, 'exNext')}`, `| 中央値 大引け ${md(xs, 'exClose')} 翌日 ${md(xs, 'exNext')}`)
}
console.log('\n--- 前半と後半・中央値 ---')
robust('TAKE', rows.filter(r => r.signal === 'TAKE'))
robust('TAKE BREAKOUT', rows.filter(r => r.kind === 'BREAKOUT'))
robust('TAKE 10:30〜11:00', rows.filter(r => r.signal === 'TAKE' && (r.t === 630 || r.t === 660)))
robust('場中 TREND_UP', rows.filter(r => r.regime === 'TREND_UP'))
robust('場中 TREND_DOWN', rows.filter(r => r.regime === 'TREND_DOWN'))
robust('PANIC', rows.filter(r => r.regime === 'PANIC'))
robust('前日比+8%以上', rows.filter(r => r.fromPrev >= 8))
