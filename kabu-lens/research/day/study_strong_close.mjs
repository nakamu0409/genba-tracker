// 低位株・荒い株の「強い引け」を、1時間足（約3年分）で数を増やして確かめる
// 使い方: node kabu-lens/research/day/study_strong_close.mjs   （先に fetch_60m.mjs で hour.json を作る）
// ・判定は 15:00 時点（14時台の足まで）。5分足の研究（14:30 判定・14:50 買い）より30分遅いが、1時間足ではここが一番近い
// ・買うのは 15:00 の足の始値（無ければ 14時台の終値）。売りは 当日の大引け／翌日の寄り／翌日10時／翌日13時／翌日の大引け
// ・比べる相手は、同じ日に同じ時刻で買った全銘柄の平均（地合いの分を引く）
// ・銘柄は今の売買の多い約1,150銘柄なので、3年前に上場廃止になった株などは入っていない（生き残りの偏りがある）
import { readFileSync } from 'node:fs'
import { intradayContext } from '../../../.claude/scripts/kabu-lens.mjs'

const hour = JSON.parse(readFileSync(new URL('./hour.json', import.meta.url), 'utf-8'))
const rows = []
for (const [code, days] of Object.entries(hour)) {
  if (!days) continue
  const dates = Object.keys(days).sort()
  const bars = Object.fromEntries(dates.map(d => [d, days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))]))
  const daily = dates.map(d => {
    const b = bars[d]
    return { date: d, o: b[0].o, h: Math.max(...b.map(x => x.h)), l: Math.min(...b.map(x => x.l)), c: b[b.length - 1].c, v: b.reduce((s, x) => s + x.v, 0) }
  })
  for (let i = 26; i < dates.length - 1; i++) {
    const day = bars[dates[i]]
    const nd = bars[dates[i + 1]]
    const seen = day.filter(b => b.m <= 840)
    if (seen.length < 4 || !nd.length) continue
    const ctx = intradayContext(daily.slice(0, i))
    if (!(ctx.prevClose > 0) || !(ctx.atrDay > 0)) continue
    const turnover = daily.slice(i - 20, i).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turnover < 1e8) continue
    let pv = 0
    let vv = 0
    for (const b of seen) {
      pv += (b.h + b.l + b.c) / 3 * b.v
      vv += b.v
    }
    const p = seen[seen.length - 1].c
    const vwap = vv ? pv / vv : p
    const hi = Math.max(...seen.map(b => b.h))
    const lo = Math.min(...seen.map(b => b.l))
    const e15 = day.find(b => b.m === 900)
    // 張り付き（買えない）：14時台か15時台の足に値幅が無い＝ストップ高などで売り物が無いことが多い
    const b14 = day.find(b => b.m === 840)
    const stuck = !b14 || !e15 || b14.h === b14.l || e15.h === e15.l || e15.o >= hi // 14時台か15時の足が無い日も、売買が無かった（張り付き）とみなす
    const entry = e15 ? e15.o : p
    const at = m => (nd.find(b => b.m >= m) || nd[nd.length - 1]).o
    const r = x => (x / entry - 1) * 100
    rows.push({
      code, date: dates[i], stuck,
      low: ctx.prevClose < 500 || ctx.atrDay / ctx.prevClose >= 0.04,
      fromPrev: (p / ctx.prevClose - 1) * 100, aboveV: p > vwap, pos: hi > lo ? (p - lo) / (hi - lo) : 0.5,
      dev25: (ctx.prevClose / ctx.ma25 - 1) * 100,
      close: r(day[day.length - 1].c), open: r(nd[0].o), t10: r(at(600)), t13: r(at(780)), nclose: r(nd[nd.length - 1].c),
      nhigh: r(Math.max(...nd.map(b => b.h))), nlow: r(Math.min(...nd.map(b => b.l)))
    })
  }
}
const K = ['close', 'open', 't10', 't13', 'nclose']
const base = new Map()
for (const r of rows) {
  const b = base.get(r.date) || { n: 0, ...Object.fromEntries(K.map(k => [k, 0])) }
  b.n++
  for (const k of K) b[k] += r[k]
  base.set(r.date, b)
}
for (const r of rows) {
  const b = base.get(r.date)
  for (const k of K) r['ex_' + k] = r[k] - b[k] / b.n
}
const med = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
const f = x => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(2) : '  —  ')
function line(name, xs) {
  if (!xs.length) return console.log(name.padEnd(30), 'n=0')
  const avg = k => xs.reduce((s, r) => s + r[k], 0) / xs.length
  const win = k => Math.round(xs.filter(r => r[k] > 0).length / xs.length * 100)
  const byYear = ['2024', '2025', '2026'].map(y => {
    const ys = xs.filter(r => r.date.startsWith(y))
    return `${y.slice(2)}年 ${ys.length ? f(ys.reduce((s, r) => s + r.ex_t13, 0) / ys.length) : '  —  '}(${ys.length})`
  })
  console.log(name.padEnd(30), `n=${String(xs.length).padStart(5)} 日=${String(new Set(xs.map(r => r.date)).size).padStart(3)}`,
    `| 全体比 引け${f(avg('ex_close'))} 翌寄り${f(avg('ex_open'))} 翌10時${f(avg('ex_t10'))} 翌13時${f(avg('ex_t13'))} 翌引け${f(avg('ex_nclose'))}`,
    `| 実額 翌13時 平均${f(avg('t13'))} 中央${f(med(xs.map(r => r.t13)))} 勝${win('t13')}%`,
    `| 翌日の安値 中央${f(med(xs.map(r => r.nlow)))} 高値 中央${f(med(xs.map(r => r.nhigh)))}`,
    `| 翌13時の全体比 ${byYear.join(' ')}`)
}
console.log(`判定 ${rows.length}回（${new Set(rows.map(r => r.code)).size}銘柄、${rows[0]?.date ?? ''}〜）`)
const L = rows.filter(r => r.low)
const N = rows.filter(r => !r.low)
for (const [g, G] of [['低位・荒い株', L], ['ふつうの株', N]]) {
  console.log(`\n=== ${g} ===`)
  line('全部', G)
  line('前日比 +5〜10%', G.filter(r => r.fromPrev >= 5 && r.fromPrev < 10))
  line('前日比 +5〜10%・VWAP上・高値圏', G.filter(r => r.fromPrev >= 5 && r.fromPrev < 10 && r.aboveV && r.pos >= 0.7))
  line('前日比 +10〜20%', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20))
  line('★強い引け（+10〜20%・VWAP上・高値圏）', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20 && r.aboveV && r.pos >= 0.7))
  line('  同・25日線から+30%未満', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20 && r.aboveV && r.pos >= 0.7 && r.dev25 < 30))
  line('  同・25日線から+30%以上', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20 && r.aboveV && r.pos >= 0.7 && r.dev25 >= 30))
  line('+10〜20%・VWAP下か高値圏でない', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20 && !(r.aboveV && r.pos >= 0.7)))
  line('前日比 +20%以上', G.filter(r => r.fromPrev >= 20))
  line('前日比 +20%以上・VWAP上・高値圏', G.filter(r => r.fromPrev >= 20 && r.aboveV && r.pos >= 0.7))
  line('  同・張り付きを除く（買えたもの）', G.filter(r => r.fromPrev >= 20 && r.aboveV && r.pos >= 0.7 && !r.stuck))
  line('  同・張り付き', G.filter(r => r.fromPrev >= 20 && r.aboveV && r.pos >= 0.7 && r.stuck))
  line('★強い引け・張り付きを除く', G.filter(r => r.fromPrev >= 10 && r.fromPrev < 20 && r.aboveV && r.pos >= 0.7 && !r.stuck))
}
