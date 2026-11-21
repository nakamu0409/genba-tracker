// 急騰した株の押し目買い：「少し下げたらすぐ買う」と「反発を確かめてから買う」を比べる（X の投稿の主張を10年分で確かめる）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_surge_pullback.mjs
// ・急騰：(a) 1日で+15%以上かつ高値引け（ストップ高に近い）か、(b) 5営業日で+20%以上。売買代金1億円以上
// ・押し：急騰の高値（その後の高値も含む）から −8% 以上下げた。ただし急騰の上げ幅の 61.8% より深く下げたら「崩れた」として見送り
// ・買い方（どれも合図の翌日の寄りで買う。寄りで張り付いた日は買えない）：
//   CHASE    急騰の翌日の寄りで追いかける（参考）
//   EARLY    押しの条件を満たした最初の日（＝少し下げたらすぐ）
//   REVERSAL 押しのあと、終値が前日の高値を超え、陽線で引けた最初の日（反発の確認）
//   HAMMER   押しのあと、前日の安値を割ってから切り返し、値幅の上30%で引けた最初の日（下ヒゲの切り返し）
//   2ND_HIGH 押しのあと、終値が直近2日の高値を超えた最初の日（REVERSAL より少し強い確認）
// ・損切り：急騰の高値から合図の日までの最安値の 1% 下（CHASE は急騰の日の安値の 1% 下）。寄りが損切りより下なら寄りで負け
// ・売り：2R / 3R の指値、どちらも無ければ 10 営業日目の引け（日足では、同じ日に損切りと目標の両方に届いたら損切りとみる）
// ・成行・逆指値は 0.1% 不利。超過＝同じ日に寄りで買って同じ日数持った全銘柄の平均との差
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const SLIP = 0.001
const HOLD = 10
const S = []
for (const [code, w] of Object.entries(wide)) {
  const d = (w?.d || []).filter(x => x[1] > 0 && x[2] > 0 && x[3] > 0 && x[4] > 0)
  if (d.length < 120) continue
  const turn = new Float64Array(d.length)
  let s = 0
  for (let i = 0; i < d.length; i++) {
    s += d[i][4] * d[i][5]
    if (i >= 20) s -= d[i - 20][4] * d[i - 20][5]
    turn[i] = s / Math.min(20, i + 1)
  }
  S.push({ code, d, turn })
}
// 全銘柄の「寄りで買って h 日目の引け」の平均（日付ごと）
const base = new Map()
for (const { d, turn } of S) {
  for (let i = 1; i + HOLD - 1 < d.length; i++) {
    if (turn[i - 1] < 1e8) continue
    const b = base.get(d[i][0]) || { n: 0, s: new Float64Array(HOLD) }
    b.n++
    for (let h = 0; h < HOLD; h++) b.s[h] += (d[i + h][4] / d[i][1] - 1) * 100
    base.set(d[i][0], b)
  }
}
const KINDS = ['CHASE', 'EARLY', 'REVERSAL', 'HAMMER', '2ND_HIGH']
const res = Object.fromEntries(KINDS.map(k => [k, []]))
// 1回の売買：i＝合図の日（翌日の寄りで買う）、stop、R 倍の目標
function trade(d, i, stop, rMult) {
  const e = i + 1
  if (e >= d.length) return null
  const [, o, h, l] = d[e]
  if (h === l) return null // 寄りから張り付き（買えない）
  const entry = o * (1 + SLIP)
  if (!(entry > stop)) return null
  const risk = entry - stop
  const target = entry + rMult * risk
  let exit = null
  let reason = ''
  let k = e
  for (; k < d.length && k < e + HOLD; k++) {
    const [, bo, bh, bl, bc] = d[k]
    if (k > e && bo <= stop) { exit = bo * (1 - SLIP); reason = 'stop_gap'; break }
    if (bl <= stop) { exit = stop * (1 - SLIP); reason = 'stop'; break }
    if (k > e && bo >= target) { exit = bo; reason = 'target_gap'; break }
    if (bh >= target) { exit = target; reason = 'target'; break }
    if (k === e + HOLD - 1) { exit = bc * (1 - SLIP); reason = 'time'; break }
  }
  if (exit === null) return null
  const held = k - e + 1
  const b = base.get(d[e][0])
  const pct = (exit / entry - 1) * 100
  return { date: d[e][0], pct, r: (exit - entry) / risk, reason, held, riskPct: risk / entry * 100, ex: b ? pct - b.s[held - 1] / b.n : null }
}
let events = 0
for (const { d, turn } of S) {
  let i = 6
  while (i < d.length - 2) {
    const prev = d[i - 1][4]
    const day = d[i][4] / prev - 1
    const r5 = d[i][4] / d[i - 5][4] - 1
    const bad = day > 1 || day < -0.6 // 分割などのデータの段差
    const surgeA = day >= 0.15 && d[i][4] >= d[i][2] * 0.999
    const surgeB = r5 >= 0.2
    if (bad || turn[i - 1] < 1e8 || !(surgeA || surgeB)) { i++; continue }
    events++
    const type = surgeA ? 'stop_high_like' : 'up20_5d'
    const baseLow = Math.min(...d.slice(i - 5, i + 1).map(x => x[3]))
    const ctx = { type, year: d[i][0].slice(0, 4) }
    // CHASE：急騰の翌日の寄り
    const c = trade(d, i, d[i][3] * 0.99, 2)
    if (c) res.CHASE.push({ ...ctx, ...c, r3: trade(d, i, d[i][3] * 0.99, 3)?.r })
    // 押しを探す（急騰の日から 15 営業日まで）
    let hi = d[i][2]
    let low = Infinity
    let pulled = false
    const done = new Set()
    let j = i + 1
    for (; j < d.length - 1 && j <= i + 15; j++) {
      const [, o, h, l, cl] = d[j]
      if (!pulled) hi = Math.max(hi, h)
      low = Math.min(low, l)
      if (!pulled && l <= hi * 0.92) pulled = true
      if (low < hi - 0.618 * (hi - baseLow)) break // 崩れた
      if (!pulled) continue
      const stop = low * 0.99
      const sig = {
        EARLY: true,
        REVERSAL: cl > d[j - 1][2] && cl > o,
        HAMMER: l < d[j - 1][3] && h > l && (cl - l) / (h - l) >= 0.7,
        '2ND_HIGH': cl > Math.max(d[j - 1][2], d[j - 2][2])
      }
      for (const k of ['EARLY', 'REVERSAL', 'HAMMER', '2ND_HIGH']) {
        if (done.has(k) || !sig[k]) continue
        done.add(k)
        const t = trade(d, j, stop, 2)
        if (t) res[k].push({ ...ctx, ...t, r3: trade(d, j, stop, 3)?.r, dropPct: (1 - low / hi) * 100, daysAfter: j - i })
      }
      if (done.size === 4) break
    }
    i = Math.max(i + 1, j) // 同じ急騰を何度も数えない
  }
}
const f = (v, p = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(p) : '—')
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const med = a => { const z = [...a].sort((x, y) => x - y); return z.length ? z[Math.floor(z.length / 2)] : NaN }
function line(name, xs) {
  if (!xs.length) return `${name.padEnd(22)} 0件`
  const dates = [...new Set(xs.map(x => x.date))].sort()
  const mid = dates[Math.floor(dates.length / 2)]
  const A = xs.filter(x => x.date < mid)
  const B = xs.filter(x => x.date >= mid)
  const yrs = [...new Set(xs.map(x => x.year))].sort()
  const posY = yrs.filter(y => mean(xs.filter(x => x.year === y).map(x => x.r)) > 0).length
  const worst = Math.min(...xs.map(x => x.pct))
  return `${name.padEnd(22)} ${String(xs.length).padStart(5)}件 勝率${(xs.filter(x => x.pct > 0).length / xs.length * 100).toFixed(0).padStart(3)}% ` +
    `平均${f(mean(xs.map(x => x.pct))).padStart(6)}% 中央${f(med(xs.map(x => x.pct))).padStart(6)}% 超過${f(mean(xs.filter(x => x.ex !== null).map(x => x.ex))).padStart(6)}% ` +
    `2R:${f(mean(xs.map(x => x.r))).padStart(6)}R 3R:${f(mean(xs.filter(x => Number.isFinite(x.r3)).map(x => x.r3))).padStart(6)}R ` +
    `損切り幅${mean(xs.map(x => x.riskPct)).toFixed(1).padStart(5)}% 最悪${f(worst, 1)}% 前半${f(mean(A.map(x => x.r)))}R 後半${f(mean(B.map(x => x.r)))}R プラスの年${posY}/${yrs.length}`
}
console.log(`急騰（1日+15%高値引け、または5日+20%。売買代金1億円以上）: ${events} 回`)
for (const k of KINDS) {
  console.log('\n■ ' + k)
  console.log(line('全部', res[k]))
  console.log(line(' ストップ高に近い急騰', res[k].filter(x => x.type === 'stop_high_like')))
  console.log(line(' 5日で+20%', res[k].filter(x => x.type === 'up20_5d')))
  if (k !== 'CHASE') {
    console.log(line(' 押し −8〜15%', res[k].filter(x => x.dropPct < 15)))
    console.log(line(' 押し −15%以上', res[k].filter(x => x.dropPct >= 15)))
    console.log(line(' 急騰から5日以内', res[k].filter(x => x.daysAfter <= 5)))
    console.log(line(' 急騰から6日以降', res[k].filter(x => x.daysAfter > 5)))
  }
  const rs = {}
  for (const x of res[k]) rs[x.reason] = (rs[x.reason] || 0) + 1
  console.log('  終わり方: ' + Object.entries(rs).map(([a, b]) => `${a} ${(b / res[k].length * 100).toFixed(0)}%`).join('・'))
}
console.log('\n■ 大きく取れた・やられた割合（上の売り方。2R の指値・損切り・10営業日目の引け）')
for (const k of KINDS) {
  const xs = res[k]
  const p = t => (xs.filter(x => x.pct >= t).length / xs.length * 100).toFixed(1)
  const q = t => (xs.filter(x => x.pct <= t).length / xs.length * 100).toFixed(1)
  console.log(`${k.padEnd(9)} +20%以上 ${p(20)}%・+10%以上 ${p(10)}%・−10%以下 ${q(-10)}%`)
}
