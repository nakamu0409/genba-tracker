// スイングを持っている間に悪い開示が出たら、翌日の寄りで売ると良いか（2026-11-24 本人と試す。Mira の「何が起きたら考えを変えるか」から。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=9000 kabu-lens/research/swing/study_swing_newsexit.mjs
// スイングの候補（今の決まり：翌日の寄りで買う（終値+2%以内）、損切り＝終値 − 2×ATR、目標 3R、最長40営業日）を10年分。開示は irevents.json＋irevents2.json
// 売る条件（持っている間に出た開示。出た日の次の営業日の寄りで売る）：
//   DIL：株が増える資金調達（新株式発行・第三者割当・新株予約権・株式の売出し・公募）
//   REV：業績予想の修正（向きは問わない）
//   REVDOWN：業績予想の修正・決算のあと、翌日の寄りが前の日の終値から −3% 以下（下方修正・悪い決算とみる）→ その寄りで売る
//   KESSAN：決算短信（中身は問わない）→ 翌日の寄りで売る（比べる相手：決算をまたがない）
// 比べる：当たった取引だけの平均R（そのまま持つ／売る）と、全部の取引の平均R。期間：前半／後半／直近
// 結果（2026-11-24）：どれも採らない（損切りに任せて持つほうが良いか同じ）。全部の取引 +0.05／+0.11／+0.26R。
//   DIL（株が増える資金調達）当たった取引 そのまま +0.34／+0.71／+1.56R → 売る +0.39／+0.66／+0.93R（向きがそろわない）
//   REV（業績予想の修正）そのまま +1.09／+1.66／+1.80R → 売る +0.89／+1.31／+1.38R（3つとも売ると悪い。修正は上方が多い）
//   REVDOWN（修正・決算のあと寄りが −3%以下）そのまま −0.97／−1.06／−0.31R → 売る −0.84／−1.10／−0.52R（向きがそろわない）
//   決算短信は irevents に少ない（8件）。決算をまたぐほうが良いことは 11/21 の検証で確かめ済み
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'
const BB = '2025-11-14'
const per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const ir = { ...R('../irevents2.json'), ...R('../irevents.json') }
const D = loadAll()
const { stocks } = D
const RULES = {
  DIL: t => /新株式発行|第三者割当|新株予約権|株式の売出し|公募/.test(t) && !/行使状況|大量行使|消却|取得|結果/.test(t),
  REV: t => /業績予想/.test(t) && /修正/.test(t),
  REVDOWN: t => (/業績予想/.test(t) && /修正/.test(t)) || /決算短信/.test(t),
  KESSAN: t => /決算短信/.test(t)
}
const G = {}
for (const k of Object.keys(RULES)) G[k] = { hold: [[], [], []], sell: [[], [], []], allAlt: [[], [], []] }
const all = [[], [], []]
for (const s of D.swing) {
  const st = stocks[s.code]
  const B = st.bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const p = per(s.date)
  all[p].push(t.r)
  const risk = t.entry - s.stop
  const list = (ir[s.code] || [])
  for (const [k, f] of Object.entries(RULES)) {
    let alt = t.r
    let hit = false
    for (const r of list) {
      if (!f(r.title)) continue
      // 開示の日（15時以降なら次の営業日に反応）。買った日の寄りより後で、普通の決着より前のもの
      let di = st.idx.get(r.date)
      if (di === undefined) continue
      if (di < t.e || (di === t.e && r.time < '09:00')) continue
      const ni = di + 1
      if (ni > t.x || ni >= B.length) continue
      if (k === 'REVDOWN' && !(B[ni].o / B[di].c - 1 <= -0.03)) continue
      alt = (B[ni].o * (1 - SLIP) - t.entry) / risk
      hit = true
      break
    }
    if (hit) { G[k].hold[p].push(t.r); G[k].sell[p].push(alt) }
    G[k].allAlt[p].push(alt)
  }
}
const f3 = a => a.map(x => `${fmt(mean(x), 2)}R(${x.length})`).join('  ／  ')
console.log(`全部の取引（そのまま）：${f3(all)}`)
for (const [k, g] of Object.entries(G)) {
  console.log(`\n■ ${k}`)
  console.log(`  当たった取引・そのまま持つ：${f3(g.hold)}`)
  console.log(`  当たった取引・翌日の寄りで売る：${f3(g.sell)}`)
  console.log(`  全部の取引（この条件で売る）：${f3(g.allAlt)}`)
}
