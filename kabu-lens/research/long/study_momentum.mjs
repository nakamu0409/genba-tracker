// 「業績の勢い」は、少し長い期間（20日・60日）の値上がりにつながるか
// 使い方: node kabu-lens/research/long/study_momentum.mjs
//   先に fetch_fin.mjs で fin.json（株探の四半期業績と発表日）、research/day/fetch_60m.mjs で hour.json（1時間足 2024-02〜）を作る
// ・四半期ごとの発表日の「その時点で分かっていた数字」だけを使う（earningsMomentum に upTo を渡す）
// ・買うのは発表日の翌営業日の始値（発表は引け後が多い。場中の発表でも翌日にそろえる）
// ・20営業日後・60営業日後の終値で比べ、同じ日に買った全銘柄の平均との差（全体比）を見る
// ・銘柄は今の売買の多い約1,150銘柄（生き残りの偏りがある）
import { readFileSync } from 'node:fs'
import { earningsMomentum } from '../../../.claude/scripts/kabu-lens.mjs'

const fin = JSON.parse(readFileSync(new URL('./fin.json', import.meta.url), 'utf-8'))
const hour = JSON.parse(readFileSync(new URL('../day/hour.json', import.meta.url), 'utf-8'))

// 1時間足から日足（始値・終値）を作る
const daily = {}
for (const [code, days] of Object.entries(hour)) {
  if (!days) continue
  const dates = Object.keys(days).sort()
  daily[code] = { dates, o: dates.map(d => days[d][0][1]), c: dates.map(d => days[d][days[d].length - 1][4]), v: dates.map(d => days[d].reduce((s, b) => s + b[5], 0)) }
}
const H = [20, 60]
// 同じ日に買った全銘柄の平均（地合いの分）
const base = new Map()
for (const d of Object.values(daily)) {
  for (let i = 0; i < d.dates.length; i++) {
    const b = base.get(d.dates[i]) || { n20: 0, s20: 0, n60: 0, s60: 0 }
    for (const h of H) {
      if (i + h - 1 < d.dates.length) {
        b['n' + h]++
        b['s' + h] += (d.c[i + h - 1] / d.o[i] - 1) * 100
      }
    }
    base.set(d.dates[i], b)
  }
}

const ev = []
for (const [code, f] of Object.entries(fin)) {
  const d = daily[code]
  if (!f?.quarterly?.length || !d) continue
  for (const q of f.quarterly) {
    if (!q.date) continue
    const m = earningsMomentum(f.quarterly, q.date)
    if (!m || m.date !== q.date) continue
    const i = d.dates.findIndex(x => x > q.date)
    if (i < 1) continue
    const turnover = d.dates.slice(Math.max(0, i - 20), i).reduce((s, _, k) => s + d.c[i - 1 - k] * d.v[i - 1 - k], 0) / 20
    const r = { code, date: q.date, entry: d.dates[i], ...m, turnover, react: (d.o[i] / d.c[i - 1] - 1) * 100, low: d.c[i - 1] < 500 }
    const b = base.get(d.dates[i])
    for (const h of H) {
      if (i + h - 1 < d.dates.length && b['n' + h]) {
        r['r' + h] = (d.c[i + h - 1] / d.o[i] - 1) * 100
        r['ex' + h] = r['r' + h] - b['s' + h] / b['n' + h]
      }
    }
    ev.push(r)
  }
}
const med = xs => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}
const f2 = x => (Number.isFinite(x) ? (x >= 0 ? '+' : '') + x.toFixed(2) : '  —  ')
const dates = [...new Set(ev.map(r => r.entry))].sort()
const mid = dates[Math.floor(dates.length / 2)]
function line(name, xs) {
  const a = (ys, k) => {
    const zs = ys.filter(r => Number.isFinite(r[k]))
    return zs.length ? zs.reduce((s, r) => s + r[k], 0) / zs.length : NaN
  }
  const A = xs.filter(r => r.entry < mid)
  const B = xs.filter(r => r.entry >= mid)
  const w = xs.filter(r => Number.isFinite(r.ex60))
  console.log(name.padEnd(34), `n=${String(xs.length).padStart(5)}`,
    `| 20日 全体比${f2(a(xs, 'ex20'))}（前${f2(a(A, 'ex20'))}/後${f2(a(B, 'ex20'))}）`,
    `| 60日 全体比${f2(a(xs, 'ex60'))}（前${f2(a(A, 'ex60'))}/後${f2(a(B, 'ex60'))} 中央${f2(med(w.map(r => r.ex60)))} 勝${w.length ? Math.round(w.filter(r => r.ex60 > 0).length / w.length * 100) : '—'}% n=${w.length}）`)
}
console.log(`発表 ${ev.length}回（${new Set(ev.map(r => r.code)).size}銘柄、${dates[0]}〜${dates[dates.length - 1]}、前半/後半の境 ${mid}）`)
line('全部', ev)
const has = ev.filter(r => Number.isFinite(r.op_yoy_pct))
console.log('\n-- 四半期の営業益の前年比')
for (const [lo, hi] of [[-1e9, -50], [-50, -20], [-20, 0], [0, 20], [20, 50], [50, 100], [100, 1e9]]) line(`${lo}〜${hi}%`, has.filter(r => r.op_yoy_pct >= lo && r.op_yoy_pct < hi))
line('前年が赤字（比べられない）', ev.filter(r => !Number.isFinite(r.op_yoy_pct)))
console.log('\n-- 売上の前年比')
for (const [lo, hi] of [[-1e9, -10], [-10, 0], [0, 10], [10, 20], [20, 1e9]]) line(`${lo}〜${hi}%`, ev.filter(r => Number.isFinite(r.sales_yoy_pct) && r.sales_yoy_pct >= lo && r.sales_yoy_pct < hi))
console.log('\n-- 営業益が前年より増えた四半期の連続')
for (const k of [0, 1, 2, 3, 4]) line(`${k}回${k === 4 ? '以上' : ''}`, ev.filter(r => (k === 4 ? r.streak >= 4 : r.streak === k)))
console.log('\n-- 組み合わせ')
const strong = r => r.op_yoy_pct >= 20 && r.sales_yoy_pct >= 10
line('営業益+20%以上・売上+10%以上', ev.filter(strong))
line('  同・利益率も上がった', ev.filter(r => strong(r) && r.margin > r.margin_prev))
line('  同・連続2回以上', ev.filter(r => strong(r) && r.streak >= 2))
line('  同・翌朝の反応 +3%以上', ev.filter(r => strong(r) && r.react >= 3))
line('  同・翌朝の反応 0〜3%', ev.filter(r => strong(r) && r.react >= 0 && r.react < 3))
line('  同・翌朝の反応 マイナス', ev.filter(r => strong(r) && r.react < 0))
line('営業益−20%以下・売上マイナス', ev.filter(r => r.op_yoy_pct <= -20 && r.sales_yoy_pct < 0))
console.log('\n-- 翌朝の反応（窓）だけ')
for (const [lo, hi] of [[-1e9, -5], [-5, -2], [-2, 0], [0, 2], [2, 5], [5, 1e9]]) line(`${lo}〜${hi}%`, ev.filter(r => r.react >= lo && r.react < hi))
console.log('\n-- 低位株（500円未満）とそれ以外の「営業益+20%以上・売上+10%以上」')
line('低位株', ev.filter(r => strong(r) && r.low))
line('それ以外', ev.filter(r => strong(r) && !r.low))
