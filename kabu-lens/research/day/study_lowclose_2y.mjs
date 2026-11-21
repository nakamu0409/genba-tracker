// 低位株・荒い株の「強い引け」を60分足（約2年）で確かめ直す（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_lowclose_2y.mjs
// 対象：前の日の終値500円未満か、ATR%（14日）が4%以上。売買代金1億円以上（20日平均）
// 合図：15:00 の時点（14:00の足の終値）で前の日の終値から +20%以上、その足が張り付きでない（高値＞安値）、15:00 の足の始値で買える
// 今の売り方：翌日、+5%で利確・−8%で損切り（足の高値・安値で判定。両方なら損切りを先に）、どちらも無ければ13:00の足の始値で売る
// 比べる：翌日の寄りで売る／翌日の引けで売る／+10%利確・−8%損切り・引け。手数料 0.2% を引く。前半（〜2025-05）・後半
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
    const i = st.idx.get(d)
    if (i === undefined || i < 15 || i + 1 >= B.length) continue
    const pc = B[i - 1].c
    let atr = 0
    for (let k = i - 14; k < i; k++) atr += Math.max(B[k].h, B[k - 1].c) - Math.min(B[k].l, B[k - 1].c)
    atr /= 14
    if (!(pc < 500 || atr / pc >= 0.04) || st.turn[i - 1] < 1e8) continue
    if (!Array.isArray(H)) continue
    const b14 = H.find(b => b[0] === 840)
    const b15 = H.find(b => b[0] === 900)
    if (!b14 || !b15 || b14[2] === b14[3]) continue
    if (b14[4] / pc - 1 < 0.2) continue
    const entry = b15[1] * 1.001
    const N = days[B[i + 1].date]
    if (!N || N.length < 4) continue
    const ret = p => (p / entry - 1) * 100 - 0.2
    const tpsl = (tp, sl, exitM) => {
      const t = entry * (1 + tp / 100)
      const s = entry * (1 - sl / 100)
      for (const b of N) {
        if (exitM && b[0] >= exitM) return ret(b[1])
        if (b[0] === 540 && b[1] <= s) return ret(b[1])
        if (b[0] === 540 && b[1] >= t) return ret(b[1])
        if (b[3] <= s) return ret(s)
        if (b[2] >= t) return ret(t)
      }
      return ret(N[N.length - 1][4])
    }
    rows.push({
      date: d,
      now: tpsl(5, 8, 780),
      open: ret(N[0][1]),
      close: ret(N[N.length - 1][4]),
      w10: tpsl(10, 8, null),
      day: (b15[4] / entry - 1) * 100
    })
  }
}
const half = r => (r.date < '2025-06-01' ? 0 : 1)
console.log(`${rows.length}回（${rows.map(r => r.date).sort()[0]}〜）。平均%（前半／後半）・勝ち`)
for (const [k, n] of [['now', '今：+5%／−8%／13時'], ['open', '翌日の寄りで売る'], ['close', '翌日の引けで売る'], ['w10', '+10%／−8%／引け']]) {
  const c = [0, 1].map(h => { const a = rows.filter(r => half(r) === h).map(r => r[k]); return `${fmt(mean(a))}(${a.length})` })
  console.log(`  ${n.padEnd(16)} ${c.join('  ')}  勝ち ${(rows.filter(r => r[k] > 0).length / rows.length * 100).toFixed(0)}%`)
}
