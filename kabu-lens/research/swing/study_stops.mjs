// その時の形で損切り・利確を決める（11/26 本人の考え：「箱を下回ったら損切り」のように、傾向を読んで損切りと利確を決めてもいいのでは）
// スイングの候補（10年、lib_signals の swing）を翌日の寄り（終値×1.02以下）で買う。1回の損の金額は同じにするので、各案の自分の損切り幅で割った R で比べる
// 案（損切り／利確）：
//   now＝今（候補の stop＝2×ATR 下／3R・40日）
//   low20＝直近20日の安値の0.5%下／3R   low60＝直近60日の安値（箱の下）の0.5%下／3R
//   be＝今の損切り、終値が+1Rを超えたら損切りを買値へ   trail＝今の損切り、+1Rを超えたら損切りを直近10日の安値へ毎日上げる（上げるだけ）、利確なし・40日
//   boxsw＝箱（60日の幅15%以下）の中なら 箱の下で損切り・箱の上（60日高値）で利確、箱でなければ now
//   regime＝相場全体（1306）が200日線の上なら3R、下なら1.5R（弱いときは早めに利確）
// 損切りまでの幅が買値の0.5%未満か15%を超える案は、その候補は now と同じにする。期間：前半／後半／直近
// 結果（11/26。平均R 前半／後半／直近、各5.4万／6.7万／1.4万回）：今 −0.059／+0.109／+0.420
//   箱・節目の損切り：20日安値 −0.064／+0.135／+0.393、60日安値（箱の下）−0.058／+0.121／+0.365、箱なら箱の下で損切り・上で利確 −0.049／+0.105／+0.365
//   +1Rで損切りを買値へ −0.045／+0.084／+0.350（前半だけ良い）、相場が弱いとき1.5R −0.060／+0.112／+0.420（差なし）
//   上げていく損切り（36通り）：20日安値で上げる・+1Rから・利確なし −0.078／+0.171／+0.533（後半・直近は大きく良いが前半が悪い）。
//   相場（1306）が200日線の上なら20日安値で上げていく・下なら今（adapt）−0.074／+0.149→+0.175／+0.533。
//   → 3つの期間そろって今より良い形は 0／45。後半・直近だけ良い「上げていく損切り」は、口座全体（持つ日数が延びて現金が寝る分）で確かめる候補
import { loadAll, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, swing, bench } = loadAll()
const bi = new Map(bench.map((b, i) => [b.date, i]))
const loN = (B, i, n) => { let l = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) l = Math.min(l, B[j].l); return l }
const hiN = (B, i, n) => { let h = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) h = Math.max(h, B[j].h); return h }
// opts: be（+1Rで買値へ）、trail（+1Rから10日安値へ）
function run(B, e, entry, stop0, target, opts = {}) {
  const risk = entry - stop0
  let stop = stop0, armed = false
  for (let k = e; k < B.length && k < e + 40; k++) {
    const x = B[k]
    if (k > e && x.o <= stop) return (x.o * (1 - SLIP) - entry) / risk
    if (x.l <= stop) return (stop * (1 - SLIP) - entry) / risk
    if (k > e && x.o >= target) return (x.o - entry) / risk
    if (x.h >= target) return (target - entry) / risk
    if (k === e + 39) return (x.c * (1 - SLIP) - entry) / risk
    if (x.c >= entry + risk * (opts.arm ?? 1)) armed = true
    if (armed && opts.be) stop = Math.max(stop, entry)
    if (armed && opts.trail) stop = Math.max(stop, loN(B, k, opts.trailN ?? 10))
    if (opts.trailFrom0 && k >= e) stop = Math.max(stop, loN(B, k, opts.trailN ?? 10))
  }
  return null
}
const TV = []
for (const trailN of [5, 10, 20]) for (const arm of [0, 0.5, 1, 2]) for (const tgt of [Infinity, 5, 8]) TV.push({ trailN, arm, tgt })
const K = ['adapt', 'adapt2', 'now', 'low20', 'low60', 'be', 'trail', 'boxsw', 'regime', ...TV.map(v => `tr${v.trailN}_a${v.arm}_t${v.tgt === Infinity ? 'none' : v.tgt}`)]
const G = Object.fromEntries(K.map(k => [k, [[], [], []]]))
for (const s of swing) {
  const B = stocks[s.code].bars, i = s.i, e = i + 1
  if (e + 41 >= B.length || i < 250) continue
  if (!(B[e].o <= s.close * 1.02 && B[e].h > B[e].l)) continue
  const entry = B[e].o * (1 + SLIP)
  if (!(entry - s.stop > 0)) continue
  const p = per(s.date)
  const ok = st => st < entry && (entry - st) / entry >= 0.005 && (entry - st) / entry <= 0.15
  const t3 = st => entry + 3 * (entry - st)
  const add = (k, r) => { if (r != null) G[k][p].push(r) }
  add('now', run(B, e, entry, s.stop, t3(s.stop)))
  const l20 = loN(B, i, 20) * 0.995, l60 = loN(B, i, 60) * 0.995
  add('low20', ok(l20) ? run(B, e, entry, l20, t3(l20)) : run(B, e, entry, s.stop, t3(s.stop)))
  add('low60', ok(l60) ? run(B, e, entry, l60, t3(l60)) : run(B, e, entry, s.stop, t3(s.stop)))
  add('be', run(B, e, entry, s.stop, t3(s.stop), { be: true }))
  add('trail', run(B, e, entry, s.stop, Infinity, { trail: true }))
  const h60 = hiN(B, i, 60), lo60 = loN(B, i, 60), inBox = (h60 - lo60) / lo60 <= 0.15
  add('boxsw', inBox && ok(l60) && h60 > entry * 1.01 ? run(B, e, entry, l60, h60) : run(B, e, entry, s.stop, t3(s.stop)))
  const k0 = bi.get(B[i].date)
  let up = true
  if (k0 >= 200) { let m = 0; for (let j = k0 - 199; j <= k0; j++) m += bench[j].c; up = bench[k0].c > m / 200 }
  for (const v of TV) add(`tr${v.trailN}_a${v.arm}_t${v.tgt === Infinity ? 'none' : v.tgt}`, run(B, e, entry, s.stop, v.tgt === Infinity ? Infinity : entry + v.tgt * (entry - s.stop), { trail: true, trailN: v.trailN, arm: v.arm }))
  add('regime', run(B, e, entry, s.stop, entry + (up ? 3 : 1.5) * (entry - s.stop)))
  // adapt（その時の相場で売り方を変える）：相場全体が200日線の上なら 20日安値で上げていく損切り（+1Rから・利確なし）、下なら今（3R）
  add('adapt', up ? run(B, e, entry, s.stop, Infinity, { trail: true, trailN: 20, arm: 1 }) : run(B, e, entry, s.stop, t3(s.stop)))
  // adapt2：その株が上向き（終値が50日線の上で50日線が上向き）なら 20日安値で上げていく、でなければ今
  let su = false
  if (i >= 60) { let m0 = 0, m1 = 0; for (let j = i - 49; j <= i; j++) m0 += B[j].c; for (let j = i - 59; j <= i - 10; j++) m1 += B[j].c; su = B[i].c > m0 / 50 && m0 > m1 }
  add('adapt2', su ? run(B, e, entry, s.stop, Infinity, { trail: true, trailN: 20, arm: 1 }) : run(B, e, entry, s.stop, t3(s.stop)))
}
console.log('平均R（前半／後半／直近）と回数')
const sorted = [...K].sort((a, b) => mean(G[b][0]) - mean(G[a][0]))
console.log('（前半の良い順）')
for (const k of sorted) console.log(`  ${k.padEnd(7)} ${G[k].map(x => fmt(mean(x), 3)).join(' ／ ')}  (${G[k].map(x => x.length).join('/')})`)
