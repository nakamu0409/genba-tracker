// Kronos の予測の答え合わせ（study_kronos.py の出力を集計する）（2026-11-21）
// 使い方: node kabu-lens/research/swing/study_kronos_report.mjs <kronos_out.json>
// 見るもの：(1) 予測と実際の順位の相関（日ごとのスピアマンの平均＝IC）、(2) 予測の上位20・下位20銘柄の実際の平均（TOPIX との差 − 往復0.2%）、
//   (3) 予測が +1%以上の株だけ買った場合
import { readFileSync } from 'node:fs'
const D = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const rank = a => { const o = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = Array(a.length); o.forEach(([, i], k) => { r[i] = k }); return r }
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2 } return n / Math.sqrt(da * db) }
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(3) : '—')
const ics = [], top = [], bot = [], all = [], strong = []
const byHalf = { 0: { top: [], bot: [], ic: [] }, 1: { top: [], bot: [], ic: [] } }
for (const [d, rows] of Object.entries(D).sort()) {
  const v = Object.values(rows)
  if (v.length < 40) continue
  const p = v.map(x => x.pred), a = v.map(x => x.act)
  const ic = corr(rank(p), rank(a))
  ics.push(ic)
  const s = v.slice().sort((x, y) => y.pred - x.pred)
  const t = mean(s.slice(0, 20).map(x => x.act)) - 0.2
  const b = mean(s.slice(-20).map(x => x.act)) - 0.2
  top.push(t); bot.push(b); all.push(mean(a) - 0.2)
  for (const x of v) if (x.pred >= 1) strong.push(x.act - 0.2)
  const h = d < '2026-04-01' ? 0 : 1
  byHalf[h].top.push(t); byHalf[h].bot.push(b); byHalf[h].ic.push(ic)
}
console.log(`日数 ${ics.length}（5営業日ごと）`)
console.log(`IC（予測と実際の順位の相関）の平均 ${f(mean(ics))}・プラスの日 ${ics.filter(x => x > 0).length}/${ics.length}`)
console.log(`予測の上位20 ${f(mean(top))}%・下位20 ${f(mean(bot))}%・全部 ${f(mean(all))}%（5日・TOPIX との差 − 0.2%）`)
console.log(`上位 − 下位 ${f(mean(top) - mean(bot))}pt・上位が下位を上回った日 ${top.filter((x, i) => x > bot[i]).length}/${top.length}`)
console.log(`予測が +1%以上の株だけ ${f(mean(strong))}%（${strong.length}件）`)
for (const h of [0, 1]) console.log(`  ${h ? '2026-04〜' : '2025-09〜2026-03'}：IC ${f(mean(byHalf[h].ic))}・上位 ${f(mean(byHalf[h].top))}・下位 ${f(mean(byHalf[h].bot))}`)
