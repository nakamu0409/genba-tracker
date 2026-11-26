// スイング：合図の日のローソク足の形で成績が分かれるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_candle.mjs
// 今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）の平均R（選ぶ／確かめる／最後の確認）
// 分け方（先に決めた）：
//   ① 引けの位置（その日の値幅のどこで引けたか。0＝安値・1＝高値）：0〜0.3／0.3〜0.7／0.7〜1
//   ② 上ヒゲ（高値 − 実体の上）÷ 値幅：0.5以上（長い上ヒゲ）／それ以外
//   ③ 陽線（引け＞寄り）／陰線
//   ④ その日の値幅 ÷ ATR：0.7未満（小さい）／0.7〜1.5／1.5以上（大きい）
//   ⑤ その日の騰落：−2%未満／−2〜0／0〜+2／+2〜+5／+5%以上
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks } = D
const rows = []
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const i = s.i
  if (i < 15) continue
  const t = simulate(B, i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const b = B[i]
  const rng = b.h - b.l
  let atr = 0
  for (let k = i - 13; k <= i; k++) atr += Math.max(B[k].h, B[k - 1].c) - Math.min(B[k].l, B[k - 1].c)
  atr /= 14
  rows.push({
    date: s.date, r: t.r,
    pos: rng > 0 ? (b.c - b.l) / rng : 0.5,
    wick: rng > 0 ? (b.h - Math.max(b.o, b.c)) / rng : 0,
    up: b.c > b.o,
    rr: atr > 0 ? rng / atr : 1,
    d1: (b.c / B[i - 1].c - 1) * 100
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
line('全部', rows)
console.log('■ ① 引けの位置')
line('安値寄り 0〜0.3', rows.filter(r => r.pos < 0.3))
line('真ん中 0.3〜0.7', rows.filter(r => r.pos >= 0.3 && r.pos < 0.7))
line('高値寄り 0.7〜1', rows.filter(r => r.pos >= 0.7))
console.log('■ ② 上ヒゲ')
line('長い（0.5以上）', rows.filter(r => r.wick >= 0.5))
line('それ以外', rows.filter(r => r.wick < 0.5))
console.log('■ ③ 陽線・陰線')
line('陽線', rows.filter(r => r.up))
line('陰線・同じ', rows.filter(r => !r.up))
console.log('■ ④ 値幅 ÷ ATR')
line('0.7未満', rows.filter(r => r.rr < 0.7))
line('0.7〜1.5', rows.filter(r => r.rr >= 0.7 && r.rr < 1.5))
line('1.5以上', rows.filter(r => r.rr >= 1.5))
console.log('■ ⑤ その日の騰落')
for (const [n, a, b] of [['−2%未満', -1e9, -2], ['−2〜0%', -2, 0], ['0〜+2%', 0, 2], ['+2〜+5%', 2, 5], ['+5%以上', 5, 1e9]]) line(n, rows.filter(r => r.d1 >= a && r.d1 < b))
