// スイングを翌日の何時に買うか（60分足・約2年。2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_entry_hour.mjs
// 今の決まり（損切り 2×ATR・目標 3R・40日・避ける形は外した候補）。買値：寄り／10:00／11:00／13:00／14:00／大引け（その足の始値・大引けは終値）
// どの時刻も「その値段が前の日の終値+2%以内・損切りより上」のときだけ買う。買った日の残りの足で損切り・目標も見る（大引けで買ったときは次の日から）
// 平均R（前半〜2025-05／後半）と、候補1件あたり（買えなければ0）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt } from './lib_signals.mjs'

const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))
const D = loadAll()
const { stocks } = D
const SLIP = 0.001
const TIMES = [['open', 540, '寄り'], ['t10', 600, '10:00'], ['t11', 660, '11:00'], ['t13', 780, '13:00'], ['t14', 840, '14:00'], ['close', 9999, '大引け']]
const res = Object.fromEntries(TIMES.map(([k]) => [k, []]))
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const e = s.i + 1
  if (e + 41 >= B.length) continue
  const H = hour[s.code]?.[B[e].date]
  if (!H || H.length < 5) continue
  const c0 = B[s.i].c
  for (const [k, m] of TIMES) {
    let px
    let rest
    if (m === 9999) { px = B[e].c; rest = [] } else {
      const j = H.findIndex(b => b[0] >= m)
      if (j < 0) { res[k].push({ date: B[e].date, r: 0, miss: true }); continue }
      px = H[j][1]
      rest = H.slice(j)
    }
    if (!(px <= c0 * 1.02 && px > s.stop)) { res[k].push({ date: B[e].date, r: 0, miss: true }); continue }
    const entry = px * (1 + SLIP)
    const risk = entry - s.stop
    const target = entry + 3 * risk
    let r = null
    for (const b of rest) {
      if (b[3] <= s.stop) { r = (s.stop * (1 - SLIP) - entry) / risk; break }
      if (b[2] >= target) { r = 3; break }
    }
    if (r === null) {
      for (let x = e + 1; x < e + 40; x++) {
        const b = B[x]
        if (b.o <= s.stop) { r = (b.o * (1 - SLIP) - entry) / risk; break }
        if (b.l <= s.stop) { r = (s.stop * (1 - SLIP) - entry) / risk; break }
        if (b.o >= target) { r = (b.o - entry) / risk; break }
        if (b.h >= target) { r = 3; break }
        if (x === e + 39) r = (b.c * (1 - SLIP) - entry) / risk
      }
    }
    if (r !== null) res[k].push({ date: B[e].date, r, miss: false })
  }
}
const half = r => (r.date < '2025-06-01' ? 0 : 1)
console.log('買えた平均R／候補1件あたり／買えた割合（前半・後半）')
for (const [k, , n] of TIMES) {
  const c = [0, 1].map(h => {
    const z = res[k].filter(r => half(r) === h)
    const got = z.filter(r => !r.miss)
    return `${fmt(mean(got.map(r => r.r)), 3)}／${fmt(z.reduce((a, r) => a + r.r, 0) / z.length, 3)}／${(got.length / z.length * 100).toFixed(0)}%（${z.length}）`
  })
  console.log(`  ${n.padEnd(6)} ${c.join('   ')}`)
}
