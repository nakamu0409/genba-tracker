// スイング：相場全体が大きく下げた日に、持っている株を売るか持ち続けるか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_mktexit.mjs
// 今の決まりのスイング（3R・40日・終値+2%以内・避ける形は外した候補）。持っている間（買った日の次の日〜売る前の日）に下の合図が出たら：
//   売る＝合図の次の日の寄りで売る／持つ＝今の決まりのまま
// 合図：① TOPIX が1日で −3%以下 ② −2%以下 ③ TOPIX が5日で −5%以下 ④ ①のうち、その株も含み損のとき ⑤ ①のうち、その株が含み益のとき
// 比べるのは「合図が出たトレードだけ」の平均R（持つ − 売る の差）。選ぶ／確かめる／最後の確認
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const SLIP = 0.001
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const r1 = d => { const k = bi.get(d); return k > 0 ? (bench[k].c / bench[k - 1].c - 1) * 100 : null }
const r5 = d => { const k = bi.get(d); return k >= 5 ? (bench[k].c / bench[k - 5].c - 1) * 100 : null }
const SIG = {
  '① TOPIX 1日 −3%以下': (d) => r1(d) !== null && r1(d) <= -3,
  '② TOPIX 1日 −2%以下': (d) => r1(d) !== null && r1(d) <= -2,
  '③ TOPIX 5日 −5%以下': (d) => r5(d) !== null && r5(d) <= -5
}
const res = {}
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const risk = t.entry - s.stop
  for (const [n, f] of Object.entries(SIG)) {
    for (let k = t.e; k < t.x; k++) {
      if (!f(B[k].date)) continue
      const sell = B[k + 1].o * (1 - SLIP)
      const row = { date: s.date, hold: t.r, sell: (sell - t.entry) / risk }
      ;(res[n] ||= []).push(row)
      if (n.startsWith('①')) (res[B[k].c < t.entry ? '④ ①で、その株が含み損' : '⑤ ①で、その株が含み益'] ||= []).push(row)
      break
    }
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
console.log('合図が出たトレードの平均R：持つ／売る（差）。選ぶ・確かめる・最後の確認')
for (const n of Object.keys(SIG).concat(['④ ①で、その株が含み損', '⑤ ①で、その株が含み益'])) {
  const z = res[n] || []
  const cells = [0, 1, 2].map(p => {
    const q = z.filter(r => per(r) === p)
    const h = mean(q.map(r => r.hold))
    const sl = mean(q.map(r => r.sell))
    return `${fmt(h, 2)}／${fmt(sl, 2)}（${fmt(h - sl, 2)}・${q.length}件）`
  })
  console.log(`  ${n.padEnd(22)} ${cells.join('   ')}`)
}
