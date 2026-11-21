// 急落の反発：買うタイミングを待つと良くなるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_crash_entry.mjs
// 合図：5日で −15%以下・終値300円以上・売買代金1億円以上・前の10日に合図なし（今の練習口座と同じ）
// 買い方（どれも買ってから5日目の引けで売る。TOPIX との差から往復 0.2% を引く）：
//   A 翌日の寄り（今）
//   B 翌日の寄りが前の日の終値より +1%以上高く始まったときだけ、その寄り
//   C 翌日が陽線（引け＞寄り）で終わったときだけ、その引け
//   D 合図のあと初めて「終値が前の日より上」の日が来たら（5日以内）、その次の日の寄り
//   E 合図の日から5日たっても安値を割らなかったら（=底を確かめた）、6日目の寄り
// 分け方：全部／相場全体の急落（TOPIX 5日 −4%以下）／その株だけの急落、株価1,500円以上／未満
// 期間：選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const COST = 0.2
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
// 株：e の日に price（寄り or 引け）で買い、e+4 の引けで売る
const trade = (B, e, atOpen) => {
  if (e + 4 >= B.length || B[e].h === B[e].l) return null
  const k0 = bi.get(B[e].date)
  const k1 = bi.get(B[e + 4].date)
  if (k0 === undefined || k1 === undefined) return null
  const px = atOpen ? B[e].o : B[e].c
  const bpx = atOpen ? bench[k0].o : bench[k0].c
  return (B[e + 4].c / px - 1) * 100 - (bench[k1].c / bpx - 1) * 100 - COST
}
const rows = []
for (const st of Object.values(stocks)) {
  const B = st.bars
  let last = -99
  for (let i = 260; i < B.length - 12; i++) {
    if (!(B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300 && st.turn[i] >= 1e8)) continue
    const first = i - last > 10
    last = i
    if (!first) continue
    const k = bi.get(B[i].date)
    const m5 = k >= 5 ? (bench[k].c / bench[k - 5].c - 1) * 100 : null
    const r = { date: B[i].date, mkt: m5 !== null && m5 <= -4, hi: B[i].c >= 1500 }
    r.A = trade(B, i + 1, true)
    r.B = B[i + 1].o >= B[i].c * 1.01 ? trade(B, i + 1, true) : null
    r.C = B[i + 1].c > B[i + 1].o ? trade(B, i + 1, false) : null
    let j = -1
    for (let t = i + 1; t <= i + 5; t++) if (B[t].c > B[t - 1].c) { j = t; break }
    r.D = j > 0 ? trade(B, j + 1, true) : null
    let low = Infinity
    for (let t = i + 1; t <= i + 5; t++) low = Math.min(low, B[t].l)
    r.E = low >= B[i].l ? trade(B, i + 6, true) : null
    rows.push(r)
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const NAMES = { A: '翌日の寄り（今）', B: '翌日 +1%以上で始まったら', C: '翌日が陽線なら引け', D: '初めて上げた次の日の寄り', E: '5日安値を割らなければ' }
for (const [g, p] of [['全部', () => true], ['相場全体の急落', r => r.mkt], ['その株だけの急落', r => !r.mkt], ['株価1,500円以上', r => r.hi], ['株価1,500円以上・相場全体', r => r.hi && r.mkt]]) {
  const z = rows.filter(p)
  console.log(`■ ${g}（合図 ${z.length}件）`)
  for (const [k, n] of Object.entries(NAMES)) {
    const v = [0, 1, 2].map(q => z.filter(r => per(r) === q && r[k] !== null).map(r => r[k]))
    const m = v.map(mean)
    const tag = m.every(x => x > 0) ? '◎◎' : m[0] > 0 && m[1] > 0 ? '◎' : ''
    console.log(`  ${n.padEnd(14)} ${v.map((a, q) => `${fmt(m[q])}(${a.length})`).join('  ')}  ${tag}`)
  }
}
