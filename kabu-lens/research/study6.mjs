// 約1,400銘柄・10年で、「好材料の窓開け」が買える値段の株でも効くかを調べる。
// あわせて、窓開けの中でどんな特徴のものが良かったか（前半・後半の両方で）を見る。
import { readFileSync } from 'node:fs'
const data = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const SPLIT = '2022-01-01'
const HOLD = 40, GAPMIN = 2, VOLR = 2, POS = 0.6
const gaps = [], base = []
function run(d, i, stop) { // 翌日の始値で買い、損切りか HOLD 営業日後の終値で売る。結果は%
  const e = d[i + 1]; if (!e) return null
  const entry = e[1]; if (entry > d[i][4] * 1.02 || entry <= stop) return null
  for (let k = i + 1; k <= Math.min(i + HOLD, d.length - 1); k++) {
    if (d[k][3] <= stop) return (Math.min(d[k][1], stop) / entry - 1) * 100
    if (k === i + HOLD || k === d.length - 1) return (d[k][4] / entry - 1) * 100
  }
  return null
}
for (const [code, { d }] of Object.entries(data)) {
  let atr = null; const tr = []
  for (let i = 1; i < d.length - 1; i++) {
    const t = Math.max(d[i][2] - d[i][3], Math.abs(d[i][2] - d[i - 1][4]), Math.abs(d[i][3] - d[i - 1][4]))
    tr.push(t); atr = atr === null ? (tr.length === 14 ? tr.reduce((a, b) => a + b, 0) / 14 : null) : (atr * 13 + t) / 14
    if (i < 260 || atr === null) continue
    const [date, o, h, l, c, v] = d[i]; const pc = d[i - 1][4]
    let va = 0, to = 0; for (let k = i - 20; k < i; k++) { va += d[k][5]; to += d[k][5] * d[k][4] } va /= 20; to /= 20
    if (to < 5e7) continue // その時点で売買が少なすぎる株は外す
    const stop = c - 2 * atr
    if (i % 10 === 0) { const r = run(d, i, stop); if (r !== null) base.push({ date, r, price: c, run20: (pc / d[i - 21][4] - 1) * 100, run10: (pc / d[i - 11][4] - 1) * 100, run40: (pc / d[i - 41][4] - 1) * 100 }) }
    const gap = (o / pc - 1) * 100
    if (gap < GAPMIN || c <= o || h === l || (c - l) / (h - l) < POS || v < VOLR * va) continue
    const r = run(d, i, stop); if (r === null) continue
    let hi = 0; for (let k = i - 250; k < i; k++) hi = Math.max(hi, d[k][2])
    let ma25 = 0; for (let k = i - 24; k <= i; k++) ma25 += d[k][4]; ma25 /= 25
    let ma200 = 0; for (let k = i - 199; k <= i; k++) ma200 += d[k][4]; ma200 /= 200
    gaps.push({ code, date, r, price: c, gap, dayGain: (c / pc - 1) * 100, volR: v / va, turnover: to, atrPct: atr / c * 100, fromHigh: (c / hi - 1) * 100, newHigh: c >= hi, above200: c > ma200, dev25: (c / ma25 - 1) * 100, run20: (pc / d[i - 21][4] - 1) * 100, run10: (pc / d[i - 11][4] - 1) * 100, run40: (pc / d[i - 41][4] - 1) * 100 })
  }
}
const st = l => { const n = l.length; if (!n) return 'n=0'.padEnd(40); const m = l.reduce((a, x) => a + x.r, 0) / n; const s = l.map(x => x.r).sort((a, b) => a - b); return `n=${String(n).padStart(5)} 平均${m.toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.r > 0).length / n * 100).toFixed(0)}% 中央${s[Math.floor(n / 2)].toFixed(1).padStart(5)}%` }
const show = (name, l) => console.log(name.padEnd(22), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
console.log('銘柄', Object.keys(data).length, '窓開け', gaps.length)
show('基準 全部', base); show('窓開け 全部', gaps)
console.log('--- 「下げたあと」は、窓開けでなくても良いのか（対照）')
for (const [k, lab] of [['run10', '直前10日'], ['run20', '直前20日'], ['run40', '直前40日']]) for (const th of [-5, -10, -15, -20]) { show(`窓開け ${lab}${th}%以下`, gaps.filter(x => x[k] <= th)); show(`  基準 ${lab}${th}%以下`, base.filter(x => x[k] <= th)) }
const dip = gaps.filter(x => x.run20 <= -10), bdip = base.filter(x => x.run20 <= -10)
console.log('--- 「直前20日で10%以上下げたあとの窓開け」を分ける')
const cut = (ev, title, f, edges, labels) => { console.log(title); labels.forEach((lab, k) => show('  ' + lab, ev.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] }))) }
cut(dip, '株価', x => x.price, [0, 700, 1500, 3000, 1e9], ['700円未満', '700〜1,500円', '1,500〜3,000円', '3,000円以上'])
cut(dip, '売買代金', x => x.turnover, [0, 2e8, 1e9, 1e15], ['2億円未満', '2〜10億円', '10億円以上'])
cut(dip, '窓の大きさ', x => x.gap, [2, 4, 8, 1e9], ['2〜4%', '4〜8%', '8%以上'])
console.log('年ごと（下げたあとの窓開け / 同じ条件の基準 / 基準全部）')
const av = l => l.length ? (l.reduce((s, x) => s + x.r, 0) / l.length).toFixed(2) + '%' : '-'
for (let y = 2018; y <= 2026; y++) { const f = x => x.date.startsWith(y); console.log(' ', y, st(dip.filter(f)), '| 下げたあと', av(bdip.filter(f)), '| 全部', av(base.filter(f))) }
console.log('--- 逆に、上げたあとの窓開け（直前20日+10%以上）'); show('窓開け', gaps.filter(x => x.run20 >= 10)); show('基準', base.filter(x => x.run20 >= 10))
