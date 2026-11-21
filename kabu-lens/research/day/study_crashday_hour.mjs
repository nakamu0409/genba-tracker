// 相場全体が大きく下げて始まった日（全銘柄の窓の真ん中が −1.5% 以下）は、場中のいつ買うとよいか（1時間足・約3年）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_crashday_hour.mjs
// ・買う時刻：9:00（寄り）・10:00・11:00・12:30・13:00・14:00・15:00 の足の始値。売る：その日の引け／翌日の引け／5日後の引け
// ・そのままの%（全部の株の平均）。比べる相手は、窓がふつうの日（真ん中が ±0.5%）
// ・さらに 10:00 の時点で「寄りより上に戻した株」と「まだ寄りより下の株」に分ける
// ・前半（〜2025-05-31）と後半で分ける
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const hour = R('./hour.json')
const wide = R('../wide.json')
const MID = '2025-06-01'
const TIMES = [540, 600, 660, 720, 780, 840, 900]
const lab = m => (m === 720 ? '12:30' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`)
// 銘柄・日ごとに、前日の終値・売買代金・翌日と5日後の終値を用意
const perDay = new Map() // date → [{gap, bars, prevC, nextC, c5}]
for (const [code, days] of Object.entries(hour)) {
  const w = wide[code]
  if (!w?.d || !days) continue
  const D = w.d.map(([date, o, h, l, c, v]) => ({ date, c, v })).filter(b => b.c > 0)
  const di = new Map(D.map((b, i) => [b.date, i]))
  for (const [d, raw] of Object.entries(days)) {
    const i = di.get(d)
    if (i === undefined || i < 21 || i + 5 >= D.length) continue
    const turn = D.slice(i - 20, i).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turn < 1e8 || D[i - 1].c < 300) continue
    const bars = raw.map(([m, o, h, l, c]) => ({ m, o, h, l, c })).filter(b => b.o > 0)
    if (bars.length < 5 || bars[0].m !== 540) continue
    if (!perDay.has(d)) perDay.set(d, [])
    perDay.get(d).push({ gap: (bars[0].o / D[i - 1].c - 1) * 100, bars, prevC: D[i - 1].c, close: bars[bars.length - 1].c, nextC: D[i + 1].c, c5: D[i + 4].c })
  }
}
const median = a => {
  const z = [...a].sort((x, y) => x - y)
  return z[Math.floor(z.length / 2)]
}
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const crash = []
const normal = []
for (const [d, list] of perDay) {
  if (list.length < 200) continue
  const mg = median(list.map(x => x.gap))
  if (mg <= -1.5) crash.push({ d, mg, list })
  else if (Math.abs(mg) <= 0.5) normal.push({ d, mg, list })
}
console.log(`大きく下げて始まった日 ${crash.length}日（前半 ${crash.filter(x => x.d < MID).length}・後半 ${crash.filter(x => x.d >= MID).length}）、ふつうの日 ${normal.length}日\n`)
function table(title, days, filter = () => true) {
  console.log(`■ ${title}`)
  for (const t of TIMES) {
    const rows = { c: [[], []], n: [[], []], f: [[], []] }
    for (const { d, list } of days) {
      const h = d < MID ? 0 : 1
      // 日ごとに平均してから、日の平均をとる（同じ日の株は一緒に動くので、日を1回と数える）
      const cs = []
      const ns = []
      const fs = []
      for (const x of list) {
        const e = x.bars.find(b => b.m === t)
        if (!e || !filter(x)) continue
        cs.push((x.close / e.o - 1) * 100)
        ns.push((x.nextC / e.o - 1) * 100)
        fs.push((x.c5 / e.o - 1) * 100)
      }
      if (cs.length < 20) continue
      rows.c[h].push(mean(cs))
      rows.n[h].push(mean(ns))
      rows.f[h].push(mean(fs))
    }
    console.log(`  ${lab(t).padEnd(6)}に買う  その日の引けまで ${f(mean(rows.c[0].concat(rows.c[1])))}（前半${f(mean(rows.c[0]))}・後半${f(mean(rows.c[1]))}）  翌日の引けまで ${f(mean(rows.n[0].concat(rows.n[1])))}（${f(mean(rows.n[0]))}・${f(mean(rows.n[1]))}）  5日後 ${f(mean(rows.f[0].concat(rows.f[1])))}（${f(mean(rows.f[0]))}・${f(mean(rows.f[1]))}）`)
  }
}
table('大きく下げて始まった日（全部の株の平均・そのままの%。日を1回と数える）', crash)
table('　そのうち 10:00 の時点で寄りより上に戻していた株', crash, x => x.bars.find(b => b.m === 600)?.o >= x.bars[0].o)
table('　そのうち 10:00 の時点でまだ寄りより下の株', crash, x => x.bars.find(b => b.m === 600)?.o < x.bars[0].o)
table('比べる相手：窓がふつうの日', normal)
// 底の時刻：大きく下げて始まった日に、全銘柄の平均の値段がいちばん安かった足
const lowAt = {}
for (const { list } of crash) {
  let best = null
  for (const t of TIMES) {
    const v = mean(list.map(x => {
      const b = x.bars.find(y => y.m === t)
      return b ? (b.l / x.prevC - 1) * 100 : NaN
    }).filter(Number.isFinite))
    if (best === null || v < best[1]) best = [t, v]
  }
  lowAt[lab(best[0])] = (lowAt[lab(best[0])] || 0) + 1
}
console.log('\n■ 大きく下げて始まった日に、全銘柄の平均でいちばん安かった時間（日数）')
console.log('  ' + Object.entries(lowAt).map(([k, v]) => `${k} ${v}日`).join('・'))
