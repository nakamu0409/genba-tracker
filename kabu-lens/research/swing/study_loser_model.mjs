// 損切りになる株を、買う前に見分けられるか（11/26 本人の考え：損の上限より、そもそも損切りになる株を選ばない判断を。負ける確率をなんとかする）
// スイングの候補10年（lib_signals の swing、今の売り方＝2×ATR 損切り・3R・40日）を、合図の日に分かる特徴（約20）で比べる。
// 1) 特徴ごと：前半で5つに分け（分け目も前半で決める）、一番上と一番下の平均Rの差が、後半・直近でも同じ向きか
// 2) まとめた物差し：前半だけで「平均Rの予想」を作り（リッジ回帰）、後半・直近で予想の悪い2割・良い2割の平均R・損切りの割合を比べる
// 結果（11/26）：スイングの候補 5.3万／6.7万／1.4万回、平均R −0.077／+0.109／+0.419、損切り 67／63／57%。
//   3つの期間で同じ向き：値段が高いほど悪い（上位2割 ≧約3,000円 は下位2割 ≦約840円 より −0.22／−0.33／−0.11R）、相場（1306）が5日で+2%以上の後は悪い、出来高が20日平均の1.5倍以上は悪い、押し目は良い・勢いは悪い。
//   20の特徴をまとめた物差し（前半でリッジ回帰）は後半・直近で当たらない（混ぜると過去に合わせすぎる）。
//   口座全体10年（study_combined、本番＋）：出来高1.5倍以上を除く（swVolMax 0.4）＋1,400円未満（maxPrice 1400）：62.9／60.0／136.2%（今 60.5／59.5／114.9）、一番下げ −20.8%、プラス9/10年・t 3.17 → 3つの期間そろって良く、物差しも合格
//   相場+2%の後は買わない（swMkt5Max 2）は直近 64.4% と悪い（強い相場で買えない日が続く）。+4% は差なし。
import { loadAll, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks, swing, bench } = loadAll()
const bi = new Map(bench.map((b, i) => [b.date, i]))
function run(B, e, entry, stop, target) {
  const risk = entry - stop
  for (let k = e; k < B.length && k < e + 40; k++) {
    const x = B[k]
    if (k > e && x.o <= stop) return [(x.o * (1 - SLIP) - entry) / risk, 1]
    if (x.l <= stop) return [(stop * (1 - SLIP) - entry) / risk, 1]
    if (k > e && x.o >= target) return [(x.o - entry) / risk, 0]
    if (x.h >= target) return [(target - entry) / risk, 0]
    if (k === e + 39) return [(x.c * (1 - SLIP) - entry) / risk, 0]
  }
  return null
}
const sma = (B, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += B[j].c; return s / n }
const FN = ['score', 'stopDist', 'ret5', 'ret20', 'ret60', 'dev25', 'dev75', 'pos52', 'volRatio', 'rangePct', 'closePos', 'gap', 'upShadow', 'logTurn', 'logPrice', 'upDays', 'mkt5', 'mkt20', 'mktAbove200', 'rel20', 'kGAP', 'kPULL', 'kBRK', 'kMOM']
const rows = []
for (const s of swing) {
  const B = stocks[s.code].bars, i = s.i, e = i + 1
  if (e + 41 >= B.length || i < 260) continue
  if (!(B[e].o <= s.close * 1.02 && B[e].h > B[e].l)) continue
  const entry = B[e].o * (1 + SLIP)
  if (!(entry - s.stop > 0)) continue
  const out = run(B, e, entry, s.stop, entry + 3 * (entry - s.stop)); if (!out) continue
  const x = B[i], c = x.c
  let hi = -Infinity, lo = Infinity; for (let j = i - 249; j <= i; j++) { hi = Math.max(hi, B[j].h); lo = Math.min(lo, B[j].l) }
  let v20 = 0; for (let j = i - 20; j < i; j++) v20 += B[j].v; v20 /= 20
  let ud = 0; for (let j = i; j > i - 10 && B[j].c > B[j - 1].c; j--) ud++
  const k0 = bi.get(x.date)
  const m200 = k0 >= 200 ? (() => { let m = 0; for (let j = k0 - 199; j <= k0; j++) m += bench[j].c; return m / 200 })() : null
  const mk = n => (k0 >= n ? (bench[k0].c / bench[k0 - n].c - 1) * 100 : 0)
  const f = {
    score: s.score, stopDist: (c - s.stop) / c * 100, ret5: (c / B[i - 5].c - 1) * 100, ret20: (c / B[i - 20].c - 1) * 100, ret60: (c / B[i - 60].c - 1) * 100,
    dev25: (c / sma(B, i, 25) - 1) * 100, dev75: (c / sma(B, i, 75) - 1) * 100, pos52: (c - lo) / (hi - lo || 1), volRatio: Math.log((x.v + 1) / (v20 + 1)),
    rangePct: (x.h - x.l) / c * 100, closePos: (c - x.l) / ((x.h - x.l) || 1), gap: (x.o / B[i - 1].c - 1) * 100, upShadow: (x.h - Math.max(x.o, c)) / c * 100,
    logTurn: Math.log10(stocks[s.code].turn[i] + 1), logPrice: Math.log10(c), upDays: ud, mkt5: mk(5), mkt20: mk(20), mktAbove200: m200 && bench[k0].c > m200 ? 1 : 0,
    rel20: (c / B[i - 20].c - 1) * 100 - mk(20), kGAP: s.kind === 'GAP' ? 1 : 0, kPULL: s.kind === 'PULLBACK' ? 1 : 0, kBRK: s.kind === 'BREAKOUT' ? 1 : 0, kMOM: s.kind === 'MOMENTUM' ? 1 : 0
  }
  rows.push({ p: per(s.date), f: FN.map(k => Number.isFinite(f[k]) ? f[k] : 0), r: out[0], stopped: out[1] })
}
console.log('候補', rows.map(r => r.p).reduce((a, p) => (a[p]++, a), [0, 0, 0]).join('/'), '全体の平均R', [0, 1, 2].map(p => fmt(mean(rows.filter(r => r.p === p).map(r => r.r)), 3)).join(' ／ '), '損切りの割合', [0, 1, 2].map(p => Math.round(mean(rows.filter(r => r.p === p).map(r => r.stopped)) * 100) + '%').join(' ／ '))
// 1) 特徴ごと
const tr = rows.filter(r => r.p === 0)
console.log('\n1) 特徴ごと：前半で決めた5分位の 上位2割 − 下位2割 の平均R（前半／後半／直近）。3つとも同じ向きに ◎')
const one = []
FN.forEach((name, k) => {
  const v = tr.map(r => r.f[k]).sort((a, b) => a - b)
  const q20 = v[Math.floor(v.length * 0.2)], q80 = v[Math.floor(v.length * 0.8)]
  if (q20 === q80) return
  const d = [0, 1, 2].map(p => { const R = rows.filter(r => r.p === p); return mean(R.filter(r => r.f[k] >= q80).map(r => r.r)) - mean(R.filter(r => r.f[k] <= q20).map(r => r.r)) })
  const same = d.every(x => x > 0) || d.every(x => x < 0)
  one.push([name, d, same, q20, q80])
})
for (const [name, d, same, q20, q80] of one.sort((a, b) => Math.abs(b[1][1]) - Math.abs(a[1][1]))) console.log(`  ${same ? '◎' : '  '} ${name.padEnd(12)} ${d.map(x => fmt(x, 3)).join(' ／ ')}   （下位2割 ≦${fmt(q20, 2)}、上位2割 ≧${fmt(q80, 2)}）`)
// 2) リッジ回帰（前半だけで）
const m = FN.map((_, k) => mean(tr.map(r => r.f[k]))), sd = FN.map((_, k) => Math.sqrt(mean(tr.map(r => (r.f[k] - m[k]) ** 2))) || 1)
const Z = r => r.f.map((v, k) => (v - m[k]) / sd[k])
const n = FN.length, A = Array.from({ length: n + 1 }, () => new Float64Array(n + 1)), bvec = new Float64Array(n + 1)
for (const r of tr) { const z = [1, ...Z(r)]; for (let a = 0; a <= n; a++) { bvec[a] += z[a] * r.r; for (let b = 0; b <= n; b++) A[a][b] += z[a] * z[b] } }
for (let a = 1; a <= n; a++) A[a][a] += tr.length * 0.01
// ガウスの消去
const M = A.map((row, a) => [...row, bvec[a]])
for (let c = 0; c <= n; c++) { let piv = c; for (let r = c + 1; r <= n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;[M[c], M[piv]] = [M[piv], M[c]]; for (let r = 0; r <= n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n + 1; k++) M[r][k] -= f * M[c][k] } }
const w = M.map((row, a) => row[n + 1] / row[a])
const pred = r => w[0] + Z(r).reduce((s, z, k) => s + z * w[k + 1], 0)
console.log('\n2) 前半で作った物差しの重み（大きい順）：', FN.map((k, j) => [k, w[j + 1]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([k, v]) => `${k} ${fmt(v, 3)}`).join('、'))
const cut = tr.map(pred).sort((a, b) => a - b), c20 = cut[Math.floor(cut.length * 0.2)], c40 = cut[Math.floor(cut.length * 0.4)], c80 = cut[Math.floor(cut.length * 0.8)]
for (const [lab, f] of [['悪い2割', x => x <= c20], ['悪い4割', x => x <= c40], ['真ん中', x => x > c20 && x < c80], ['良い2割', x => x >= c80], ['悪い2割を除く', x => x > c20], ['悪い4割を除く', x => x > c40]]) {
  console.log(`  ${lab.padEnd(8)} ` + [0, 1, 2].map(p => { const R = rows.filter(r => r.p === p && f(pred(r))); return `${fmt(mean(R.map(r => r.r)), 3)}R・損切り${Math.round(mean(R.map(r => r.stopped)) * 100)}%・${R.length}回` }).join(' ／ '))
}
// 3) 3つの期間で同じ向きだった特徴で、しぼってみる（分け目は前半の5分位）
const idx = k => FN.indexOf(k)
const qs = (k, qq) => { const v = tr.map(r => r.f[idx(k)]).sort((a, b) => a - b); return v[Math.floor(v.length * qq)] }
console.log('\n3) 5分位ごと（下から）の平均R・損切りの割合（前半／後半／直近）')
for (const k of ['logPrice', 'mkt5', 'volRatio', 'dev75']) {
  const cuts = [0.2, 0.4, 0.6, 0.8].map(q => qs(k, q))
  console.log(`  ${k}（分け目 ${cuts.map(c => fmt(k === 'logPrice' ? 10 ** c : c, k === 'logPrice' ? 0 : 2)).join('・')}）`)
  for (let b = 0; b < 5; b++) {
    const lo = b ? cuts[b - 1] : -Infinity, hi = b < 4 ? cuts[b] : Infinity
    console.log(`    ${b + 1}: ` + [0, 1, 2].map(p => { const R = rows.filter(r => r.p === p && r.f[idx(k)] > lo && r.f[idx(k)] <= hi); return `${fmt(mean(R.map(r => r.r)), 3)}R・${Math.round(mean(R.map(r => r.stopped)) * 100)}%・${R.length}` }).join(' ／ '))
  }
}
const P80 = qs('logPrice', 0.8), M80 = qs('mkt5', 0.8), V80 = qs('volRatio', 0.8)
for (const [lab, f] of [['今（しぼらない）', () => true], ['値段の高い2割を除く', r => r.f[idx('logPrice')] < P80], ['相場が5日で大きく上げた後を除く', r => r.f[idx('mkt5')] < M80], ['出来高が急に増えた日を除く', r => r.f[idx('volRatio')] < V80], ['3つとも除く', r => r.f[idx('logPrice')] < P80 && r.f[idx('mkt5')] < M80 && r.f[idx('volRatio')] < V80]]) {
  console.log(`  ${lab.padEnd(18)} ` + [0, 1, 2].map(p => { const R = rows.filter(r => r.p === p && f(r)); return `${fmt(mean(R.map(r => r.r)), 3)}R・損切り${Math.round(mean(R.map(r => r.stopped)) * 100)}%・${R.length}回` }).join(' ／ '))
}
