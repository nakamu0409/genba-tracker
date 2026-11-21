// 企業の行動の翌朝、寄りで本当に買えるか：注文の大きさ ÷ 最初の1時間（9:00〜10:00）の売買代金（60分足・約2年。2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_liquidity.mjs
// 注文の大きさ：50万円・150万円・210万円（100万円の50%・300万円の50%・300万円の70%）
// 目安：最初の1時間の売買代金の1%以下なら、値段をほぼ動かさずに買える。5%を超えると不利になりやすい
import { readFileSync } from 'node:fs'
import { loadAll, fmt } from './lib_signals.mjs'

const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks } = D
const vals = []
for (const e of D.events) {
  if (e.kind === 'buyback' && !(e.score >= 1)) continue
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k >= B.length) continue
  const H = hour[e.code]?.[B[k].date]
  if (!Array.isArray(H) || !H.length || H[0][0] !== 540) continue
  if (H[0][1] > e.limit) continue
  const t = H[0][5] * (H[0][1] + H[0][4]) / 2
  if (t > 0) vals.push(t)
}
vals.sort((a, b) => a - b)
const q = p => vals[Math.floor(vals.length * p)]
console.log(`${vals.length}件。最初の1時間の売買代金：下から10% ${(q(0.1) / 1e6).toFixed(0)}百万円・真ん中 ${(q(0.5) / 1e6).toFixed(0)}百万円・上から10% ${(q(0.9) / 1e6).toFixed(0)}百万円`)
for (const yen of [5e5, 1.5e6, 2.1e6]) {
  const share = vals.map(v => yen / v * 100)
  console.log(`  注文 ${(yen / 1e4).toFixed(0)}万円：1%以下 ${(share.filter(x => x <= 1).length / vals.length * 100).toFixed(0)}%・1〜5% ${(share.filter(x => x > 1 && x <= 5).length / vals.length * 100).toFixed(0)}%・5%超 ${(share.filter(x => x > 5).length / vals.length * 100).toFixed(0)}%`)
}
