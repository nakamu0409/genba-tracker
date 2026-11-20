// スイングの候補の質：合図の日の特徴ごとに5つに分け、どの特徴が3つの期間とも成績（平均R）を分けるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_features.mjs
// 今の決まり（翌日の寄りで買う・終値+2%以内・損切り 2×ATR・目標 3R・40日）。避ける形は外した候補（本番と同じ）
// 特徴：買いスコア、25日線からの距離、TOPIX と比べた20日の強さ、売買代金、ATR%（値動きの大きさ）、52週高値からの距離、出来高（20日平均比）、5日の騰落
// 分け方：同じ特徴の値で全部の候補を5つに分ける（境目は選ぶ期間の値で決める＝あとの期間の答えを使わない）
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const s of D.swing) {
  const st = stocks[s.code]
  const B = st.bars
  const i = s.i
  if (i < 260) continue
  const t = simulate(B, i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  let m25 = 0
  for (let k = i - 24; k <= i; k++) m25 += B[k].c
  m25 /= 25
  let atr = 0
  for (let k = i - 13; k <= i; k++) atr += Math.max(B[k].h, B[k - 1].c) - Math.min(B[k].l, B[k - 1].c)
  atr /= 14
  let hi = 0
  for (let k = i - 249; k <= i; k++) hi = Math.max(hi, B[k].h)
  let v20 = 0
  for (let k = i - 20; k < i; k++) v20 += B[k].v
  v20 /= 20
  const k0 = bi.get(B[i - 20].date)
  const k1 = bi.get(B[i].date)
  const rs = k0 !== undefined && k1 !== undefined ? (B[i].c / B[i - 20].c - bench[k1].c / bench[k0].c) * 100 : null
  rows.push({
    date: s.date, r: t.r, kind: s.kind,
    f: {
      score: s.score ?? null,
      dev25: (B[i].c / m25 - 1) * 100,
      rs,
      turn: Math.log10(st.turn[i]),
      atrp: atr / B[i].c * 100,
      fromHi: (B[i].c / hi - 1) * 100,
      vol: v20 > 0 ? B[i].v / v20 : null,
      r5: (B[i].c / B[i - 5].c - 1) * 100,
      price: Math.log10(B[i].c)
    }
  })
}
console.log(`候補 ${rows.length}件（決着したもの）。数字は平均R（選ぶ／確かめる／最後の確認）\n`)
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const NAMES = { score: '買いスコア', dev25: '25日線からの距離%', rs: 'TOPIX と比べた20日の強さ（pt）', turn: '売買代金（log10）', atrp: 'ATR%（値動きの大きさ）', fromHi: '52週高値からの距離%', vol: '出来高（20日平均の何倍）', r5: '5日の騰落%', price: '株価（log10）' }
const consistent = []
for (const key of Object.keys(NAMES)) {
  const z = rows.filter(r => Number.isFinite(r.f[key]))
  const train = z.filter(r => per(r) === 0).map(r => r.f[key]).sort((a, b) => a - b)
  const cut = [0.2, 0.4, 0.6, 0.8].map(q => train[Math.floor(train.length * q)])
  const bucket = v => cut.filter(c => v > c).length
  console.log(`■ ${NAMES[key]}（境目 ${cut.map(c => c.toFixed(2)).join(' / ')}）`)
  const grid = [0, 1, 2, 3, 4].map(b => [0, 1, 2].map(p => mean(z.filter(r => bucket(r.f[key]) === b && per(r) === p).map(r => r.r))))
  grid.forEach((g, b) => {
    const n = z.filter(r => bucket(r.f[key]) === b).length
    console.log(`  ${['いちばん低い', '低い', '真ん中', '高い', 'いちばん高い'][b].padEnd(7)} ${String(n).padStart(6)}件  ${g.map(v => fmt(v, 3)).join('  ')}`)
  })
  // 一番低い5分の1と一番高い5分の1の差が、3つの期間とも同じ向きか
  const d = [0, 1, 2].map(p => grid[4][p] - grid[0][p])
  if (d.every(x => x > 0.03) || d.every(x => x < -0.03)) consistent.push(`${NAMES[key]}：高いほうが ${d.every(x => x > 0) ? '良い' : '悪い'}（差 ${d.map(x => fmt(x, 3)).join('／')}）`)
}
console.log('\n■ 形の種類')
for (const k of ['GAP', 'PULLBACK', 'BREAKOUT', 'MOMENTUM', 'STATE']) {
  const z = rows.filter(r => r.kind === k)
  if (!z.length) continue
  console.log(`  ${k.padEnd(9)} ${String(z.length).padStart(6)}件  ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.r)), 3)).join('  ')}`)
}
console.log('\n■ 3つの期間とも同じ向きに分けた特徴（いちばん高い5分の1 − いちばん低い5分の1 の差が ±0.03R を超える）')
consistent.forEach(x => console.log('  ' + x))
