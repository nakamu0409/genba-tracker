// 決算の反応が大きかった株を、反応の次の日の寄りで買う（10年・IR BANK の決算日。2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_earn_react10y.mjs
// 反応の日：15:00 より前の発表はその日、15:00 以降は翌営業日。反応＝反応の日の終値 ÷ 発表前の終値 −1（TOPIX との差）
// 買う：反応の日の次の日の寄り。持つ：1・5・10・20日目の引け。TOPIX との差から往復 0.2% を引く
// 分け方：反応 +10%以上／+5〜10%／+2〜5%／−2〜+2%／−5〜−2%／−10〜−5%／−10%以下。反応の日の引けが高値に近い（上から2割以内）か
// 売買代金1億円以上・300円以上。期間：選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const COST = 0.2
const ir = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const [code, list] of Object.entries(ir)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  const B = st.bars
  const seen = new Set()
  for (const k of list) {
    if (!k?.date || !/決算短信/.test(k.title || '')) continue
    let i = st.idx.get(k.date)
    if (i === undefined) continue
    const after = (k.time || '15:00') >= '15:00'
    const r = after ? i + 1 : i
    const pre = r - 1
    const e = r + 1
    if (pre < 20 || e + 20 >= B.length || seen.has(r)) continue
    seen.add(r)
    if (st.turn[pre] < 1e8 || B[pre].c < 300 || B[e].h === B[e].l) continue
    const k0 = bi.get(B[pre].date)
    const k1 = bi.get(B[r].date)
    if (k0 === undefined || k1 === undefined) continue
    const react = (B[r].c / B[pre].c - 1) * 100 - (bench[k1].c / bench[k0].c - 1) * 100
    const rng = B[r].h - B[r].l
    const nearHi = rng > 0 && (B[r].h - B[r].c) / rng <= 0.2
    const ke = bi.get(B[e].date)
    if (ke === undefined) continue
    const hold = n => {
      const kx = bi.get(B[e + n - 1].date)
      return kx === undefined ? null : (B[e + n - 1].c / B[e].o - 1) * 100 - (bench[kx].c / bench[ke].o - 1) * 100 - COST
    }
    rows.push({ date: B[r].date, react, nearHi, h1: hold(1), h5: hold(5), h10: hold(10), h20: hold(20) })
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
console.log(`決算 ${rows.length}件。数字は TOPIX との差 − 0.2%（選ぶ／確かめる／最後の確認）`)
const line = (n, z) => {
  const c = ['h1', 'h5', 'h10', 'h20'].map(k => [0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p && r[k] !== null).map(r => r[k])))).join('/'))
  console.log(`  ${n.padEnd(18)} ${String(z.length).padStart(6)}件  1日 ${c[0]}  5日 ${c[1]}  10日 ${c[2]}  20日 ${c[3]}`)
}
line('全部', rows)
const G = [['+10%以上', x => x >= 10], ['+5〜10%', x => x >= 5 && x < 10], ['+2〜5%', x => x >= 2 && x < 5], ['−2〜+2%', x => x > -2 && x < 2], ['−5〜−2%', x => x > -5 && x <= -2], ['−10〜−5%', x => x > -10 && x <= -5], ['−10%以下', x => x <= -10]]
console.log('■ 反応の大きさ')
for (const [n, f] of G) line(n, rows.filter(r => f(r.react)))
console.log('■ 反応 +5%以上 × 引けが高値に近いか')
line('高値に近い', rows.filter(r => r.react >= 5 && r.nearHi))
line('高値から離れた', rows.filter(r => r.react >= 5 && !r.nearHi))
console.log('■ 反応 −5%以下 × 引けが安値に近いか（高値から離れた＝安値寄り）')
line('安値に近い', rows.filter(r => r.react <= -5 && !r.nearHi))
