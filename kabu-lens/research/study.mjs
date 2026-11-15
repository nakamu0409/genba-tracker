import { analyze, atr, sma } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
const { bench, stocks } = JSON.parse(readFileSync('bars.json', 'utf-8'))
const SPLIT = '2022-01-01'

// 地合い（TOPIX連動ETFが移動平均の上か）
const bc = bench.map(b => b.c); const b75 = sma(bc, 75); const b200 = sma(bc, 200)
const mkt = new Map(bench.map((b, i) => [b.date, { m75: b75[i] != null && b.c > b75[i], m200: b200[i] != null && b.c > b200[i] }]))

function evalExit(bars, i, a, x) {
  const sig = bars[i]; const e = i + 1
  if (e >= bars.length) return null
  const entry = bars[e].o
  if (entry > sig.c * 1.02) return { skip: true, exitIdx: e }
  let stop = sig.c - x.stopK * a
  if (!(entry > stop)) return { skip: true, exitIdx: e }
  const risk = entry - stop
  const target = x.mode === 'target' ? entry + x.rr * risk : Infinity
  let hiClose = entry
  const fin = (k, px) => ({ r: (px - entry) / risk, pct: (px - entry) / entry * 100, bars: k - e + 1, exitIdx: k, date: sig.date })
  for (let k = e; k < bars.length; k++) {
    const b = bars[k]
    if (b.l <= stop) return fin(k, Math.min(stop, b.o))
    if (b.h >= target) return fin(k, Math.max(target, b.o))
    if (k - e + 1 >= x.maxBars) return fin(k, b.c)
    if (x.mode === 'trail') { hiClose = Math.max(hiClose, b.c); stop = Math.max(stop, hiClose - x.trailK * a) }
    if (x.mode === 'be' && b.h >= entry + risk) stop = Math.max(stop, entry)
  }
  return null // 未決着は数えない
}

const EXITS = {
  'T2R/20d(今)': { mode: 'target', stopK: 2, rr: 2, maxBars: 20 },
  'T3R/40d': { mode: 'target', stopK: 2, rr: 3, maxBars: 40 },
  'T1.5R/10d': { mode: 'target', stopK: 2, rr: 1.5, maxBars: 10 },
  'time10d': { mode: 'time', stopK: 2, maxBars: 10 },
  'time20d': { mode: 'time', stopK: 2, maxBars: 20 },
  'trail3ATR/60d': { mode: 'trail', stopK: 2, trailK: 3, maxBars: 60 },
  'trail2ATR/40d': { mode: 'trail', stopK: 2, trailK: 2, maxBars: 40 },
  'wide3ATR-T2R/30d': { mode: 'target', stopK: 3, rr: 2, maxBars: 30 }
}
const FILTERS = {
  'すべての形': () => true,
  '今のルール(通過)': e => e.pass,
  '下降トレンド以外': e => e.regime !== 'TREND_DOWN',
  '下降以外+週足上': e => e.regime !== 'TREND_DOWN' && e.htf === 1,
  '200日線の上で上向き': e => e.aboveSlow && e.slopeUp,
  '対TOPIX+': e => e.rs != null && e.rs > 0,
  '対TOPIX+10': e => e.rs != null && e.rs > 10,
  '地合い75': (e, m) => m?.m75,
  '地合い200': (e, m) => m?.m200,
  'ブレイクのみ': e => e.kind === 'BREAKOUT',
  '押し目のみ': e => e.kind === 'PULLBACK',
  '勢いのみ': e => e.kind === 'MOMENTUM',
  'ブレイク+押し目': e => e.kind !== 'MOMENTUM',
  '下降以外+対TOPIX+': e => e.regime !== 'TREND_DOWN' && e.rs > 0,
  '下降以外+対TOPIX++地合い200': (e, m) => e.regime !== 'TREND_DOWN' && e.rs > 0 && m?.m200,
  'ブレイク+押し目+下降以外+週足上': e => e.kind !== 'MOMENTUM' && e.regime !== 'TREND_DOWN' && e.htf === 1,
  'ブレイク+地合い200': (e, m) => e.kind === 'BREAKOUT' && m?.m200,
  '押し目+200日線上向き+対TOPIX+': e => e.kind === 'PULLBACK' && e.aboveSlow && e.slopeUp && e.rs > 0,
  '高値から-10%以内': e => e.fromHi != null && e.fromHi > -10,
  '荒い局面のみ': e => e.regime === 'HIGH_VOLATILITY',
  '出来高1.5倍+': e => e.relVol != null && e.relVol >= 1.5
}

const events = {} // code -> events
const A = {}
let nEv = 0
for (const [code, bars] of Object.entries(stocks)) {
  if (bars.length < 400) continue
  const p = analyze(bars, bench, {}, { history: true })
  events[code] = p.signal_history.filter(e => e.kind !== 'STATE')
  A[code] = atr(bars, 14)
  nEv += events[code].length
}
const stat = (rs) => {
  if (!rs.length) return null
  const n = rs.length; const mean = rs.reduce((a, x) => a + x.r, 0) / n
  const sd = Math.sqrt(rs.reduce((a, x) => a + (x.r - mean) ** 2, 0) / Math.max(1, n - 1))
  const gp = rs.filter(x => x.r > 0).reduce((a, x) => a + x.r, 0); const gl = -rs.filter(x => x.r < 0).reduce((a, x) => a + x.r, 0)
  return { n, win: +(rs.filter(x => x.r > 0).length / n * 100).toFixed(1), avgR: +mean.toFixed(3), t: +(mean / (sd / Math.sqrt(n))).toFixed(2), pf: +(gp / (gl || 1)).toFixed(2), avgPct: +(rs.reduce((a, x) => a + x.pct, 0) / n).toFixed(2), bars: +(rs.reduce((a, x) => a + x.bars, 0) / n).toFixed(1) }
}
const rows = []
for (const [fn, f] of Object.entries(FILTERS)) {
  for (const [xn, x] of Object.entries(EXITS)) {
    const res = []
    for (const [code, evs] of Object.entries(events)) {
      const bars = stocks[code]; let free = -1
      for (const e of evs) {
        if (e.i <= free || !f(e, mkt.get(e.date))) continue
        const r = evalExit(bars, e.i, e.atr, x)
        if (!r) continue
        free = r.exitIdx
        if (!r.skip) res.push(r)
      }
    }
    rows.push({ filter: fn, exit: xn, all: stat(res), is: stat(res.filter(r => r.date < SPLIT)), oos: stat(res.filter(r => r.date >= SPLIT)), years: Object.fromEntries([...new Set(res.map(r => r.date.slice(0, 4)))].sort().map(y => [y, +(res.filter(r => r.date.startsWith(y)).reduce((a, r) => a + r.r, 0) / res.filter(r => r.date.startsWith(y)).length).toFixed(2)])) })
  }
}
// 基準: どの日でも買った場合（15本おき）
const base = []
for (const [xn, x] of Object.entries(EXITS)) {
  const res = []
  for (const [code, bars] of Object.entries(stocks)) {
    if (!A[code]) continue
    for (let i = 260; i < bars.length - 1; i += 15) { const r = evalExit(bars, i, A[code][i], x); if (r && !r.skip) res.push(r) }
  }
  base.push({ exit: xn, all: stat(res), is: stat(res.filter(r => r.date < SPLIT)), oos: stat(res.filter(r => r.date >= SPLIT)) })
}
writeFileSync('study.json', JSON.stringify({ rows, base }))
console.log('stocks', Object.keys(events).length, 'events', nEv)
console.log('--- 基準（いつ買っても）'); for (const b of base) console.log(b.exit.padEnd(20), JSON.stringify(b.is), JSON.stringify(b.oos))
const fmt = r => `${r.filter} | ${r.exit} | IS n=${r.is?.n} avgR=${r.is?.avgR} t=${r.is?.t} | OOS n=${r.oos?.n} avgR=${r.oos?.avgR} t=${r.oos?.t} win=${r.oos?.win} pf=${r.oos?.pf} pct=${r.oos?.avgPct} bars=${r.oos?.bars}`
console.log('--- 今のルール'); rows.filter(r => r.filter === '今のルール(通過)').forEach(r => console.log(fmt(r)))
console.log('--- 前半(IS)で良かった上位20（n>=200）と、その後半(OOS)')
rows.filter(r => r.is && r.is.n >= 200 && r.oos && r.oos.n >= 100).sort((a, b) => b.is.avgR - a.is.avgR).slice(0, 20).forEach(r => console.log(fmt(r)))
