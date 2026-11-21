// 寄り付きが遅れた「決算の型」の銘柄は、いつ・いくらで最初に約定したか（15分足を取り直す）
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const kes = JSON.parse(readFileSync(new URL('../kessan.json', import.meta.url), 'utf-8'))
const base = {}
for (const { d } of Object.values(wide)) for (let e = 30; e + 4 < d.length; e++) { const b = base[d[e][0]] ||= { n: 0, s: 0 }; if (d[e][1] > 0) { b.n++; b.s += (d[e + 4][4] / d[e][1] - 1) * 100 } }
const evs = []
for (const [code, list] of Object.entries(kes)) {
  const d = wide[code]?.d; if (!d) continue
  const idx = new Map(d.map((x, i) => [x[0], i]))
  for (const k of list) {
    const date = k.t.slice(0, 10), hm = k.t.slice(11, 16); if (hm < '15:00') continue
    const i = idx.get(date); if (i === undefined || i + 5 >= d.length) continue
    const e = i + 1; if (d[e][0] < '2026-08-18') continue
    const react = (d[e][1] / d[i][4] - 1) * 100; if (react < 12) continue
    evs.push({ code, i, e, day: d[e][0], react, prev: d[i][4], dayHigh: d[e][2], dayClose: d[e][4], c5: d[e + 4][4], c20: d[e + 19]?.[4], title: k.title })
  }
}
const cache = {}
const get = (code) => {
  if (cache[code]) return cache[code]
  const r = spawnSync('curl', ['-sS', '--fail', '--max-time', '30', '-A', 'Mozilla/5.0', `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=60d&interval=15m`], { encoding: 'utf-8', maxBuffer: 1 << 26 })
  return (cache[code] = r.status === 0 ? JSON.parse(r.stdout) : null)
}
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const rows = []
for (const ev of evs) {
  const j = get(ev.code); const r = j?.chart?.result?.[0]; if (!r) continue
  const q = r.indicators.quote[0]
  const bars = r.timestamp.map((ts, k) => ({ t: new Date((ts + 32400) * 1000).toISOString(), o: q.open[k], h: q.high[k], l: q.low[k], c: q.close[k], v: q.volume[k] })).filter(b => b.t.startsWith(ev.day) && b.o != null && b.v > 0)
  const first = bars[0]
  const limitLike = ev.dayClose >= ev.dayHigh * 0.999 && bars.every(b => b.h - b.l <= b.h * 0.002) // 1日じゅう値幅が無い＝張り付き
  const bm = base[ev.day]?.n ? base[ev.day].s / base[ev.day].n : 0
  rows.push({ ...ev, firstTime: first ? first.t.slice(11, 16) : '約定なし', firstPrice: first?.o, nbars: bars.length, limitLike, r5Open: (ev.c5 / (first?.o || NaN) - 1) * 100, ex5: (ev.c5 / (first?.o || NaN) - 1) * 100 - bm, r5First2: bars[1] ? (ev.c5 / bars[1].c - 1) * 100 : null })
}
const ok = rows.filter(x => x.firstPrice)
console.log('反応+12%以上（引け後の決算・修正、2026年8月18日〜）:', evs.length, '件、15分足が取れた', rows.length, '件')
const byTime = {}; for (const x of rows) byTime[x.firstTime] = (byTime[x.firstTime] || 0) + 1
console.log('最初に約定した時刻:', Object.entries(byTime).sort().map(([t, n]) => t + '=' + n).join(' '))
console.log('1日じゅう値幅が無かった（ストップ高に張り付いた可能性）:', rows.filter(x => x.limitLike).length, '件')
const buyable = ok.filter(x => !x.limitLike)
const av = (l, f) => l.reduce((s, x) => s + f(x), 0) / l.length
console.log('買えたもの（張り付きを除く）', buyable.length, '件：最初の約定値で買って5日後', fm(av(buyable, x => x.r5Open)), '超過', fm(av(buyable, x => x.ex5)), '勝率', (buyable.filter(x => x.r5Open > 0).length / buyable.length * 100).toFixed(0) + '%')
const late = buyable.filter(x => x.firstTime > '09:00')
console.log('  うち寄り付きが9:00より遅れたもの', late.length, '件：5日後', late.length ? fm(av(late, x => x.r5Open)) : '-', '／ 9:00に寄ったもの', buyable.length - late.length, '件：', buyable.length - late.length ? fm(av(buyable.filter(x => x.firstTime === '09:00'), x => x.r5Open)) : '-')
console.log('--- 一覧')
for (const x of rows.sort((a, b) => a.day.localeCompare(b.day))) console.log(' ', x.day, x.code, '反応' + fm(x.react), '最初の約定', x.firstTime, x.limitLike ? '張り付き' : '', '5日後' + (x.firstPrice ? fm(x.r5Open) : '-'), x.title.slice(0, 22))
