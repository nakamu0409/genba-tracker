// 窓開けの方法は、実際に買える銘柄（株価2,200円前後まで）でも成り立つか
import { atr, sma } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync } from 'node:fs'
const { stocks } = JSON.parse(readFileSync(new URL('./bars.json', import.meta.url), 'utf-8'))
const U60 = new Set('3382 9007 4689 8766 9009 9602 2502 7267 3003 9434 8801 8410 3405 3099 7269 3401 8309 5401 2413 4751 2801 8601 8604 9008 7261 8053 8697 9005 3861 6902 3231 9432 8267 8593 8750 5406 5301 4005 8628 6472 4902 4755 6753 6770 7211 4188 7733 6952 9301 7201 6471 6594 7911 9501 4183 5801 5802 7004 7012 9412'.split(' '))
function trade(bars, i, a, maxBars, skipGap) {
  const e = i + 1; if (e >= bars.length) return null
  const entry = bars[e].o; if (skipGap && entry > bars[i].c * 1.02) return { skip: true, exitIdx: e }
  const stop = bars[i].c - 2 * a; if (!(entry > stop)) return { skip: true, exitIdx: e }
  const fin = (k, px) => ({ pct: (px - entry) / entry * 100, r: (px - entry) / (entry - stop), exitIdx: k, date: bars[i].date })
  for (let k = e; k < bars.length; k++) { const b = bars[k]; if (b.l <= stop) return fin(k, Math.min(stop, b.o)); if (k - e + 1 >= maxBars) return fin(k, b.c) }
  return null
}
function run(codes, sig, skipGap = true) {
  const out = []
  for (const [code, bars] of Object.entries(stocks)) {
    if (!codes(code) || bars.length < 400) continue
    const a = atr(bars, 14), v20 = sma(bars.map(b => b.v), 20); let free = -1
    for (let i = 260; i < bars.length - 1; i++) { if (i <= free || a[i] == null || !sig(bars, i, v20)) continue; const r = trade(bars, i, a[i], 40, skipGap); if (!r) continue; free = r.exitIdx; if (!r.skip) out.push(r) }
  }
  return out
}
const gap = (bars, i, v20) => { const b = bars[i], p = bars[i - 1]; return b.o / p.c - 1 >= 0.02 && b.c > b.o && b.v >= 2 * v20[i - 1] && (b.c - b.l) / (b.h - b.l || 1) >= 0.6 }
const any = (bars, i) => i % 15 === 0
const st = rs => { const n = rs.length; if (!n) return 'n=0'; const m = rs.reduce((a, x) => a + x.pct, 0) / n; const sd = Math.sqrt(rs.reduce((a, x) => a + (x.pct - m) ** 2, 0) / (n - 1)); return `n=${String(n).padStart(4)} 勝率=${(rs.filter(x => x.pct > 0).length / n * 100).toFixed(0)}% 1回=${m.toFixed(2)}% t=${(m / (sd / Math.sqrt(n))).toFixed(1)} R=${(rs.reduce((a, x) => a + x.r, 0) / n).toFixed(2)}` }
const show = (name, rs) => { console.log(name); for (const [lab, f] of [['2018-21', r => r.date < '2022'], ['2022-23', r => r.date >= '2022' && r.date < '2024'], ['2024-26', r => r.date >= '2024']]) console.log('   ', lab, st(rs.filter(f))) }
show('買える60銘柄・窓開け', run(c => U60.has(c), gap))
show('買える60銘柄・いつでも買う', run(c => U60.has(c), any))
show('それ以外の約107銘柄・窓開け', run(c => !U60.has(c), gap))
show('それ以外の約107銘柄・いつでも買う', run(c => !U60.has(c), any))
