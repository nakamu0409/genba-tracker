// スイングの買い候補（通過）の「売り方」を比べる。利益率（1回あたりのR、R÷保有日数）を上げる売り方を探す
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_exits.mjs
// ・日足は 1時間足（research/day/hour.json、約1,150銘柄・2024-02〜）から作る。比べる相手（TOPIX）は入れていない（相対強さの条件は効かない）
// ・候補は analyze の signal_history の pass。翌日の始値で買う（終値の+2%を超えて高く寄ったら買わない）。損切りは候補の stop
// ・候補ごとに独立に数える（重なりあり）。逆指値は 0.1%不利に約定とみる
import { readFileSync } from 'node:fs'
import { analyze, atr } from '../../../.claude/scripts/kabu-lens.mjs'

const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))
const SLIP = 0.001
const ev = []
for (const [code, days] of Object.entries(hour)) {
  if (!days) continue
  const ds = Object.keys(days).sort()
  const bars = ds.map(d => { const b = days[d]; return { date: d, o: b[0][1], h: Math.max(...b.map(x => x[2])), l: Math.min(...b.map(x => x[3])), c: b[b.length - 1][4], v: b.reduce((s, x) => s + x[5], 0) } })
  if (bars.length < 260) continue
  let p
  try { p = analyze(bars, [], {}, { history: true }) } catch { continue }
  const a14 = atr(bars, 14)
  for (const sg of p.signal_history.filter(x => x.pass)) {
    const e = sg.i + 1
    if (e >= bars.length - 1) continue
    const entry = bars[e].o
    if (entry > bars[sg.i].c * 1.02 || !(entry > sg.stop)) continue
    ev.push({ code, date: bars[sg.i].date, kind: sg.kind, e, entry, stop: sg.stop, bars, a14 })
  }
}
console.error('候補', ev.length)

// 売り方：state を持ち、足ごとに「売る値段」か null を返す
function run(x, rule) {
  const { bars, e, entry } = x
  const risk = entry - x.stop
  let stop = x.stop
  let hiC = entry
  let hiH = entry
  for (let k = e; k < bars.length; k++) {
    const b = bars[k]
    const n = k - e + 1
    if (b.o <= stop) return { r: (b.o * (1 - SLIP) - entry) / risk, n }
    if (b.l <= stop) return { r: (stop * (1 - SLIP) - entry) / risk, n }
    const t = rule.target ? entry + rule.target * risk : Infinity
    if (b.h >= t) return { r: (Math.max(t, b.o) - entry) / risk, n }
    if (n >= rule.maxBars) return { r: (b.c * (1 - SLIP) - entry) / risk, n }
    if (rule.timeStop && n >= rule.timeStop[0] && (b.c - entry) / risk < rule.timeStop[1]) return { r: (b.c * (1 - SLIP) - entry) / risk, n }
    hiC = Math.max(hiC, b.c)
    hiH = Math.max(hiH, b.h)
    // 翌日からの損切りを、今日の終わりの値で引き上げる（下げない）
    if (rule.be && hiH >= entry + rule.be * risk) stop = Math.max(stop, entry)
    if (rule.lock) for (const [at, to] of rule.lock) if (hiH >= entry + at * risk) stop = Math.max(stop, entry + to * risk)
    if (rule.trailAtr && x.a14[k] && hiH >= entry + (rule.trailFrom ?? 0) * risk) stop = Math.max(stop, hiC - rule.trailAtr * x.a14[k])
  }
  const last = bars[bars.length - 1]
  return { r: (last.c - entry) / risk, n: bars.length - e, open: true }
}
const RULES = {
  '今：目標3R・40日': { target: 3, maxBars: 40 },
  '目標2R・40日': { target: 2, maxBars: 40 },
  '目標4R・40日': { target: 4, maxBars: 40 },
  '目標3R・+1Rで損切りを買値へ': { target: 3, maxBars: 40, be: 1 },
  '目標3R・20日': { target: 3, maxBars: 20 },
  '目標3R・10日で+0.5R未満なら手じまい': { target: 3, maxBars: 40, timeStop: [10, 0.5] },
  '目標なし・終値の高値−ATR×3で追う・60日': { maxBars: 60, trailAtr: 3 },
  '目標なし・+1Rから終値の高値−ATR×2で追う・60日': { maxBars: 60, trailAtr: 2, trailFrom: 1 },
  '目標なし・+1Rで買値、+2Rで+1R、以後ATR×3で追う・60日': { maxBars: 60, lock: [[1, 0], [2, 1]], trailAtr: 3, trailFrom: 2 },
  '目標5R・+1Rで買値・+2Rで+1R・60日': { target: 5, maxBars: 60, lock: [[1, 0], [2, 1]] }
}
const dates = [...new Set(ev.map(x => x.date))].sort()
const mid = dates[Math.floor(dates.length / 2)]
const f = (v, d = 2) => (v >= 0 ? '+' : '') + v.toFixed(d)
console.log(`候補（通過）${ev.length}回・${new Set(ev.map(x => x.code)).size}銘柄、${dates[0]}〜${dates[dates.length - 1]}（前半/後半の境 ${mid}）`)
console.log('売り方'.padEnd(44), '平均R（前半/後半）       勝率  勝ちの平均R 負けの平均R  PF   平均日数  1日あたりR')
for (const [name, rule] of Object.entries(RULES)) {
  const rs = ev.map(x => ({ d: x.date, ...run(x, rule) })).filter(z => !z.open)
  const m = zs => zs.reduce((s, z) => s + z.r, 0) / zs.length
  const A = rs.filter(z => z.d < mid), B = rs.filter(z => z.d >= mid)
  const W = rs.filter(z => z.r > 0), L = rs.filter(z => z.r <= 0)
  const pf = W.reduce((s, z) => s + z.r, 0) / Math.max(1e-9, -L.reduce((s, z) => s + z.r, 0))
  const days = rs.reduce((s, z) => s + z.n, 0) / rs.length
  console.log(name.padEnd(44), `${f(m(rs), 3)}（${f(m(A))}/${f(m(B))}）`.padEnd(22), `${Math.round(W.length / rs.length * 100)}%`.padStart(4), f(m(W)).padStart(9), f(m(L)).padStart(10), pf.toFixed(2).padStart(6), days.toFixed(1).padStart(8), f(m(rs) / days, 4).padStart(10))
}

// ---- 追加：追いかけ方の幅・期間を変える、形ごと、年ごと、比べる相手（どの日に買っても） ----
const show = (name, list, rule) => {
  const rs = list.map(x => ({ d: x.date, ...run(x, rule) })).filter(z => !z.open)
  if (!rs.length) return console.log(name, 'n=0')
  const m = zs => zs.length ? zs.reduce((s, z) => s + z.r, 0) / zs.length : NaN
  const W = rs.filter(z => z.r > 0), L = rs.filter(z => z.r <= 0)
  const pf = W.reduce((s, z) => s + z.r, 0) / Math.max(1e-9, -L.reduce((s, z) => s + z.r, 0))
  const days = rs.reduce((s, z) => s + z.n, 0) / rs.length
  const yr = ['2024', '2025', '2026'].map(y => { const ys = rs.filter(z => z.d.startsWith(y)); return `${y.slice(2)}年${f(m(ys))}(${ys.length})` }).join(' ')
  console.log(name.padEnd(40), `n=${String(rs.length).padStart(5)} 平均R${f(m(rs), 3)} 勝${Math.round(W.length / rs.length * 100)}% PF${pf.toFixed(2)} 日数${days.toFixed(1)} 1日R${f(m(rs) / days, 4)} | ${yr}`)
}
console.log('\n-- 追いかける幅と期間')
for (const k of [2.5, 3, 3.5, 4]) for (const mb of [40, 60, 90]) show(`ATR×${k}・${mb}日`, ev, { maxBars: mb, trailAtr: k })
console.log('\n-- 形ごと：今 と ATR×3・60日')
for (const kind of [...new Set(ev.map(x => x.kind))]) {
  const l = ev.filter(x => x.kind === kind)
  show(`${kind} 今`, l, kind === 'GAP' ? { maxBars: 10 } : { target: 3, maxBars: 40 })
  show(`${kind} ATR×3・60日`, l, { maxBars: 60, trailAtr: 3 })
}
// 比べる相手：同じ銘柄で5日ごとに、終値−ATR×2 を損切りにして翌日の始値で買った場合
const base = []
const seen = new Set(ev.map(x => x.code))
for (const code of seen) {
  const any = ev.find(x => x.code === code)
  const { bars, a14 } = any
  for (let i = 210; i < bars.length - 1; i += 5) {
    if (!a14[i]) continue
    const entry = bars[i + 1].o
    const stop = bars[i].c - 2 * a14[i]
    if (!(entry > stop)) continue
    base.push({ code, date: bars[i].date, e: i + 1, entry, stop, bars, a14 })
  }
}
console.log('\n-- 比べる相手（どの日に買っても・5日ごと）')
show('どの日でも 今の売り方', base, { target: 3, maxBars: 40 })
show('どの日でも ATR×3・60日', base, { maxBars: 60, trailAtr: 3 })

// ---- 追加2：相場全体の地合い（25日線の上にいる銘柄の割合）で分けると、スイングは良くなるか ----
const breadth = new Map()
for (const [code, days] of Object.entries(hour)) {
  if (!days) continue
  const ds = Object.keys(days).sort()
  const c = ds.map(d => days[d][days[d].length - 1][4])
  let s = 0
  for (let i = 0; i < c.length; i++) {
    s += c[i]
    if (i >= 25) s -= c[i - 25]
    if (i >= 24) {
      const b = breadth.get(ds[i]) || [0, 0]
      b[0] += c[i] > s / 25 ? 1 : 0
      b[1]++
      breadth.set(ds[i], b)
    }
  }
}
const br = d => { const b = breadth.get(d); return b ? b[0] / b[1] * 100 : null }
console.log('\n-- 地合い（25日線の上の銘柄の割合）ごと')
for (const [lo, hi] of [[0, 30], [30, 45], [45, 60], [60, 75], [75, 101]]) {
  const l = ev.filter(x => { const v = br(x.date); return v !== null && v >= lo && v < hi })
  show(`地合い ${lo}〜${hi}% 今`, l, { target: 3, maxBars: 40 })
  show(`地合い ${lo}〜${hi}% ATR×3・60日`, l, { maxBars: 60, trailAtr: 3 })
  const bl = base.filter(x => { const v = br(x.date); return v !== null && v >= lo && v < hi })
  show(`  どの日でも ${lo}〜${hi}% 今`, bl, { target: 3, maxBars: 40 })
}

console.log('\n-- 年ごと（主な売り方）')
for (const [name, rule] of Object.entries(RULES)) show(name, ev, rule)
