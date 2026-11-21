// 急落の反発の「実際の値上がり」と「TOPIX」を並べる（口座全体で動かすと損になった理由を見るため）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_crash_abs.mjs
import { loadAll, mean } from './lib_signals.mjs'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const A = '2021-11-19', BB = '2025-11-14'
const rows = []
for (const st of Object.values(stocks)) {
  const B = st.bars; let last = -99
  for (let i = 260; i < B.length - 6; i++) {
    if (st.turn[i] < 1e8) continue
    if (B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300) {
      if (i - last > 10 && B[i + 1].h !== B[i + 1].l) {
        const e = i + 1, k0 = bi.get(B[e].date), k1 = bi.get(B[e + 4].date)
        const abs = (B[e + 4].c * 0.999 / (B[e].o * 1.001) - 1) * 100
        const tpx = k0 !== undefined && k1 !== undefined ? (bench[k1].c / bench[k0].o - 1) * 100 : null
        const k = bi.get(B[i].date); const m5 = k >= 5 ? (bench[k].c / bench[k - 5].c - 1) * 100 : null
        rows.push({ date: B[i].date, abs, tpx, m5 })
      }
      last = i
    }
  }
}
const f = v => (v >= 0 ? '+' : '') + v.toFixed(2)
for (const [n, p] of [['全部', () => true], ['相場全体の急落（TOPIX 5日 −4%以下）', r => r.m5 !== null && r.m5 <= -4], ['ふつう', r => r.m5 !== null && r.m5 > -4]]) {
  const z = rows.filter(p)
  const per = (a, b) => z.filter(r => r.date >= a && r.date < b)
  const s = q => `実際 ${f(mean(q.map(r => r.abs)))}%・TOPIX ${f(mean(q.filter(r => r.tpx !== null).map(r => r.tpx)))}%（${q.length}件）`
  console.log(n, '｜ 前半', s(per('0', A)), '｜ 後半', s(per(A, BB)), '｜ 最後', s(per(BB, '9')))
}
