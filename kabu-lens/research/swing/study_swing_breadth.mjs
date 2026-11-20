// スイング：相場全体の様子で成績が変わるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_breadth.mjs
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）。平均R を選ぶ／確かめる／最後の確認で
// 分け方（境目は選ぶ期間の値で5つに分ける）：
//   ① その日に全体で出た候補の数（候補が多い日＝一斉に上げた日）
//   ② TOPIX の20日の騰落
//   ③ TOPIX と200日線の距離
//   ④ 全銘柄のうち25日線より上にある割合（騰落の広がり）
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
// ④ 25日線より上の割合（日付ごと）
const above = new Map()
const total = new Map()
for (const st of Object.values(stocks)) {
  const B = st.bars
  let s = 0
  for (let i = 0; i < B.length; i++) {
    s += B[i].c
    if (i >= 25) s -= B[i - 25].c
    if (i < 24) continue
    const d = B[i].date
    total.set(d, (total.get(d) || 0) + 1)
    if (B[i].c > s / 25) above.set(d, (above.get(d) || 0) + 1)
  }
}
const nPer = new Map()
for (const s of D.swing) nPer.set(s.date, (nPer.get(s.date) || 0) + 1)
const rows = []
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const k = bi.get(s.date)
  if (k === undefined || k < 200) continue
  let m200 = 0
  for (let j = k - 199; j <= k; j++) m200 += bench[j].c
  m200 /= 200
  rows.push({
    date: s.date, r: t.r,
    f: {
      n: Math.log10(nPer.get(s.date)),
      t20: (bench[k].c / bench[k - 20].c - 1) * 100,
      d200: (bench[k].c / m200 - 1) * 100,
      br: total.get(s.date) >= 100 ? above.get(s.date) / total.get(s.date) * 100 : null
    }
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const NAMES = { n: 'その日に全体で出た候補の数（log10）', t20: 'TOPIX の20日の騰落%', d200: 'TOPIX と200日線の距離%', br: '25日線より上の銘柄の割合%' }
console.log(`候補 ${rows.length}件。平均R（選ぶ／確かめる／最後の確認）`)
for (const key of Object.keys(NAMES)) {
  const z = rows.filter(r => Number.isFinite(r.f[key]))
  const train = z.filter(r => per(r) === 0).map(r => r.f[key]).sort((a, b) => a - b)
  const cut = [0.2, 0.4, 0.6, 0.8].map(q => train[Math.floor(train.length * q)])
  const bucket = v => cut.filter(c => v > c).length
  console.log(`\n■ ${NAMES[key]}（境目 ${cut.map(c => c.toFixed(2)).join(' / ')}）`)
  for (let b = 0; b < 5; b++) {
    const g = [0, 1, 2].map(p => z.filter(r => bucket(r.f[key]) === b && per(r) === p).map(r => r.r))
    console.log(`  ${['いちばん低い', '低い', '真ん中', '高い', 'いちばん高い'][b].padEnd(7)} ${g.map(a => `${fmt(mean(a), 3)}(${a.length})`).join('  ')}`)
  }
}
