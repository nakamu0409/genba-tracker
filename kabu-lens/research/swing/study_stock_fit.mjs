// 銘柄ごとに「スイング向き」はあるか：前半5年の候補の成績（平均R）が良かった銘柄は、後半5年でも良いか。銘柄の性質（値動きの荒さ・株価・売買代金・トレンドの出やすさ）でも分ける
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_stock_fit.mjs
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const D = loadAll()
const per = {}
for (const s of D.swing) {
  const st = D.stocks[s.code]
  const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const g = (per[s.code] ||= { A: [], B: [] })
  ;(s.date < SPLIT_DATE ? g.A : g.B).push(t.r)
}
// 銘柄の性質（前半の日足で測る＝後半の答えを見ないで分かるもの）
const feat = code => {
  const B = D.stocks[code].bars.filter(b => b.date < SPLIT_DATE)
  if (B.length < 250) return null
  let tr = 0
  let moves = 0
  for (let i = 1; i < B.length; i++) {
    tr += (B[i].h - B[i].l) / B[i - 1].c
    moves += Math.abs(B[i].c / B[i - 1].c - 1)
  }
  const net = Math.abs(Math.log(B[B.length - 1].c / B[0].c))
  // トレンドの出やすさ：20日ごとの「正味の動き ÷ 毎日の動きの合計」の平均（1に近いほど一方向に動く）
  let eff = 0
  let n = 0
  for (let i = 20; i < B.length; i += 20) {
    let sm = 0
    for (let k = i - 19; k <= i; k++) sm += Math.abs(B[k].c / B[k - 1].c - 1)
    if (sm > 0) { eff += Math.abs(B[i].c / B[i - 20].c - 1) / sm; n++ }
  }
  return { atrPct: tr / (B.length - 1) * 100, price: B[B.length - 1].c, eff: eff / n, net }
}
const rows = []
for (const [code, g] of Object.entries(per)) {
  if (g.A.length < 15 || g.B.length < 15) continue
  rows.push({ code, a: mean(g.A), b: mean(g.B), nA: g.A.length, nB: g.B.length, f: feat(code), turn: D.stocks[code].turn[D.stocks[code].idx.get(D.stocks[code].bars.filter(b => b.date < SPLIT_DATE).pop()?.date)] || 0 })
}
const corr = (x, y) => { const mx = mean(x); const my = mean(y); let s = 0; let sx = 0; let sy = 0; for (let i = 0; i < x.length; i++) { s += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2 } return s / Math.sqrt(sx * sy) }
console.log(`前半・後半とも候補が15回以上ある銘柄: ${rows.length}`)
console.log(`前半の平均Rと後半の平均Rの相関: ${corr(rows.map(r => r.a), rows.map(r => r.b)).toFixed(3)}`)
rows.sort((x, y) => y.a - x.a)
const q = Math.floor(rows.length / 5)
for (let k = 0; k < 5; k++) {
  const z = rows.slice(k * q, k === 4 ? rows.length : (k + 1) * q)
  console.log(`前半の成績 上から${k + 1}番目の5分の1（${z.length}銘柄）：前半 ${fmt(mean(z.map(r => r.a)), 3)}R → 後半 ${fmt(mean(z.map(r => r.b)), 3)}R`)
}
const withF = rows.filter(r => r.f)
const by = (name, key) => {
  const z = withF.slice().sort((x, y) => key(x) - key(y))
  const h = Math.floor(z.length / 3)
  const parts = [z.slice(0, h), z.slice(h, 2 * h), z.slice(2 * h)]
  console.log(`${name}：` + parts.map((p, i) => `${['低', '中', '高'][i]}（${fmt(mean(p.map(key)), 2)}）前半${fmt(mean(p.map(r => r.a)), 3)}R・後半${fmt(mean(p.map(r => r.b)), 3)}R`).join(' ／ '))
}
console.log('\n銘柄の性質（前半の日足で測った値）で3つに分けたときの、候補の成績')
by('1日の値動きの荒さ（%）', r => r.f.atrPct)
by('株価（円）', r => r.f.price)
by('トレンドの出やすさ（0〜1）', r => r.f.eff)
by('売買代金（億円）', r => r.turn / 1e8)
