// 「好材料の窓開け＋大商い」を買う方法の頑健性チェック（条件を少しずつ変えても成り立つか）
import { atr, sma } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync } from 'node:fs'
const { stocks } = JSON.parse(readFileSync(new URL('./bars.json', import.meta.url), 'utf-8'))
const SPLIT = '2022-01-01'
function trade(bars, i, a, { stopK, maxBars, rr = 0, skipGap = 0 }) {
  const e = i + 1; if (e >= bars.length) return null
  const entry = bars[e].o
  if (skipGap && entry > bars[i].c * (1 + skipGap / 100)) return { skip: true, exitIdx: e }
  const stop = stopK ? bars[i].c - stopK * a : -Infinity
  if (!(entry > stop)) return { skip: true, exitIdx: e }
  const target = rr ? entry + rr * (entry - stop) : Infinity
  const fin = (k, px) => ({ pct: (px - entry) / entry * 100, r: stopK ? (px - entry) / (entry - stop) : 0, bars: k - e + 1, exitIdx: k, date: bars[i].date })
  for (let k = e; k < bars.length; k++) {
    const b = bars[k]
    if (b.l <= stop) return fin(k, Math.min(stop, b.o))
    if (b.h >= target) return fin(k, Math.max(target, b.o))
    if (k - e + 1 >= maxBars) return fin(k, b.c)
  }
  return null
}
const pre = Object.entries(stocks).filter(([, b]) => b.length >= 400).map(([code, bars]) => ({ code, bars, a: atr(bars, 14), v20: sma(bars.map(b => b.v), 20) }))
function run(sig, x) {
  const out = []
  for (const s of pre) {
    let free = -1
    for (let i = 260; i < s.bars.length - 1; i++) {
      if (i <= free || s.a[i] == null || !sig(s, i)) continue
      const r = trade(s.bars, i, s.a[i], x); if (!r) continue
      free = r.exitIdx; if (!r.skip) out.push(r)
    }
  }
  return out
}
const st = rs => { const n = rs.length; if (!n) return 'n=0'; const m = rs.reduce((a, x) => a + x.pct, 0) / n; const sd = Math.sqrt(rs.reduce((a, x) => a + (x.pct - m) ** 2, 0) / Math.max(1, n - 1)); const R = rs.reduce((a, x) => a + x.r, 0) / n; return `n=${String(n).padStart(4)} 勝率=${(rs.filter(x => x.pct > 0).length / n * 100).toFixed(0)}% 1回=${m.toFixed(2).padStart(5)}% t=${(m / (sd / Math.sqrt(n))).toFixed(1).padStart(4)} R=${R.toFixed(2)}` }
const show = (name, rs) => console.log(name.padEnd(46), '前半', st(rs.filter(r => r.date < SPLIT)), '| 後半', st(rs.filter(r => r.date >= SPLIT)))
const gap = (g, vol, pos = 0.6, bull = true) => (s, i) => { const b = s.bars[i], p = s.bars[i - 1]; return b.o / p.c - 1 >= g && (!bull || b.c > b.o) && b.v >= vol * s.v20[i - 1] && (b.c - b.l) / (b.h - b.l || 1) >= pos }
const X = { stopK: 2, maxBars: 40 }
console.log('--- 基準'); show('いつでも買う（15日おき）', run((s, i) => i % 15 === 0, X))
console.log('--- 窓の大きさと出来高を変える（40日・損切りATR×2）')
for (const g of [0.02, 0.03, 0.04, 0.05]) for (const v of [1.5, 2, 2.5, 3, 4]) show(`窓+${g * 100}% 出来高${v}倍`, run(gap(g, v), X))
console.log('--- 持つ日数を変える（窓+3% 出来高2.5倍）')
for (const m of [5, 10, 20, 40, 60, 90]) show(`${m}日`, run(gap(0.03, 2.5), { stopK: 2, maxBars: m }))
console.log('--- 損切りと目標を変える（窓+3% 出来高2.5倍・40日）')
show('損切りなし', run(gap(0.03, 2.5), { stopK: 0, maxBars: 40 }))
show('損切りATR×3', run(gap(0.03, 2.5), { stopK: 3, maxBars: 40 }))
show('損切りATR×2 + 目標3倍', run(gap(0.03, 2.5), { stopK: 2, maxBars: 40, rr: 3 }))
show('損切りATR×2 + 翌日+2%超は見送り', run(gap(0.03, 2.5), { stopK: 2, maxBars: 40, skipGap: 2 }))
show('損切り=窓を開けた日の安値', run(gap(0.03, 2.5), { stopK: 2, maxBars: 40 }))
console.log('--- 条件を緩める／変える')
show('陽線・高値引けの条件なし', run(gap(0.03, 2.5, 0, false), X))
show('窓なしで、1日+5%以上・出来高2.5倍', run((s, i) => { const b = s.bars[i], p = s.bars[i - 1]; return b.c / p.c - 1 >= 0.05 && b.v >= 2.5 * s.v20[i - 1] }, X))
show('窓なしで、1日+3%以上・出来高2.5倍', run((s, i) => { const b = s.bars[i], p = s.bars[i - 1]; return b.c / p.c - 1 >= 0.03 && b.v >= 2.5 * s.v20[i - 1] }, X))
const yr = run(gap(0.03, 2.5), X); console.log('--- 年別（窓+3% 出来高2.5倍・40日）', JSON.stringify(Object.fromEntries([...new Set(yr.map(r => r.date.slice(0, 4)))].sort().map(y => { const l = yr.filter(r => r.date.startsWith(y)); return [y, `${l.length}回 ${(l.reduce((s, r) => s + r.pct, 0) / l.length).toFixed(1)}%`] }))))
const yr2 = run(gap(0.02, 2), X); console.log('--- 年別（窓+2% 出来高2倍・40日）', JSON.stringify(Object.fromEntries([...new Set(yr2.map(r => r.date.slice(0, 4)))].sort().map(y => { const l = yr2.filter(r => r.date.startsWith(y)); return [y, `${l.length}回 ${(l.reduce((s, r) => s + r.pct, 0) / l.length).toFixed(1)}%`] }))))
