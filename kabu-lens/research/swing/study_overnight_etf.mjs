// 毎日、引けで TOPIX 連動ETF を買って翌朝の寄りで売る（夜だけ持つ）と、ずっと持つのを比べる（10年。2026-11-21）
// 使い方: node kabu-lens/research/swing/study_overnight_etf.mjs
// 1往復の負担（売値と買値の差など）：0%・0.02%・0.05%・0.1%。年ごとの合計%と、10年の年率・一番下げたとき
import { loadAll, fmt } from './lib_signals.mjs'

const { bench } = loadAll({ withSwing: false })
const run = (cost, mode) => {
  let eq = 1, peak = 1, mdd = 0
  const yr = {}
  for (let i = 1; i < bench.length; i++) {
    let r
    if (mode === 'hold') r = bench[i].c / bench[i - 1].c
    else if (mode === 'night') r = (bench[i].o / bench[i - 1].c) * (1 - cost / 100)
    else r = (bench[i].c / bench[i].o) * (1 - cost / 100)
    eq *= r
    const y = bench[i].date.slice(0, 4)
    yr[y] = (yr[y] || 1) * r
    peak = Math.max(peak, eq)
    mdd = Math.min(mdd, eq / peak - 1)
  }
  const years = (new Date(bench.at(-1).date) - new Date(bench[0].date)) / 365.25 / 864e5
  return { cagr: (eq ** (1 / years) - 1) * 100, mdd: mdd * 100, yr }
}
const H = run(0, 'hold')
console.log(`ずっと持つ：年率 ${fmt(H.cagr, 1)}%・一番下げ ${fmt(H.mdd, 1)}%`)
for (const c of [0, 0.02, 0.05, 0.1]) {
  const N = run(c, 'night')
  console.log(`夜だけ持つ（1往復 ${c}%）：年率 ${fmt(N.cagr, 1)}%・一番下げ ${fmt(N.mdd, 1)}%  年ごと ${Object.entries(N.yr).map(([y, v]) => y.slice(2) + ':' + fmt((v - 1) * 100, 0)).join(' ')}`)
}
const Dd = run(0, 'day')
console.log(`昼だけ持つ（0%）：年率 ${fmt(Dd.cagr, 1)}%・一番下げ ${fmt(Dd.mdd, 1)}%`)
