// 別の考え方の検証: 逆張り・決算後の勢い・高値更新・銘柄同士の強弱
import { atr, rsi, sma } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync } from 'node:fs'
const { bench, stocks } = JSON.parse(readFileSync(new URL('./bars.json', import.meta.url), 'utf-8'))
const SPLIT = '2022-01-01'
const ok = x => x != null && Number.isFinite(x)

const stat = (rs) => {
  if (!rs.length) return { n: 0 }
  const n = rs.length; const m = k => rs.reduce((a, x) => a + x[k], 0) / n
  const mean = m('pct'); const sd = Math.sqrt(rs.reduce((a, x) => a + (x.pct - mean) ** 2, 0) / Math.max(1, n - 1))
  const gp = rs.filter(x => x.pct > 0).reduce((a, x) => a + x.pct, 0); const gl = -rs.filter(x => x.pct < 0).reduce((a, x) => a + x.pct, 0)
  return { n, win: +(rs.filter(x => x.pct > 0).length / n * 100).toFixed(1), pct: +mean.toFixed(2), t: +(mean / (sd / Math.sqrt(n))).toFixed(1), pf: +(gp / (gl || 1)).toFixed(2), bars: +m('bars').toFixed(1), perDay: +(mean / m('bars')).toFixed(3), worst: +Math.min(...rs.map(x => x.pct)).toFixed(1), r: +m('r').toFixed(3) }
}
const line = (name, rs) => {
  const a = stat(rs.filter(r => r.date < SPLIT)); const b = stat(rs.filter(r => r.date >= SPLIT))
  const yrs = Object.fromEntries([...new Set(rs.map(r => r.date.slice(0, 4)))].sort().map(y => { const l = rs.filter(r => r.date.startsWith(y)); return [y.slice(2), +(l.reduce((s, r) => s + r.pct, 0) / l.length).toFixed(1)] }))
  console.log(`${name}\n   前半 n=${a.n} 勝率=${a.win}% 1回=${a.pct}% t=${a.t} PF=${a.pf} 保有=${a.bars}日 R=${a.r} 最悪=${a.worst}%\n   後半 n=${b.n} 勝率=${b.win}% 1回=${b.pct}% t=${b.t} PF=${b.pf} 保有=${b.bars}日 R=${b.r} 最悪=${b.worst}%\n   年別% ${JSON.stringify(yrs)}`)
}

// 共通の売買シミュレーション。exitFn(k) が true ならその日の終値で売る。損切りは stopK×ATR（0なら無し）
function trade(bars, i, a, { stopK = 0, maxBars = 10, exitFn = null, rr = 0, trailK = 0 }) {
  const e = i + 1; if (e >= bars.length) return null
  const entry = bars[e].o
  const riskRef = 2 * a // R は「ATRの2倍」を1として表示（比較用）
  let stop = stopK ? bars[i].c - stopK * a : -Infinity
  if (!(entry > stop)) return { skip: true, exitIdx: e }
  const target = rr ? entry + rr * (entry - stop) : Infinity
  let hi = entry
  const fin = (k, px) => ({ pct: (px - entry) / entry * 100, r: (px - entry) / riskRef, bars: k - e + 1, exitIdx: k, date: bars[i].date })
  for (let k = e; k < bars.length; k++) {
    const b = bars[k]
    if (b.l <= stop) return fin(k, Math.min(stop, b.o))
    if (b.h >= target) return fin(k, Math.max(target, b.o))
    if ((exitFn && exitFn(k)) || k - e + 1 >= maxBars) return fin(k, b.c)
    if (trailK) { hi = Math.max(hi, b.c); stop = Math.max(stop, hi - trailK * a) }
  }
  return null
}
function run(sigFn, exit, { perCodeOverlap = false } = {}) {
  const out = []
  for (const [code, bars] of Object.entries(stocks)) {
    if (bars.length < 400) continue
    const c = bars.map(b => b.c); const v = bars.map(b => b.v)
    const ind = { c, v, a: atr(bars, 14), s5: sma(c, 5), s25: sma(c, 25), s200: sma(c, 200), r2: rsi(c, 2), r14: rsi(c, 14), v20: sma(v, 20), bars }
    let free = -1
    for (let i = 260; i < bars.length - 1; i++) {
      if (!perCodeOverlap && i <= free) continue
      if (!ok(ind.a[i]) || !sigFn(ind, i)) continue
      const x = typeof exit === 'function' ? exit(ind) : exit
      const r = trade(bars, i, ind.a[i], x)
      if (!r) continue
      free = r.exitIdx
      if (!r.skip) out.push(r)
    }
  }
  return out
}
const hiN = (ind, i, n) => { let m = -Infinity; for (let k = i - n; k < i; k++) m = Math.max(m, ind.bars[k].h); return m }
const downStreak = (ind, i, n) => { for (let k = 0; k < n; k++) if (!(ind.c[i - k] < ind.c[i - k - 1])) return false; return true }

console.log('======== 1. 逆張り（上昇トレンド中の下げすぎを買い、戻ったら売る）')
const mrExit = ind => ({ maxBars: 10, exitFn: k => ind.c[k] > ind.s5[k] })
line('基準: 200日線の上ならいつでも買い、5日線の上で売る（最長10日）', run((d, i) => d.c[i] > d.s200[i] && i % 7 === 0, mrExit))
line('A1: 200日線の上 + RSI(2)<10 → 5日線の上で売る（最長10日・損切りなし）', run((d, i) => d.c[i] > d.s200[i] && d.r2[i] < 10, mrExit))
line('A2: 200日線の上 + RSI(2)<5', run((d, i) => d.c[i] > d.s200[i] && d.r2[i] < 5, mrExit))
line('A3: A1 + 損切り ATR×3', run((d, i) => d.c[i] > d.s200[i] && d.r2[i] < 10, ind => ({ ...mrExit(ind), stopK: 3 })))
line('A4: 200日線の上 + 3日続落 + 25日線より下', run((d, i) => d.c[i] > d.s200[i] && downStreak(d, i, 3) && d.c[i] < d.s25[i], mrExit))
line('A5: 200日線の上 + 1日で-5%以上の急落', run((d, i) => d.c[i] > d.s200[i] && d.c[i] / d.c[i - 1] - 1 <= -0.05, mrExit))
line('A6: 200日線の下 + RSI(2)<10（下降中の逆張り）', run((d, i) => d.c[i] < d.s200[i] && d.r2[i] < 10, mrExit))

console.log('\n======== 2. 決算などの好材料のあと（大きな窓開け＋大商い）を買う')
const gapUp = (g, vol) => (d, i) => { const b = d.bars[i]; return b.o / d.c[i - 1] - 1 >= g && b.c > b.o && d.v[i] >= vol * d.v20[i - 1] && (b.c - b.l) / (b.h - b.l || 1) >= 0.6 }
line('基準: いつでも買い、40日持つ（損切り ATR×2）', run((d, i) => i % 15 === 0, { stopK: 2, maxBars: 40 }))
line('B1: 窓+3%・出来高2.5倍・陽線 → 40日（損切り ATR×2）', run(gapUp(0.03, 2.5), { stopK: 2, maxBars: 40 }))
line('B2: 窓+5%・出来高3倍 → 40日（損切り ATR×2）', run(gapUp(0.05, 3), { stopK: 2, maxBars: 40 }))
line('B3: B1 → 60日・値幅3倍で追いかける損切り', run(gapUp(0.03, 2.5), { stopK: 2, maxBars: 60, trailK: 3 }))
line('B4: 窓-3%以下・出来高2.5倍の急落を買う（悪材料の逆張り）→ 20日', run((d, i) => { const b = d.bars[i]; return b.o / d.c[i - 1] - 1 <= -0.03 && d.v[i] >= 2.5 * d.v20[i - 1] }, { stopK: 2, maxBars: 20 }))

console.log('\n======== 3. 52週高値の更新を買う')
line('C1: 250日高値を終値で更新（直近60日で初）→ 60日・追いかける損切り ATR×3', run((d, i) => { if (!(d.c[i] > hiN(d, i, 250))) return false; for (let k = 1; k <= 60; k++) if (d.c[i - k] > hiN(d, i - k, 190)) return false; return true }, { stopK: 2, maxBars: 60, trailK: 3 }))
line('C2: 250日高値を更新 + 出来高1.5倍', run((d, i) => d.c[i] > hiN(d, i, 250) && d.v[i] >= 1.5 * d.v20[i - 1], { stopK: 2, maxBars: 60, trailK: 3 }))
line('基準: いつでも買い、60日・追いかける損切り ATR×3', run((d, i) => i % 15 === 0, { stopK: 2, maxBars: 60, trailK: 3 }))

// ── 銘柄同士の強弱（同じ日に全銘柄を比べ、上位・下位を買った場合の、平均との差）
console.log('\n======== 4. 銘柄同士の強弱で選ぶ（全銘柄の平均との差。%）')
const dates = bench.map(b => b.date); const di = new Map(dates.map((d, i) => [d, i]))
const px = {}
for (const [code, bars] of Object.entries(stocks)) { const arr = new Array(dates.length).fill(null); for (const b of bars) { const k = di.get(b.date); if (k !== undefined) arr[k] = b.c } px[code] = arr }
function xs(lookFrom, lookTo, hold, pickTop, frac = 0.1, step = hold) {
  const res = []
  for (let t = 260; t + hold < dates.length; t += step) {
    const rows = []
    for (const code of Object.keys(px)) { const p = px[code]; const a = p[t - lookFrom], b = p[t - lookTo], c0 = p[t], c1 = p[t + hold]; if (ok(a) && ok(b) && ok(c0) && ok(c1)) rows.push({ sig: b / a - 1, fwd: (c1 / c0 - 1) * 100 }) }
    if (rows.length < 50) continue
    rows.sort((x, y) => y.sig - x.sig)
    const k = Math.max(5, Math.round(rows.length * frac))
    const pick = pickTop ? rows.slice(0, k) : rows.slice(-k)
    const avg = l => l.reduce((s, r) => s + r.fwd, 0) / l.length
    res.push({ date: dates[t], pct: avg(pick) - avg(rows), raw: avg(pick), bars: hold, r: 0 })
  }
  return res
}
line('D1: 過去6か月（直近1か月を除く）で強かった上位10%を1か月持つ', xs(126, 21, 21, true))
line('D2: 過去12か月（直近1か月を除く）で強かった上位10%を1か月持つ', xs(250, 21, 21, true))
line('D3: 過去1か月で弱かった下位10%を1か月持つ（月の逆張り）', xs(21, 0, 21, false))
line('D4: 過去5日で弱かった下位10%を5日持つ（週の逆張り）', xs(5, 0, 5, false))
line('D5: 過去5日で強かった上位10%を5日持つ', xs(5, 0, 5, true))
line('D6: 過去3か月で強かった上位10%を1か月持つ', xs(63, 0, 21, true))
