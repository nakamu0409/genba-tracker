// 本人の希望（11/25）：「この株はこの値段で買って、この値段で売る」。銘柄ごとに一番良い値段を探すのではなく、どの株にも同じ決まりで「その株の節目」を使う（先に比べ方を決める）
// スイングの候補（10年、lib_signals の swing）で、損切りは今と同じ（候補の stop）、最長40営業日。
// 売る値段（買うのは今と同じ翌日の寄り、終値×1.02以下）：
//   now＝目標3R ／ hi60＝直近60日の高値（買値より1%以上上のとき。無ければ3R） ／ hi250＝52週の高値（同じ） ／ min60＝3R と60日高値の低いほう ／ round＝3R の近く（±1%）にキリのいい値段（100円単位）があれば、その1円下
// 買う値段（売るのは買値から3R）：
//   open＝今（翌日の寄り） ／ ma20＝20日移動平均の指値（3営業日以内に届いたら） ／ low10＝直近10日の安値の指値（同じ） ／ dip2＝終値×0.98 の指値（同じ）。届かなければ買わない＝0R
// 比べるもの：候補1件あたりの平均R（買えなかった候補は0R。1回の損は同じ金額なので、口座への効き方はこれで比べられる）、買えた割合。期間：前半／後半／直近
// 結果（11/25。前半／後半／直近）：売る値段は3Rがいちばん良い（now −0.059／+0.109／+0.420R、60日高値 −0.073／+0.033／+0.217R、52週高値 −0.053／+0.059／+0.230R、低いほう −0.073／+0.031／+0.213R、キリのいい値段の手前 −0.060／+0.109／+0.419R＝差なし）→ 節目で売るのは採らない。
//   買う値段：候補1件あたり（買えなければ0R）では今（寄り）が後半・直近で良い（open −0.057／+0.105／+0.396R、20日線の指値 +0.004／+0.045／+0.145R・買えた3割、終値−2%の指値 +0.019／+0.047／+0.179R・買えた4割）。
//   ただし買えた1回あたりは指値のほうが3つの期間とも良い（20日線 +0.01／+0.16／+0.50R、−2% +0.04／+0.12／+0.44R、寄り −0.06／+0.11／+0.42R）。候補は毎晩たくさんあって空きで買う数が決まるので、口座全体の試算で確かめる（次の作業）
import { loadAll, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, swing } = loadAll()
function run(B, e, entry, stop, target) {
  const risk = entry - stop
  if (!(risk > 0)) return null
  for (let k = e; k < B.length && k < e + 40; k++) {
    const x = B[k]
    if (k > e && x.o <= stop) return (x.o * (1 - SLIP) - entry) / risk
    if (x.l <= stop) return (stop * (1 - SLIP) - entry) / risk
    if (k > e && x.o >= target) return (x.o - entry) / risk
    if (x.h >= target) return (target - entry) / risk
    if (k === e + 39) return (x.c * (1 - SLIP) - entry) / risk
  }
  return null
}
const hiN = (B, i, n) => { let h = -Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) h = Math.max(h, B[j].h); return h }
const loN = (B, i, n) => { let l = Infinity; for (let j = Math.max(0, i - n + 1); j <= i; j++) l = Math.min(l, B[j].l); return l }
const ma = (B, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += B[j].c; return s / n }
const X = ['now', 'hi60', 'hi250', 'min60', 'round'], N = ['open', 'ma20', 'low10', 'dip2']
const G = Object.fromEntries([...X, ...N].map(k => [k, { r: [[], [], []], fill: [[], [], []] }]))
for (const s of swing) {
  const B = stocks[s.code].bars, i = s.i, e = i + 1
  if (e + 41 >= B.length || i < 250) continue
  const p = per(s.date)
  // 売る値段
  if (B[e].o <= s.close * 1.02 && B[e].h > B[e].l) {
    const entry = B[e].o * (1 + SLIP), risk = entry - s.stop
    if (risk > 0) {
      const t3 = entry + 3 * risk
      const h60 = hiN(B, i, 60), h250 = hiN(B, i, 250)
      const rn = Math.round(t3 / 100) * 100
      const T = { now: t3, hi60: h60 > entry * 1.01 ? h60 : t3, hi250: h250 > entry * 1.01 ? h250 : t3, min60: h60 > entry * 1.01 ? Math.min(t3, h60) : t3, round: Math.abs(rn - t3) <= t3 * 0.01 && rn - 1 > entry ? rn - 1 : t3 }
      for (const k of X) { const r = run(B, e, entry, s.stop, T[k]); if (r != null) G[k].r[p].push(r) }
    }
  }
  // 買う値段
  const L = { open: null, ma20: ma(B, i, 20), low10: loN(B, i, 10), dip2: s.close * 0.98 }
  for (const k of N) {
    let entry = null, ee = null
    if (k === 'open') { if (B[e].o <= s.close * 1.02 && B[e].h > B[e].l) { entry = B[e].o * (1 + SLIP); ee = e } }
    else {
      const lim = L[k]
      if (lim < s.close && lim > s.stop) for (let j = e; j < e + 3; j++) { if (B[j].l <= s.stop) break; if (B[j].l <= lim) { entry = Math.min(B[j].o, lim) * (1 + SLIP); ee = j; break } }
    }
    if (entry == null) { G[k].r[p].push(0); G[k].fill[p].push(0); continue }
    const r = run(B, ee, entry, s.stop, entry + 3 * (entry - s.stop))
    G[k].r[p].push(r ?? 0); G[k].fill[p].push(1)
  }
}
const f = a => a.map(x => `${fmt(mean(x), 3)}R`).join(' ／ ')
console.log('売る値段（買えた候補の平均R）前半／後半／直近'); for (const k of X) console.log(`  ${k.padEnd(7)} ${f(G[k].r)}  (${G[k].r.map(x => x.length).join('/')})`)
console.log('買う値段（候補1件あたりの平均R・買えなければ0R）／買えた割合'); for (const k of N) console.log(`  ${k.padEnd(7)} ${f(G[k].r)}  買えた ${G[k].fill.map(x => (mean(x) * 100).toFixed(0) + '%').join(' ／ ')}`)
