// 地合い（TOPIX 連動ETF の位置・向き）で分けると、今の決まりの成績は変わるか
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_regime.mjs
// ・地合いは「合図の日の引け」で分かるものだけを使う（翌日の寄りで買う前に分かる）
// ・スイング：候補（通過）を翌日の寄りで（終値+2%以内）、目標3R・40日。急騰の押し目：3R・10日。
//   自社株買い・増配：寄指（終値×1.02以下）で寄りに買い、その日の引けで売る（%）。株式分割：寄りで買い、5営業日目の引け（%）
// ・前半／後半（2021-11-19 で分ける）の両方で同じ向きなら、たまたまではない見込みが少し高い
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'

const t0 = Date.now()
const D = loadAll()
const { stocks, regime, bench } = D
const bIdx = new Map(bench.map((b, i) => [b.date, i]))
const benchOC = d => {
  const i = bIdx.get(d)
  return i === undefined ? 0 : (bench[i].c / bench[i].o - 1) * 100
}
console.log(`読み込みと合図づくり ${((Date.now() - t0) / 1000).toFixed(0)}秒：スイング ${D.swing.length}・企業の行動 ${D.events.length}・急騰の押し目 ${D.surge.length}`)

const res = { swing: [], surge: [], buyback: [], divup: [], split: [] }
for (const s of D.swing) {
  const st = stocks[s.code]
  const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (t) res.swing.push({ date: s.date, v: t.r, rg: regime.get(s.date) })
}
for (const s of D.surge) {
  const st = stocks[s.code]
  const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 10 })
  if (t) res.surge.push({ date: s.date, v: t.r, rg: regime.get(s.date) })
}
for (const ev of D.events) {
  const B = stocks[ev.code].bars
  const e = ev.i + 1
  if (e >= B.length || B[e].h === B[e].l || B[e].o > ev.limit) continue
  if (ev.kind === 'buyback' && ev.score === 0) continue // 今の決まりでは見送り
  if (ev.kind === 'split') {
    if (e + 4 >= B.length) continue
    res.split.push({ date: ev.date, v: (B[e + 4].c * (1 - SLIP) / B[e].o - 1) * 100, rg: regime.get(ev.date) })
  } else {
    res[ev.kind].push({ date: ev.date, v: (B[e].c / B[e].o - 1) * 100 - benchOC(B[e].date), rg: regime.get(ev.date) })
  }
}

const CUTS = [
  ['全部', () => true],
  ['TOPIX が25日線の上', g => g?.above25 === true],
  ['TOPIX が25日線の下', g => g?.above25 === false],
  ['TOPIX が75日線の上', g => g?.above75 === true],
  ['TOPIX が75日線の下', g => g?.above75 === false],
  ['25日線が上向き', g => g?.slope25Up === true],
  ['25日線が下向き', g => g?.slope25Up === false],
  ['TOPIX 5日で−3%以下（急落直後）', g => g?.ret5 !== null && g?.ret5 <= -3],
  ['TOPIX 5日で+3%以上（急騰直後）', g => g?.ret5 !== null && g?.ret5 >= 3],
  ['25日線の下 かつ 下向き', g => g?.above25 === false && g?.slope25Up === false]
]
const UNIT = { swing: 'R', surge: 'R', buyback: '%（全体比）', divup: '%（全体比）', split: '%（5日）' }
const NAME = { swing: 'スイングの候補（3R・40日）', surge: '急騰の押し目（3R・10日）', buyback: '自社株買い（良い条件1つ以上）の翌日', divup: '増配の翌日', split: '株式分割（5日）' }
for (const [k, xs] of Object.entries(res)) {
  console.log(`\n■ ${NAME[k]}  単位: ${UNIT[k]}`)
  for (const [name, fn] of CUTS) {
    const z = xs.filter(x => fn(x.rg))
    if (z.length < 20) {
      console.log(`  ${name.padEnd(30)} ${String(z.length).padStart(6)}件（少ない）`)
      continue
    }
    const A = z.filter(x => x.date < SPLIT_DATE)
    const B = z.filter(x => x.date >= SPLIT_DATE)
    console.log(`  ${name.padEnd(30)} ${String(z.length).padStart(6)}件 平均${fmt(mean(z.map(x => x.v)), 3).padStart(7)} 勝率${(z.filter(x => x.v > 0).length / z.length * 100).toFixed(0).padStart(3)}%  前半${fmt(mean(A.map(x => x.v)), 3).padStart(7)}（${A.length}）後半${fmt(mean(B.map(x => x.v)), 3).padStart(7)}（${B.length}）`)
  }
}
