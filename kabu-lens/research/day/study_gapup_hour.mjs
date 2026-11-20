// 窓を開けて高く始まった株（寄り／前日の終値 +2%以上）を、場中に買うとどうなるか（1時間足・約3年）
// 5分足（57日）で「窓 +2%以上の株の買い場」が強かったので、長い期間で似た形を確かめる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/day/study_gapup_hour.mjs
// ・11:00 の足の始値で買う（10:30 に判定して20分遅れで買うのに近い）。13:00 の足の始値で買う場合も見る
// ・数字は同じ日・同じ時刻に買った全銘柄（売買代金1億円以上・株価300円以上）の平均との差（%）
import { readFileSync } from 'node:fs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const hour = R('./hour.json')
const wide = R('../wide.json')
const rows = []
for (const [code, days] of Object.entries(hour)) {
  const w = wide[code]
  if (!w?.d || !days) continue
  const daily = w.d.map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.c > 0)
  const di = new Map(daily.map((b, i) => [b.date, i]))
  const dates = Object.keys(days).sort()
  for (let k = 0; k < dates.length - 1; k++) {
    const d = dates[k]
    const i = di.get(d)
    if (i === undefined || i < 25) continue
    const prev = daily[i - 1]
    if (prev.c < 300) continue
    const turn = daily.slice(i - 20, i).reduce((s, b) => s + b.c * b.v, 0) / 20
    if (turn < 1e8) continue
    const bars = days[d].map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }))
    const nb = days[dates[k + 1]]
    if (!bars.length || !nb?.length) continue
    const open = bars[0].o
    const close = bars[bars.length - 1].c
    const nextClose = nb[nb.length - 1][4]
    if (!(open > 0 && close > 0)) continue
    const gap = (open / prev.c - 1) * 100
    for (const at of [660, 780]) {
      const e = bars.find(b => b.m === at)
      if (!e || !(e.o > 0)) continue
      const before = bars.filter(b => b.m < at)
      const hi = Math.max(...before.map(b => b.h))
      rows.push({ d, y: d.slice(0, 4), at, gap, held: e.o >= open, pull: e.o < hi * 0.995, rC: (close / e.o - 1) * 100, rN: (nextClose / e.o - 1) * 100 })
    }
  }
}
const base = new Map()
for (const r of rows) {
  const k = r.d + '|' + r.at
  const b = base.get(k) || { n: 0, c: 0, x: 0 }
  b.n++
  b.c += r.rC
  b.x += r.rN
  base.set(k, b)
}
for (const r of rows) {
  const b = base.get(r.d + '|' + r.at)
  r.exC = r.rC - b.c / b.n
  r.exN = r.rN - b.x / b.n
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const years = [...new Set(rows.map(r => r.y))].sort()
function line(name, z) {
  const by = years.map(y => f(mean(z.filter(r => r.y === y).map(r => r.exC)))).join('・')
  console.log(`  ${name.padEnd(38)} ${String(z.length).padStart(6)}回  大引けまで${f(mean(z.map(r => r.exC)))}（${years.join('・')}：${by}）  翌日まで${f(mean(z.map(r => r.exN)))}  勝率${(z.filter(r => r.exC > 0).length / z.length * 100).toFixed(0)}%`)
}
for (const at of [660, 780]) {
  const z = rows.filter(r => r.at === at)
  console.log(`\n■ ${at === 660 ? '11:00' : '13:00'} の足の始値で買う`)
  line('窓 +2%以上の株（全部）', z.filter(r => r.gap >= 2))
  line('  窓を保っている（寄り以上）', z.filter(r => r.gap >= 2 && r.held))
  line('  窓を保ち、朝の高値から少し押している', z.filter(r => r.gap >= 2 && r.held && r.pull))
  line('  寄りより下（窓を埋めかけ）', z.filter(r => r.gap >= 2 && !r.held))
  line('窓 +4%以上で窓を保っている', z.filter(r => r.gap >= 4 && r.held))
  line('窓 ±1%（ふつうの日）', z.filter(r => Math.abs(r.gap) < 1))
  line('窓 −2%以下', z.filter(r => r.gap <= -2))
}
