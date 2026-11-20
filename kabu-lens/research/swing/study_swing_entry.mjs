// スイングの買い方：寄りで買う／指値で待つ、と寄りの窓の大きさ（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_entry.mjs
// 今の決まり：翌日、終値+2%以内なら買う（場中に指値。ここでは寄りで買ったとみる）・損切り 2×ATR・目標 3R・40日。避ける形は外した候補
// 比べる（どれも翌日1日だけ待つ。買えなければ見送り）：
//   A 寄り（終値+2%以内のとき。今）
//   B 指値＝前の日の終値（寄りがそれより下なら寄りで、上なら安値が届いたら指値で）
//   C 指値＝前の日の終値 −1%
//   D 指値＝前の日の終値 −2%
//   E 指値＝前の日の終値 − 0.5×ATR
// 損切り・目標は合図の日に決めた値段（stop）と、実際の買値からの 3R。平均R は「買えたトレードの平均」と「候補1件あたり（買えなかったら0）」の2つ
// 窓：寄り ÷ 前の日の終値 −1 を、−2%未満／−2〜0／0〜+1／+1〜+2 で分けて、A の成績を見る
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A_ = SPLIT_DATE
const BB = '2025-11-14'
const SLIP = 0.001
const D = loadAll()
const { stocks } = D
// 指値の買値 px で e の日に買ったとして、その日から決まりどおりに動かす（その日の安値で損切り・高値で目標も見る。順番は損切りを先に＝不利な側）
function run(B, e, px, stop, maxDays = 40, rMult = 3, atOpen = false) {
  const entry = atOpen ? px * (1 + SLIP) : px
  if (!(entry > stop)) return null
  const risk = entry - stop
  const target = entry + rMult * risk
  for (let k = e; k < B.length && k < e + maxDays; k++) {
    const x = B[k]
    let exit = null
    if (k > e && x.o <= stop) exit = x.o * (1 - SLIP)
    else if (x.l <= stop) exit = stop * (1 - SLIP)
    else if (k > e && x.o >= target) exit = x.o
    else if (x.h >= target) exit = target
    else if (k === e + maxDays - 1) exit = x.c * (1 - SLIP)
    if (exit !== null) return (exit - entry) / risk
  }
  return null
}
const rows = []
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const i = s.i
  const e = i + 1
  if (e + 41 >= B.length || B[e].h === B[e].l) continue
  const c = B[i].c
  let atr = 0
  for (let k = i - 13; k <= i; k++) atr += Math.max(B[k].h, B[k - 1].c) - Math.min(B[k].l, B[k - 1].c)
  atr /= 14
  const o = B[e].o
  const lim = L => (o <= L ? run(B, e, o, s.stop, 40, 3, true) : B[e].l <= L ? run(B, e, L, s.stop) : 'miss')
  rows.push({
    date: s.date,
    gap: (o / c - 1) * 100,
    A: o <= c * 1.02 ? run(B, e, o, s.stop, 40, 3, true) : 'miss',
    B: lim(c),
    C: lim(c * 0.99),
    D: lim(c * 0.98),
    E: lim(c - 0.5 * atr)
  })
}
const per = r => (r.date < A_ ? 0 : r.date < BB ? 1 : 2)
console.log(`候補 ${rows.length}件。各期間：買えた平均R／候補1件あたりR（買えなかったら0）／買えた割合`)
const NAMES = { A: '寄り（+2%以内・今）', B: '指値＝前の日の終値', C: '指値＝終値−1%', D: '指値＝終値−2%', E: '指値＝終値−0.5ATR' }
for (const [k, n] of Object.entries(NAMES)) {
  const cells = [0, 1, 2].map(p => {
    const z = rows.filter(r => per(r) === p && r[k] !== null)
    const got = z.filter(r => r[k] !== 'miss').map(r => r[k])
    return `${fmt(mean(got), 3)}／${fmt(got.reduce((a, b) => a + b, 0) / z.length, 3)}／${(got.length / z.length * 100).toFixed(0)}%`
  })
  console.log(`  ${n.padEnd(14)} ${cells.join('   ')}`)
}
console.log('\n■ 寄りの窓ごとの「寄りで買う」の平均R')
for (const [n, f] of [['−2%未満', g => g < -2], ['−2〜0%', g => g >= -2 && g < 0], ['0〜+1%', g => g >= 0 && g < 1], ['+1〜+2%', g => g >= 1 && g <= 2]]) {
  const cells = [0, 1, 2].map(p => {
    const z = rows.filter(r => per(r) === p && f(r.gap) && typeof r.A === 'number').map(r => r.A)
    return `${fmt(mean(z), 3)}(${z.length})`
  })
  console.log(`  ${n.padEnd(8)} ${cells.join('  ')}`)
}
