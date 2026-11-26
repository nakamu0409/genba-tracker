// 利確の値段に近づくにつれて損切りを上げる形（2026-11-22 本人の質問。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_ratchet.mjs
// 今の決まり：スイングの候補を翌日の寄り（終値+2%以内）で買い、損切り＝合図の stop、目標3R、40営業日。
// 足す決まり（終値で判定し、翌日から新しい損切り。上げるだけ）：
//   a) 終値が+2R に届いたら損切りを+1R へ
//   b) +1.5R で買値、+2.5R で+1.5R
//   c) +1R で買値、+2R で+1R、+2.5R で+2R（目標の近くでぴったり追う）
//   d) 目標5R のまま、+3R で+2R、+4R で+3R
// 物差し：1回の平均R・勝率・持った日数。期間：選ぶ／確かめる／最後の確認。すべり 0.1%×往復
// 結果（2026-11-22）：どの引き上げ方も、3つの期間すべてで今（引き上げなし）より悪い。早く上げるほど悪い。
//   今 +0.055／+0.110／+0.256R。a) +2R→+1R +0.049／+0.097／+0.235。b) +0.052／+0.097／+0.224。c) +0.045／+0.074／+0.194（勝率も下がる）
//   目標5R でも、引き上げあり（d）+0.056／+0.138／+0.301 は引き上げなし +0.063／+0.159／+0.321 より悪い。
//   → 押し目で損切りに当たり、そのあと目標まで伸びる株を手放す。損切りは上げない（本人が決めた作戦で上げるのは止めないが、成績の面では得にならない）
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const A = SPLIT_DATE, BB = '2025-11-14', SLIP = 0.001
const D = loadAll()
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
function run(B, i, stop0, rMult, steps) {
  const e = i + 1
  if (e >= B.length) return null
  const b = B[e]
  if (b.h === b.l || b.o > B[i].c * 1.02) return null
  const entry = b.o * (1 + SLIP)
  if (!(entry > stop0)) return null
  const risk = entry - stop0
  const target = entry + rMult * risk
  let stop = stop0
  for (let k = e; k < B.length && k < e + 40; k++) {
    const x = B[k]
    let exit = null
    if (k > e && x.o <= stop) exit = x.o * (1 - SLIP)
    else if (x.l <= stop) exit = stop * (1 - SLIP)
    else if (k > e && x.o >= target) exit = x.o
    else if (x.h >= target) exit = target
    else if (k === e + 39) exit = x.c * (1 - SLIP)
    if (exit !== null) return { r: (exit - entry) / risk, days: k - e + 1 }
    const rc = (x.c - entry) / risk
    for (const [at, to] of steps) if (rc >= at) stop = Math.max(stop, entry + to * risk)
  }
  return null
}
const CFG = [
  ['今：目標3R・引き上げなし', 3, []],
  ['a) +2Rで損切りを+1Rへ', 3, [[2, 1]]],
  ['b) +1.5Rで買値・+2.5Rで+1.5R', 3, [[1.5, 0], [2.5, 1.5]]],
  ['c) +1Rで買値・+2Rで+1R・+2.5Rで+2R', 3, [[1, 0], [2, 1], [2.5, 2]]],
  ['参考：目標5R・引き上げなし', 5, []],
  ['d) 目標5R・+3Rで+2R・+4Rで+3R', 5, [[3, 2], [4, 3]]]
]
console.log('平均R（選ぶ／確かめる／最後の確認）・勝率・平均の日数')
for (const [name, rm, steps] of CFG) {
  const g = [[], [], []]; const all = []
  for (const s of D.swing) {
    const t = run(D.stocks[s.code].bars, s.i, s.stop, rm, steps)
    if (!t) continue
    g[per(s.date)].push(t.r); all.push(t)
  }
  console.log(`  ${name.padEnd(30)} ${g.map(a => `${fmt(mean(a), 3)}(${a.length})`).join('  ')}  勝率${(all.filter(t => t.r > 0).length / all.length * 100).toFixed(0)}%  ${mean(all.map(t => t.days)).toFixed(1)}日`)
}
