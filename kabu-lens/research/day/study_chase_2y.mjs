// 低位株の急騰の追いかけ（chase）を60分足（約2年）でざっくり確かめる（2026-11-21）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_chase_2y.mjs
// 対象：前の日の終値500円未満かATR%4%以上・売買代金1億円以上。9:00の足の終値（10:00の値段）で前の日から +10%以上 → 10:00の足の始値で買う
// 売る：その日の引け／−5%の損切り（足の安値）＋引け／+10%利確・−5%損切り・引け。手数料0.2%。前半（〜2025-05）・後半
// 60分足では「高値から−3%で売る」は再現できないので目安
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt } from '../swing/lib_signals.mjs'

const hour = JSON.parse(readFileSync(new URL('./hour.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks } = D
const rows = []
for (const [code, days] of Object.entries(hour)) {
  const st = stocks[code]
  if (!st || !days) continue
  const B = st.bars
  for (const [d, H] of Object.entries(days)) {
    if (!Array.isArray(H) || H.length < 5) continue
    const i = st.idx.get(d)
    if (i === undefined || i < 15) continue
    const pc = B[i - 1].c
    let atr = 0
    for (let k = i - 14; k < i; k++) atr += Math.max(B[k].h, B[k - 1].c) - Math.min(B[k].l, B[k - 1].c)
    atr /= 14
    if (!(pc < 500 || atr / pc >= 0.04) || st.turn[i - 1] < 1e8) continue
    if (H[0][0] !== 540 || H[0][4] / pc - 1 < 0.1) continue
    const j = H.findIndex(b => b[0] >= 600)
    if (j < 0 || H[j][2] === H[j][3]) continue
    const entry = H[j][1] * 1.001
    const rest = H.slice(j)
    const ret = p => (p / entry - 1) * 100 - 0.2
    const ex = (tp, sl) => {
      for (const b of rest) {
        if (sl && b[3] <= entry * (1 - sl / 100)) return ret(entry * (1 - sl / 100))
        if (tp && b[2] >= entry * (1 + tp / 100)) return ret(entry * (1 + tp / 100))
      }
      return ret(rest[rest.length - 1][4])
    }
    rows.push({ date: d, cl: ex(0, 0), s5: ex(0, 5), t10: ex(10, 5) })
  }
}
const half = r => (r.date < '2025-06-01' ? 0 : 1)
console.log(`${rows.length}回。平均%（前半／後半）・勝ち`)
for (const [k, n] of [['cl', 'その日の引け'], ['s5', '−5%損切り・引け'], ['t10', '+10%利確・−5%損切り・引け']]) {
  const c = [0, 1].map(h => { const a = rows.filter(r => half(r) === h).map(r => r[k]); return `${fmt(mean(a))}(${a.length})` })
  console.log(`  ${n.padEnd(18)} ${c.join('  ')}  勝ち ${(rows.filter(r => r[k] > 0).length / rows.length * 100).toFixed(0)}%`)
}
