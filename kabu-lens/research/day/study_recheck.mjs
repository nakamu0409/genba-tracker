// 場中の買い場・引け前の目印を、本番の毎晩の記録と同じ判定（intradayView・30分ごと・20分遅れで買う）で、手元の5分足60日分に当て直す
// あわせて「世界の状況」「決算の直後」「スイングの候補が出ている株」と重なったときに成績が変わるかを見る（合図の組み合わせ）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_recheck.mjs
// ・前日までの流れ（intradayContext）は10年分の日足（wide.json）から作る → 60日すべてを判定に使える（前の検証は34日）
// ・数字は同じ時刻に判定した全銘柄の平均との差（%）。前半30日・後半30日で同じ向きか
import { readFileSync } from 'node:fs'
import { intradayView, intradayContext, marksOutcomes } from '../../../.claude/scripts/kabu-lens.mjs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const five = R('./five.json')
const wide = R('../wide.json')
const tanshin = R('../tanshin.json')
const TIMES = [570, 600, 630, 660, 780, 810, 840, 870]
const DELAY = 20

// 世界：前の夜の S&P500（日本の日付 d より前の最後の足）
function ser(f) {
  const j = R('../world/' + f + '.json').chart.result[0]
  const q = j.indicators.quote[0]
  return j.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(x => x.c != null)
}
const spx = ser('GSPC')
const sox = ser('SOX')
const prevChg = (s, d) => {
  let i = -1
  for (let k = 0; k < s.length; k++) if (s[k].date < d) i = k
  return i >= 1 ? (s[i].c / s[i - 1].c - 1) * 100 : null
}
// 決算短信（10/20〜11/20）：発表日 → 進み具合（+15pt 以上）・修正あり
const kes = new Map()
for (const [d, rows] of Object.entries(tanshin)) {
  for (const r of rows) {
    if (!r.code) continue
    const std = { half: 50, quarter: null, full: null }[r.kind]
    const prog = r.progressOp
    kes.set(r.code + '|' + d, { prog, revised: r.revised, kind: r.kind, opYoY: r.actual?.opYoY ?? null, std })
  }
}
const allDates = new Set()
const rows = []
const marks = []
let used = 0
for (const [code, days] of Object.entries(five)) {
  const w = wide[code]
  if (!days || !w?.d) continue
  const daily = w.d.map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.c > 0)
  const di = new Map(daily.map((b, i) => [b.date, i]))
  const dates = Object.keys(days).sort()
  for (let k = 0; k < dates.length - 1; k++) {
    const d = dates[k]
    const i = di.get(d)
    if (i === undefined || i < 60) continue
    const prev = daily.slice(0, i)
    const turn = prev.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turn < 1e8) continue
    const day = days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))
    const next = days[dates[k + 1]].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))
    if (!day.length || !next.length) continue
    const ctx = intradayContext(prev)
    const close = day[day.length - 1].c
    const nextClose = next[next.length - 1].c
    used++
    allDates.add(d)
    // 直前の決算（発表の翌営業日から5日以内）
    let kesHit = null
    for (let back = 1; back <= 6 && i - back >= 0; back++) {
      const kd = daily[i - back].date
      const x = kes.get(code + '|' + kd)
      if (x) {
        kesHit = { ...x, ago: back }
        break
      }
    }
    for (const t of TIMES) {
      const seen = day.filter(b => b.m + 5 <= t)
      if (seen.length < 3) continue
      const e = day.find(b => b.m >= t + DELAY)
      if (!e || !(e.o > 0)) continue
      const v = intradayView(seen, ctx)
      rows.push({ d, t, code, signal: v.signal, kind: v.kind, raw: v.raw_take, low: v.low_group, regime: v.regime, marks: v.marks || [], fromPrev: v.from_prev_pct, rC: (close / e.o - 1) * 100, rN: (nextClose / e.o - 1) * 100, gap: (day[0].o / prev[prev.length - 1].c - 1) * 100, kes: kesHit })
    }
    for (const m of marksOutcomes([{ date: d, code, day, next, ctx }])) marks.push({ ...m, d, gap: (day[0].o / prev[prev.length - 1].c - 1) * 100, kes: kesHit })
  }
}
// 同じ日・同じ時刻の全銘柄平均との差
const base = new Map()
for (const r of rows) {
  const k = r.d + '|' + r.t
  const b = base.get(k) || { n: 0, c: 0, x: 0 }
  b.n++
  b.c += r.rC
  b.x += r.rN
  base.set(k, b)
}
for (const r of rows) {
  const b = base.get(r.d + '|' + r.t)
  r.exC = r.rC - b.c / b.n
  r.exN = r.rN - b.x / b.n
}
const D = [...allDates].sort()
const MID = D[Math.floor(D.length / 2)]
const world = new Map(D.map(d => [d, { spx: prevChg(spx, d), sox: prevChg(sox, d) }]))
console.log(`判定した銘柄・日 ${used}、日数 ${D.length}（${D[0]}〜${D[D.length - 1]}）、前半と後半の境 ${MID}、判定 ${rows.length}回、目印 ${marks.length}件`)
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
function line(name, z, a = 'exC', b = 'exN') {
  if (z.length < 30) return console.log(`  ${name.padEnd(36)} ${String(z.length).padStart(6)}回（少ない）`)
  const A = z.filter(x => x.d < MID)
  const B = z.filter(x => x.d >= MID)
  const same = A.length >= 15 && B.length >= 15 && Math.sign(mean(A.map(x => x[a]))) === Math.sign(mean(B.map(x => x[a])))
  console.log(`  ${name.padEnd(36)} ${String(z.length).padStart(6)}回  大引けまで${f(mean(z.map(x => x[a])))}（前半${f(mean(A.map(x => x[a])))}・後半${f(mean(B.map(x => x[a])))}${same ? '・同じ向き' : ''}）  翌日まで${f(mean(z.map(x => x[b])))}  勝率${(z.filter(x => x[a] > 0).length / z.length * 100).toFixed(0)}%`)
}
const TAKE = rows.filter(r => r.signal === 'TAKE')
console.log('\n■ 今の合図（全銘柄平均との差・%）')
line('買い場（TAKE・絞り込み後）', TAKE)
line('  押し目', TAKE.filter(r => r.kind === 'PULLBACK'))
line('  高値抜け', TAKE.filter(r => r.kind === 'BREAKOUT'))
line('  10:30・11:00 の判定', TAKE.filter(r => r.t === 630 || r.t === 660))
line('  13:00 以降の判定', TAKE.filter(r => r.t >= 780))
line('絞り込む前の形（TAKE_RAW）', rows.filter(r => r.raw && !r.low))
line('見送り（SKIP）', rows.filter(r => r.signal === 'SKIP'))
line('後場の VWAP 奪回（目印）', rows.filter(r => r.marks.includes('RECLAIM_PM')))
line('前日比 +8%以上を追う', rows.filter(r => r.fromPrev >= 8))
console.log('\n■ 買い場 × 世界の状況（前の夜の米国）')
line('前の夜の S&P500 −1%以下', TAKE.filter(r => world.get(r.d).spx <= -1))
line('前の夜の S&P500 ±1%', TAKE.filter(r => Math.abs(world.get(r.d).spx) < 1))
line('前の夜の S&P500 +1%以上', TAKE.filter(r => world.get(r.d).spx >= 1))
line('前の夜の SOX −2%以下', TAKE.filter(r => world.get(r.d).sox <= -2))
line('前の夜の SOX +2%以上', TAKE.filter(r => world.get(r.d).sox >= 2))
console.log('\n■ 買い場 × その株の窓（寄り／前日の終値）')
line('窓 −2%以下で始まった株', TAKE.filter(r => r.gap <= -2))
line('窓 ±2%', TAKE.filter(r => Math.abs(r.gap) < 2))
line('窓 +2%以上', TAKE.filter(r => r.gap >= 2))
line('  窓 +2%以上 で決算の直後ではない', TAKE.filter(r => r.gap >= 2 && !r.kes))
line('  窓 +2%以上 で決算の直後', TAKE.filter(r => r.gap >= 2 && r.kes))
line('  窓 +4%以上', TAKE.filter(r => r.gap >= 4))
line('  窓 +2%以上 × 13:00 以降', TAKE.filter(r => r.gap >= 2 && r.t >= 780))
line('窓 +2%以上 の株の判定（買い場以外も全部）', rows.filter(r => r.gap >= 2 && !r.low))
line('窓 +2%以上 の株の見送り（SKIP）', rows.filter(r => r.gap >= 2 && !r.low && r.signal === 'SKIP'))
console.log('\n■ 買い場 × 地合い（場中の流れ）')
for (const g of ['TREND_UP', 'TREND_DOWN', 'CHOPPY', 'PANIC', 'RANGE']) line('流れ ' + g, TAKE.filter(r => r.regime === g))
console.log('\n■ 決算の直後（発表の翌営業日〜5日以内。決算短信は 10/20〜11/20 だけ）')
const K = rows.filter(r => r.kes)
line('決算の直後の判定（全部）', K)
line('  そのうち買い場', K.filter(r => r.signal === 'TAKE'))
line('  中間で進み具合 +15pt 以上の株（全部の判定）', K.filter(r => r.kes.kind === 'half' && r.kes.prog !== null && r.kes.prog >= 65))
line('  前年比 +20%以上の株（全部の判定）', K.filter(r => r.kes.opYoY !== null && r.kes.opYoY >= 20))
line('  前年比 マイナスの株（全部の判定）', K.filter(r => r.kes.opYoY !== null && r.kes.opYoY < 0))
console.log('\n■ 引け前の目印（売り方どおりの%・前日比ではなくそのままの騰落）')
const mk = n => marks.filter(m => m.mark === n).map(m => ({ ...m, a: m.pct, b: m.rC }))
const LS = mk('LOW_STRONG_CLOSE')
const RP = mk('RECLAIM_PM')
line('低位株の強い引け（+5%／−8%／翌13時）', LS, 'a', 'b')
line('後場の VWAP 奪回（翌日の引け）', RP, 'a', 'b')
line('  VWAP 奪回 × 前の夜の S&P500 +1%以上', RP.filter(m => world.get(m.d)?.spx >= 1), 'a', 'b')
line('  VWAP 奪回 × 前の夜の S&P500 −1%以下', RP.filter(m => world.get(m.d)?.spx <= -1), 'a', 'b')
const allN = mean(rows.map(r => r.rN))
console.log(`\n（参考）全判定の翌日まで のそのままの平均 ${f(allN)}%`)
