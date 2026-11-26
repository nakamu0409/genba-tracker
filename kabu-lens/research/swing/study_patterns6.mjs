// 形の検証の7回目（2026-11-20。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_patterns6.mjs
// 1) 銘柄ごとの米国への反応：前半（〜2021-11-18）の日足で、前の夜の SOX の動きと、その株の寄り→引け（TOPIX との差）の関係（傾き）を銘柄ごとに求める。
//    後半で、SOX が ±3% 動いた夜の翌日、傾きが大きい株／小さい株の寄り→引けを比べる（寄りの窓には反応がすでに入っているので、寄りのあとに続くかを見る）
// 2) 曜日：個別の株を、その曜日の寄りで買い引けで売る（TOPIX との差。手数料は引かない）
// 3) 月初・月末：月の最初の3営業日・最後の3営業日の、個別の株の寄り→引け（同じ）
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const A = '2021-11-19'
const BB = '2025-11-14'
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(3) : '  —  ')
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) {
  const p = bench[bench.length - 1]
  if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
  bench.push(b)
}
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bOC = d => (bi.has(d) ? (bench[bi.get(d)].c / bench[bi.get(d)].o - 1) * 100 : null)
const j = R('../world/SOX.json').chart.result[0]
const sox = j.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: j.indicators.quote[0].close[i] })).filter(x => x.c != null)
const soxPrev = d => {
  let lo = 0
  let hi = sox.length - 1
  let a = -1
  while (lo <= hi) {
    const m = (lo + hi) >> 1
    if (sox[m].date < d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a >= 1 ? (sox[a].c / sox[a - 1].c - 1) * 100 : null
}
const wide = R('../wide.json')
const beta = []
const dow = { 1: [], 2: [], 3: [], 4: [], 5: [] }
const mStart = []
const mEnd = []
const dates = bench.map(b => b.date)
const isFirst3 = new Set()
const isLast3 = new Set()
for (let i = 0; i < dates.length; i++) {
  const m = dates[i].slice(0, 7)
  if (i < 3 || dates[i - 3].slice(0, 7) !== m) isFirst3.add(dates[i])
  if (i + 3 >= dates.length || dates[i + 3].slice(0, 7) !== m) isLast3.add(dates[i])
}
for (const w of Object.values(wide)) {
  const B = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0)
  if (B.length < 600) continue
  let st = 0
  const xs = []
  const ys = []
  const later = []
  for (let i = 1; i < B.length; i++) {
    st += B[i].c * B[i].v
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    if (i < 21 || st / 20 < 1e8 || B[i].c < 100 || B[i].h === B[i].l) continue
    const o2 = bOC(B[i].date)
    if (o2 === null) continue
    const oc = (B[i].c / B[i].o - 1) * 100 - o2
    const d = B[i].date
    const wd = new Date(d + 'T00:00:00Z').getUTCDay()
    if (dow[wd]) dow[wd].push({ date: d, v: oc })
    if (isFirst3.has(d)) mStart.push({ date: d, v: oc })
    if (isLast3.has(d)) mEnd.push({ date: d, v: oc })
    const s = soxPrev(d)
    if (s === null) continue
    if (d < A) {
      xs.push(s)
      ys.push(oc)
    } else if (Math.abs(s) >= 3) later.push({ date: d, s, oc })
  }
  if (xs.length < 300 || !later.length) continue
  const mx = mean(xs)
  const my = mean(ys)
  let num = 0
  let den = 0
  for (let k = 0; k < xs.length; k++) {
    num += (xs[k] - mx) * (ys[k] - my)
    den += (xs[k] - mx) ** 2
  }
  beta.push({ b: num / den, later })
}
beta.sort((a, b) => a.b - b.b)
const q = Math.floor(beta.length / 5)
const lowB = beta.slice(0, q)
const highB = beta.slice(-q)
const pick = (g, up) => g.flatMap(x => x.later.filter(r => (up ? r.s >= 3 : r.s <= -3)).map(r => ({ date: r.date, v: r.oc })))
const show = (name, rows) => {
  const s2 = rows.filter(r => r.date >= A && r.date < BB).map(r => r.v)
  const s3 = rows.filter(r => r.date >= BB).map(r => r.v)
  const s1 = rows.filter(r => r.date < A).map(r => r.v)
  console.log(`  ${name.padEnd(44)} ${String(rows.length).padStart(7)}件  前半${f(mean(s1))}（${s1.length}）  確かめる${f(mean(s2))}（${s2.length}）  最後${f(mean(s3))}（${s3.length}）`)
}
console.log(`■ 銘柄ごとの SOX への反応（前半で求めた傾き。上位・下位20%・各${q}銘柄）→ 後半の、SOX が ±3% 動いた夜の翌日の寄り→引け（TOPIX との差・%）`)
console.log(`  傾きの範囲：下位 ${lowB[0].b.toFixed(3)}〜${lowB[q - 1].b.toFixed(3)}、上位 ${highB[0].b.toFixed(3)}〜${highB[q - 1].b.toFixed(3)}`)
show('SOX +3%以上の夜の翌日：反応の大きい株', pick(highB, true))
show('SOX +3%以上の夜の翌日：反応の小さい株', pick(lowB, true))
show('SOX −3%以下の夜の翌日：反応の大きい株', pick(highB, false))
show('SOX −3%以下の夜の翌日：反応の小さい株', pick(lowB, false))
console.log('\n■ 曜日（個別の株を寄りで買い引けで売る。TOPIX との差・手数料は引かない）')
const W = ['', '月', '火', '水', '木', '金']
for (let k = 1; k <= 5; k++) show(W[k] + '曜日', dow[k])
console.log('\n■ 月初・月末（同じ）')
show('月の最初の3営業日', mStart)
show('月の最後の3営業日', mEnd)
