// 海外の公開スキル（claude-trading-skills・day-trader-skill）の考え方を日本株10年で確かめる（2026-11-22。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_ext_ideas.mjs
// 共通：20日平均の売買代金1億円以上・株価100円以上。翌日の寄り（終値+2%以内のときだけ）で買う。比べる相手は TOPIX 連動ETF の同じ期間。手数料・すべり 0.2% を引く
// A) モメンタムバースト：その日 +4%以上・出来高が前の日より多い・高値の近くで引け（値幅の上から30%以内）・前の3日で+10%以上上げていない
//    A2) さらに、前の10日の値幅（高値−安値）が狭い（20日平均の値幅の0.8倍以下＝値動きが縮んだあと）
//    → 3日・5日の引けで売る。損切りあり版：その日の安値で損切り・3R・5日
// B) 売り疲れのハンマー：20日以内につけた高値から −8〜−25% 押した・その日の安値が前の5日の安値を割ってから引けで取り戻した・
//    下ひげが値幅の50%以上・値幅の上から40%以内で引け・出来高が20日平均以上 → 5日・20日。損切りあり版：その日の安値・3R・20日
// C) 売り抜けの日（ディストリビューション・デー）：TOPIX ETF が −0.2% 以下で出来高が前の日より多い日。25日以内（その後5%上げたら消す）の数で、
//    今のスイングの候補（3R・40日）の平均R と、企業の行動（自社株買い・増配）の翌日の寄り→引けを分ける
// 期間：選ぶ（〜2021-11-18）／確かめる（〜2025-11-13）／最後の確認
// 結果（2026-11-22）：どれも採らない。
//   比べる相手（どの日でも5日）−0.06／−0.29／+0.18%
//   A モメンタムバースト 5日 −0.17／−0.32／±0.00%、損切りあり −0.08／−0.04／−0.03R。値動きが縮んだあと（A2）も −0.06R など。日本株では効かない
//   B 売り疲れのハンマー 20日 −0.18／−0.13／−0.23%、損切りあり −0.19／−0.02／−0.09R。効かない
//   C 売り抜けの日の数：スイングは「ふつう（0〜2）」が前半・後半で良い（+0.27／+0.16R）が、直近は逆（−0.11R、5以上は+0.35R）。向きがそろわない。
//     企業の行動はどの数でもおおむねプラス（5以上で +0.37／+0.60／+0.86%）。止める理由にならない
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const COST = 0.2
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bOC = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)

const G = { A3: [], A5: [], AR: [], A2_3: [], A2_5: [], A2R: [], B5: [], B20: [], BR: [], base5: [] }
for (const st of Object.values(stocks)) {
  const B = st.bars
  const n = B.length
  for (let i = 25; i + 21 < n; i++) {
    if (st.turn[i] < 1e8 || B[i].c < 100) continue
    const e = i + 1
    const E = B[e]
    if (E.h === E.l || E.o > B[i].c * 1.02) continue
    const ex = (k) => { const br = bOC(E.date, B[e + k - 1].date); return br === null ? null : (B[e + k - 1].c / E.o - 1) * 100 - br - COST }
    const d = B[i].date
    const p = per(d)
    // 比べる相手：どの日でも（間引いて 1/20）
    if (i % 20 === 0) { const v = ex(5); if (v !== null) G.base5.push({ p, v }) }
    const rng = B[i].h - B[i].l
    if (rng <= 0) continue
    const clo = (B[i].c - B[i].l) / rng
    // A
    const r1 = B[i].c / B[i - 1].c
    if (r1 >= 1.04 && B[i].v > B[i - 1].v && clo >= 0.7 && B[i - 1].c / B[i - 4].c < 1.1) {
      const v3 = ex(3); const v5 = ex(5)
      const t = simulate(B, i, B[i].l, { rMult: 3, maxDays: 5, gapMax: 2 })
      let r10 = 0; let r20 = 0
      for (let k = i - 10; k < i; k++) r10 += B[k].h - B[k].l
      for (let k = i - 20; k < i; k++) r20 += B[k].h - B[k].l
      const tight = r10 / 10 <= 0.8 * (r20 / 20)
      if (v3 !== null) { G.A3.push({ p, v: v3 }); if (tight) G.A2_3.push({ p, v: v3 }) }
      if (v5 !== null) { G.A5.push({ p, v: v5 }); if (tight) G.A2_5.push({ p, v: v5 }) }
      if (t) { G.AR.push({ p, v: t.r }); if (tight) G.A2R.push({ p, v: t.r }) }
    }
    // B
    let hi = 0
    for (let k = i - 20; k < i; k++) hi = Math.max(hi, B[k].h)
    const dd = (B[i].c / hi - 1) * 100
    let low5 = Infinity
    for (let k = i - 5; k < i; k++) low5 = Math.min(low5, B[k].l)
    let v20 = 0
    for (let k = i - 20; k < i; k++) v20 += B[k].v
    v20 /= 20
    const lowerWick = (Math.min(B[i].o, B[i].c) - B[i].l) / rng
    if (dd <= -8 && dd >= -25 && B[i].l < low5 && B[i].c > low5 && lowerWick >= 0.5 && clo >= 0.6 && B[i].v >= v20) {
      const v5 = ex(5); const v20r = ex(20)
      const t = simulate(B, i, B[i].l, { rMult: 3, maxDays: 20, gapMax: 2 })
      if (v5 !== null) G.B5.push({ p, v: v5 })
      if (v20r !== null) G.B20.push({ p, v: v20r })
      if (t) G.BR.push({ p, v: t.r })
    }
  }
}
const show = (name, arr, unit = '%') => {
  const g = [0, 1, 2].map(p => arr.filter(x => x.p === p).map(x => x.v))
  console.log(`  ${name.padEnd(34)} ${g.map(a => `${fmt(mean(a))}${unit}(${a.length})`).join('  ')}`)
}
console.log('全体比（手数料0.2%を引いた%）／平均R。選ぶ／確かめる／最後の確認')
show('比べる相手：どの日でも 5日', G.base5)
console.log('■ A モメンタムバースト')
show('3日', G.A3); show('5日', G.A5); show('損切りあり（その日の安値・3R・5日）', G.AR, 'R')
show('A2 値動きが縮んだあと 3日', G.A2_3); show('A2 5日', G.A2_5); show('A2 損切りあり', G.A2R, 'R')
console.log('■ B 売り疲れのハンマー')
show('5日', G.B5); show('20日', G.B20); show('損切りあり（その日の安値・3R・20日）', G.BR, 'R')

// C
const dd = []
for (let k = 1; k < bench.length; k++) {
  if (bench[k].c / bench[k - 1].c - 1 <= -0.002 && bench[k].v > bench[k - 1].v) dd.push(k)
}
const ddCount = new Map()
for (let k = 0; k < bench.length; k++) {
  let c = 0
  for (const j of dd) {
    if (j > k || k - j > 25) continue
    let hi = 0
    for (let m = j + 1; m <= k; m++) hi = Math.max(hi, bench[m].h)
    if (hi >= bench[j].c * 1.05) continue
    c++
  }
  ddCount.set(bench[k].date, c)
}
const band = c => (c <= 2 ? '0〜2（ふつう）' : c <= 4 ? '3〜4（注意）' : '5以上（危ない）')
const BANDS = ['0〜2（ふつう）', '3〜4（注意）', '5以上（危ない）']
console.log('\n■ C 売り抜けの日の数（25日以内）')
const sw = {}
for (const s of D.swing) {
  const c = ddCount.get(s.date)
  if (c === undefined) continue
  const t = simulate(stocks[s.code].bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  ;(sw[band(c)] ||= []).push({ p: per(s.date), v: t.r })
}
console.log(' スイングの候補（平均R）')
for (const b of BANDS) show(b, sw[b] || [], 'R')
const ev = {}
for (const e of D.events) {
  if (e.kind !== 'buyback' && e.kind !== 'divup') continue
  const st = stocks[e.code]
  const x = st.bars[e.i + 1]
  if (!x || x.h === x.l || x.o > st.bars[e.i].c * 1.02) continue
  const c = ddCount.get(st.bars[e.i].date)
  const br = bOC(x.date, x.date)
  if (c === undefined || br === null) continue
  ;(ev[band(c)] ||= []).push({ p: per(st.bars[e.i].date), v: (x.c / x.o - 1) * 100 - br })
}
console.log(' 企業の行動（自社株買い・増配。翌日の寄り→引けの全体比%）')
for (const b of BANDS) show(b, ev[b] || [])
const days = {}
for (const [d, c] of ddCount) (days[band(c)] ||= []).push(d)
console.log(' 日数：' + BANDS.map(b => `${b} ${(days[b] || []).length}日`).join('・'))
