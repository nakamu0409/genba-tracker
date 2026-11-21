// 決算・業績修正に強く反応した株を、飛びつかずに「最初の押し目」で買う形を、約10年・約690銘柄で確かめる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_pead_pullback.mjs
// ・発表は research/irhist.json（IR BANK の日時と表題）、日足は research/wide.json
// ・反応日：引け後の発表は翌営業日、場中の発表は当日。反応＝反応日の終値 ÷ 発表前の終値。1日じゅう値幅の無い日は除く
// ・押し目：反応日の2〜10営業日後に、初めて「終値が前日の終値より下」の日が来て、まだ発表前の終値より上なら、翌日の始値で買う
// ・損切り：発表前の終値（窓埋め）の少し下と、買値−ATR×2 の高い方。目標4R・最長40日。逆指値は0.1%不利
import { readFileSync } from 'node:fs'
import { atr } from '../../../.claude/scripts/kabu-lens.mjs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const ir = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const SLIP = 0.001
const ev = []
for (const [code, list] of Object.entries(ir)) {
  const w = wide[code]; if (!w?.d) continue
  const bars = w.d.map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v }))
  const idx = new Map(bars.map((b, i) => [b.date, i]))
  const a14 = atr(bars, 14)
  const seen = new Set()
  for (const k of Array.isArray(list) ? list : []) {
    if (!/決算|修正/.test(k.title || '') && !['1Q', '2Q', '3Q', '通期', '修正'].includes(k.kind)) continue
    let i = idx.get(k.date); if (i === undefined) continue
    const after = (k.time || '15:00') >= '15:00'
    const r = after ? i + 1 : i // 反応日
    const pre = after ? i : i - 1 // 発表前の終値の日
    if (r >= bars.length - 12 || pre < 20 || seen.has(r)) continue
    seen.add(r)
    const react = (bars[r].c / bars[pre].c - 1) * 100
    if (bars[r].h === bars[r].l) continue
    const turn = bars.slice(pre - 19, pre + 1).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turn < 1e8) continue
    // 押し目
    let buy = -1
    for (let j = r + 2; j <= r + 10 && j < bars.length - 1; j++) {
      if (bars[j].c < bars[j - 1].c) { if (bars[j].c > bars[pre].c) buy = j; break }
    }
    if (buy < 0) continue
    const e = buy + 1, entry = bars[e].o
    if (bars[e].h === bars[e].l) continue
    const stop = Math.max(bars[pre].c * 0.99, entry - 2 * (a14[buy] || 0))
    if (!(entry > stop)) continue
    ev.push({ code, date: bars[buy].date, react, e, entry, stop, bars, a14 })
  }
}
function run(x, T = 4, maxBars = 40) {
  const { bars, e, entry, stop } = x, risk = entry - stop
  for (let k = e; k < bars.length; k++) {
    const b = bars[k], n = k - e + 1
    if (b.o <= stop) return { r: (b.o * (1 - SLIP) - entry) / risk, pct: (b.o * (1 - SLIP) / entry - 1) * 100, n }
    if (b.l <= stop) return { r: (stop * (1 - SLIP) - entry) / risk, pct: (stop * (1 - SLIP) / entry - 1) * 100, n }
    const t = entry + T * risk
    if (b.h >= t) { const x2 = Math.max(t, b.o); return { r: (x2 - entry) / risk, pct: (x2 / entry - 1) * 100, n } }
    if (n >= maxBars) return { r: (b.c * (1 - SLIP) - entry) / risk, pct: (b.c * (1 - SLIP) / entry - 1) * 100, n }
  }
  return { open: true }
}
const f = (v, d = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) : '  —  ')
function show(name, list) {
  const rs = list.map(x => ({ d: x.date, ...run(x) })).filter(z => !z.open)
  if (!rs.length) return console.log(name, 'n=0')
  const m = (zs, k = 'r') => zs.length ? zs.reduce((s, z) => s + z[k], 0) / zs.length : NaN
  const W = rs.filter(z => z.r > 0), L = rs.filter(z => z.r <= 0)
  const pf = W.reduce((s, z) => s + z.r, 0) / Math.max(1e-9, -L.reduce((s, z) => s + z.r, 0))
  const yrs = [...new Set(rs.map(z => z.d.slice(0, 4)))].sort()
  const by = yrs.map(y => m(rs.filter(z => z.d.startsWith(y))))
  console.log(name.padEnd(26), `n=${String(rs.length).padStart(5)} 平均R${f(m(rs), 3)} 平均%${f(m(rs, 'pct'))} 勝${Math.round(W.length / rs.length * 100)}% PF${pf.toFixed(2)} 日数${(rs.reduce((s, z) => s + z.n, 0) / rs.length).toFixed(1)} プラスの年${by.filter(v => v > 0).length}/${by.length}`)
  console.log(' '.repeat(26), yrs.map((y, i) => `${y.slice(2)}:${f(by[i])}`).join(' '))
}
console.log(`押し目の買い ${ev.length}回`)
for (const [lo, hi] of [[-100, 0], [0, 3], [3, 7], [7, 12], [12, 100]]) show(`反応 ${lo}〜${hi}%`, ev.filter(x => x.react >= lo && x.react < hi))
show('反応 +7%以上', ev.filter(x => x.react >= 7))
