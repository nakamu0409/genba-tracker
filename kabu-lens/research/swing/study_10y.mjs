// スイングの買い候補（通過）を10年分・約1,400銘柄で、TOPIX（1306）との比較を入れて確かめる。売り方も比べる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_10y.mjs
// ・日足は research/wide.json（Yahoo の10年分）、比べる相手は swing/bench1306.json
// ・候補は analyze の signal_history の pass（相対強さの条件も効く）。その日の売買代金（20日平均）が1億円以上のものだけ
// ・翌日の始値で買う（終値の+2%を超えて寄ったら買わない。1日じゅう値幅の無い日は買えない）。逆指値は0.1%不利
// ・比べる相手：同じ銘柄で5日ごとに、終値−ATR×2 を損切りにして翌日の始値で買った場合
import { readFileSync } from 'node:fs'
import { analyze, atr } from '../../../.claude/scripts/kabu-lens.mjs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const bench = JSON.parse(readFileSync(new URL('./bench1306.json', import.meta.url), 'utf-8'))
const SLIP = 0.001
const ev = []
const base = []
for (const [code, w] of Object.entries(wide)) {
  const bars = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0)
  if (bars.length < 300) continue
  let p
  try { p = analyze(bars, bench, {}, { history: true }) } catch { continue }
  const a14 = atr(bars, 14)
  const turn = i => { let s = 0; for (let k = Math.max(0, i - 19); k <= i; k++) s += bars[k].c * bars[k].v; return s / Math.min(20, i + 1) }
  for (const sg of p.signal_history.filter(x => x.pass)) {
    const e = sg.i + 1
    if (e >= bars.length - 1 || turn(sg.i) < 1e8) continue
    const entry = bars[e].o
    if (bars[e].h === bars[e].l || entry > bars[sg.i].c * 1.02 || !(entry > sg.stop)) continue
    ev.push({ code, date: bars[sg.i].date, kind: sg.kind, e, entry, stop: sg.stop, bars, a14 })
  }
  for (let i = 210; i < bars.length - 1; i += 5) {
    if (!a14[i] || turn(i) < 1e8) continue
    const entry = bars[i + 1].o, stop = bars[i].c - 2 * a14[i]
    if (bars[i + 1].h === bars[i + 1].l || !(entry > stop)) continue
    base.push({ code, date: bars[i].date, e: i + 1, entry, stop, bars, a14 })
  }
}
function run(x, rule) {
  const { bars, e, entry } = x
  const risk = entry - x.stop
  let stop = x.stop, hiC = entry
  for (let k = e; k < bars.length; k++) {
    const b = bars[k], n = k - e + 1
    if (b.o <= stop) return { r: (b.o * (1 - SLIP) - entry) / risk, n }
    if (b.l <= stop) return { r: (stop * (1 - SLIP) - entry) / risk, n }
    const t = rule.target ? entry + rule.target * risk : Infinity
    if (b.h >= t) return { r: (Math.max(t, b.o) - entry) / risk, n }
    if (n >= rule.maxBars) return { r: (b.c * (1 - SLIP) - entry) / risk, n }
    hiC = Math.max(hiC, b.c)
    if (rule.trailAtr && x.a14[k]) stop = Math.max(stop, hiC - rule.trailAtr * x.a14[k])
  }
  return { open: true }
}
const f = (v, d = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) : '  —  ')
function show(name, list, rule) {
  const rs = list.map(x => ({ d: x.date, ...run(x, rule) })).filter(z => !z.open)
  const m = zs => zs.length ? zs.reduce((s, z) => s + z.r, 0) / zs.length : NaN
  const W = rs.filter(z => z.r > 0), L = rs.filter(z => z.r <= 0)
  const pf = W.reduce((s, z) => s + z.r, 0) / Math.max(1e-9, -L.reduce((s, z) => s + z.r, 0))
  const days = rs.reduce((s, z) => s + z.n, 0) / rs.length
  const yrs = [...new Set(rs.map(z => z.d.slice(0, 4)))].sort()
  const by = yrs.map(y => m(rs.filter(z => z.d.startsWith(y))))
  console.log(name.padEnd(30), `n=${String(rs.length).padStart(6)} 平均R${f(m(rs), 3)} 勝${Math.round(W.length / rs.length * 100)}% PF${pf.toFixed(2)} 日数${days.toFixed(1)} プラスの年${by.filter(v => v > 0).length}/${by.length}`)
  console.log(' '.repeat(30), yrs.map((y, i) => `${y.slice(2)}:${f(by[i])}`).join(' '))
}
console.log(`候補 ${ev.length}回・${new Set(ev.map(x => x.code)).size}銘柄（${[...ev.map(x => x.date)].sort()[0]}〜）、比べる相手 ${base.length}回`)
const RULES = { '今：目標3R・40日': { target: 3, maxBars: 40 }, '目標4R・40日': { target: 4, maxBars: 40 }, '目標なし・ATR×3で追う・60日': { maxBars: 60, trailAtr: 3 } }
for (const [n, r] of Object.entries(RULES)) {
  show('候補 ' + n, ev, r)
  show('どの日でも ' + n, base, r)
}
console.log('\n-- 形ごと（目標4R・40日）')
for (const k of [...new Set(ev.map(x => x.kind))]) show(k, ev.filter(x => x.kind === k), k === 'GAP' ? { maxBars: 10 } : { target: 4, maxBars: 40 })
