// スイング：同じ株に続けて候補が出たとき、最初の日と2回目以降で違うか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_repeat.mjs
// 「続けて」＝同じ銘柄の前の候補が10営業日以内。今の決まり（3R・40日・終値+2%以内・避ける形は外した候補）の平均R
// 分け方：その日が何回目か（1回目／2回目／3〜5回目／6回目以上）、前の候補からの日数（1日／2〜5日／6〜10日）、
//   前の候補を買っていたら今も持っているはずか（前の候補のトレードがまだ終わっていない）
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll()
const { stocks } = D
const byCode = {}
for (const s of D.swing) (byCode[s.code] ||= []).push(s)
const rows = []
for (const list of Object.values(byCode)) {
  list.sort((a, b) => a.i - b.i)
  let streak = 0
  let prev = null
  let prevExit = -1
  for (const s of list) {
    const B = stocks[s.code].bars
    const gapDays = prev ? s.i - prev.i : Infinity
    streak = gapDays <= 10 ? streak + 1 : 1
    const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
    if (t) rows.push({ date: s.date, r: t.r, streak, gapDays, holding: prev !== null && prevExit >= s.i + 1 })
    if (t) prevExit = t.x
    prev = s
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(20)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.r); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
console.log('平均R（選ぶ／確かめる／最後の確認）')
line('全部', rows)
console.log('■ 何回目の候補か（10営業日以内に続いたもの）')
line('1回目', rows.filter(r => r.streak === 1))
line('2回目', rows.filter(r => r.streak === 2))
line('3〜5回目', rows.filter(r => r.streak >= 3 && r.streak <= 5))
line('6回目以上', rows.filter(r => r.streak >= 6))
console.log('■ 前の候補からの日数')
line('1日（毎日続く）', rows.filter(r => r.gapDays === 1))
line('2〜5日', rows.filter(r => r.gapDays >= 2 && r.gapDays <= 5))
line('6〜10日', rows.filter(r => r.gapDays >= 6 && r.gapDays <= 10))
line('11日以上・初めて', rows.filter(r => r.gapDays > 10))
console.log('■ 前の候補を買っていたら、まだ持っている日か')
line('まだ持っている', rows.filter(r => r.holding))
line('持っていない', rows.filter(r => !r.holding))
