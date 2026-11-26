// 本人の考え（11/25、ナカニシを目標で売ったあと上がった）：目標の値段に届いたら、すぐ売らずに「目標を損切りの下限」にして、その日の引けで売る
// 日足でのやり方：目標に届いた日（寄りで届いた日も）に、安値が目標以下なら目標で売る（逆指値・滑り0.1%）、そうでなければ引けで売る。
//   日足では「目標に届いてから下がった」か「下がってから届いた」かは分からない。引けが目標より下なら、届いたあとに目標を割ったとみて目標で売る（ふつうの見方）
// 参考：翌日の引けまで持つ（下限は目標のまま）。比べるのは今の決まり（目標で売る）。スイングの候補（3R・40日）の平均R。期間：前半／後半／直近
// 結果（11/25。前半／後半／直近、全部の候補の平均R）：今 +0.057／+0.111／+0.261R、目標を下限にその日の引け +0.082／+0.140／+0.297R、翌日の引け +0.088／+0.141／+0.320R、下限なしで引成 +0.052／+0.108／+0.256R。
//   ただし日足の見方は甘い。5分足のある60日（目標に届いた623回）で正しく数えると、今 +3.099R に対し 日足の見方 +3.242R、5分足 +3.114R（差 +0.015R だけ）。
//   目標に届いたあと一度目標を割ってから引けで上にいた回が267回（43%）あり、日足ではそこを引けで売れたことにしていた。得はごく小さく、場中に注文を直す手間に見合わない（採らない）
import { loadAll, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, swing } = loadAll()
function sim(B, i, stop, mode) {
  const e = i + 1; if (e >= B.length) return null
  const b = B[e]; if (b.h === b.l) return null
  const entry = b.o * (1 + SLIP); if (!(entry > stop)) return null
  const risk = entry - stop, target = entry + 3 * risk
  for (let k = e; k < B.length && k < e + 40; k++) {
    const x = B[k]
    let exit = null, hit = false
    if (k > e && x.o <= stop) exit = x.o * (1 - SLIP)
    else if (x.l <= stop) exit = stop * (1 - SLIP)
    else if (x.h >= target) {
      hit = true
      if (mode === 'now') exit = k > e && x.o >= target ? x.o : target
      else {
        // 目標を下限にしてその日（mode=1）か翌日（mode=2）の引けまで
        if (mode !== 3 && x.c < target) exit = target * (1 - SLIP)
        else if (mode === 1 || mode === 3 || k + 1 >= B.length) exit = x.c * (1 - SLIP)
        else { const y = B[k + 1]; exit = y.o <= target ? y.o * (1 - SLIP) : y.l <= target ? target * (1 - SLIP) : y.c * (1 - SLIP) }
      }
    } else if (k === e + 39) exit = x.c * (1 - SLIP)
    if (exit !== null) return { r: (exit - entry) / risk, hit }
  }
  return null
}
const G = { now: [[], [], []], d1: [[], [], []], d2: [[], [], []], d3: [[], [], []] }, H = { now: [[], [], []], d1: [[], [], []], d2: [[], [], []], d3: [[], [], []] }
for (const s of swing) {
  const B = stocks[s.code].bars, p = per(s.date)
  const a = sim(B, s.i, s.stop, 'now'), b = sim(B, s.i, s.stop, 1), c = sim(B, s.i, s.stop, 2), d3 = sim(B, s.i, s.stop, 3)
  if (!a || !b || !c || !d3) continue
  G.d3[p].push(d3.r); if (a.hit) H.d3[p].push(d3.r)
  G.now[p].push(a.r); G.d1[p].push(b.r); G.d2[p].push(c.r)
  if (a.hit) { H.now[p].push(a.r); H.d1[p].push(b.r); H.d2[p].push(c.r) }
}
const f = a => a.map(x => `${fmt(mean(x), 3)}R(${x.length})`).join(' ／ ')
console.log('全部の候補：今（目標で売る）', f(G.now)); console.log('            その日の引け', f(G.d1)); console.log('            翌日の引け  ', f(G.d2))
console.log('            下限なしで引成', f(G.d3))
console.log('目標に届いた回だけ：今', f(H.now)); console.log('            その日の引け', f(H.d1)); console.log('            翌日の引け  ', f(H.d2))
console.log('            下限なしで引成', f(H.d3))
