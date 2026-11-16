// 決算・業績修正の見出し（株探、直近約2年）と、その後の株価の関係。
// 買うのは「発表の次の営業日の始値」（発表が場中でも引け後でも、反応を見たあとに買える最初の値段）。
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const kessan = JSON.parse(readFileSync(new URL('./kessan.json', import.meta.url), 'utf-8'))
const kind = (t) => {
  if (/上方修正/.test(t) && /下方修正/.test(t)) return '上下まじり'
  if (/上方修正/.test(t)) return '上方修正'
  if (/下方修正/.test(t)) return '下方修正'
  if (/最高益|増益|黒字浮上|黒字転換|赤字縮小/.test(t) && !/減益|赤字転落|赤字拡大/.test(t)) return '良い決算'
  if (/減益|赤字転落|赤字拡大|赤字/.test(t)) return '悪い決算'
  return 'その他'
}
const ev = [], base = []
const START = '2025-01-01'
for (const [code, { d }] of Object.entries(wide)) {
  const idx = new Map(d.map((x, i) => [x[0], i]))
  const atr = new Array(d.length).fill(null); let a = null; const tr = []
  for (let i = 1; i < d.length; i++) { const t = Math.max(d[i][2] - d[i][3], Math.abs(d[i][2] - d[i - 1][4]), Math.abs(d[i][3] - d[i - 1][4])); tr.push(t); a = a === null ? (tr.length === 14 ? tr.reduce((x, y) => x + y, 0) / 14 : null) : (a * 13 + t) / 14; atr[i] = a }
  const sim = (e) => { // e = 買う日の位置。始値で買う
    if (e < 30 || e >= d.length || atr[e - 1] === null) return null
    const entry = d[e][1], stop = entry - 2 * atr[e - 1]; const o = { atrPct: atr[e - 1] / entry * 100, price: entry }
    for (const n of [1, 5, 20, 40]) o['r' + n] = e + n - 1 < d.length ? (d[e + n - 1][4] / entry - 1) * 100 : null
    o.rs = null
    for (let k = e; k <= Math.min(e + 39, d.length - 1); k++) {
      if (d[k][3] <= stop) { o.rs = (Math.min(d[k][1], stop) / entry - 1) * 100; break }
      if (k === e + 39) o.rs = (d[k][4] / entry - 1) * 100
    }
    let to = 0; for (let k = e - 20; k < e; k++) to += d[k][5] * d[k][4]; o.turnover = to / 20
    o.run20 = (d[e - 2][4] / d[e - 22]?.[4] - 1) * 100
    return o
  }
  for (let i = 30; i < d.length; i += 5) if (d[i][0] >= START) { const s = sim(i); if (s && s.turnover >= 5e7) base.push({ date: d[i][0], ...s }) }
  for (const k of kessan[code] || []) {
    const date = k.t.slice(0, 10), hm = k.t.slice(11)
    if (date < START) continue
    let i = idx.get(date)
    if (i === undefined) { i = d.findIndex(x => x[0] > date); if (i < 0) continue; i -= 1 } // 休日の発表は、直前の営業日のあとに出たものとして扱う
    const after = hm >= '15:00' || !idx.has(date)
    const e = i + 1
    const s = sim(e); if (!s || s.turnover < 5e7) continue
    // 反応: 引け後の発表なら「翌営業日の始値 ÷ 発表日の終値」。場中なら「発表日の終値 ÷ 前日の終値」
    const react = after ? (d[e][1] / d[i][4] - 1) * 100 : (d[i][4] / d[i - 1][4] - 1) * 100
    const pct = Number(k.title.match(/([\d.]+)[％%](?:上方|下方)修正/)?.[1] ?? NaN)
    ev.push({ code, date: d[e][0], after, kind: kind(k.title), react, pct: Number.isFinite(pct) ? pct : null, title: k.title, ...s })
  }
}
const av = (l, f) => { const v = l.map(x => x[f]).filter(x => x != null); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length) : null }
const fm = x => x == null ? '   -  ' : (x >= 0 ? '+' : '') + x.toFixed(2).padStart(5) + '%'
const st = l => `n=${String(l.length).padStart(5)} 1日${fm(av(l, 'r1'))} 5日${fm(av(l, 'r5'))} 20日${fm(av(l, 'r20'))} 40日${fm(av(l, 'r40'))} | 損切りつき40日${fm(av(l, 'rs'))} 勝率${l.filter(x => x.rs != null).length ? (l.filter(x => x.rs > 0).length / l.filter(x => x.rs != null).length * 100).toFixed(0) : '-'}%`
const show = (name, l) => console.log(name.padEnd(20), st(l))
console.log('決算の見出し', ev.length, '件 期間', ev.map(x => x.date).sort()[0], '〜', ev.map(x => x.date).sort().at(-1))
show('基準（いつでも買う）', base)
console.log('--- 見出しの種類ごと'); for (const k of ['上方修正', '良い決算', 'その他', '悪い決算', '下方修正', '上下まじり']) show(k, ev.filter(x => x.kind === k))
const seasons = [['2025-01', '2025-04'], ['2025-04', '2025-07'], ['2025-07', '2025-10'], ['2025-10', '2026-01'], ['2026-01', '2026-04'], ['2026-04', '2026-07'], ['2026-07', '2026-10'], ['2026-10', '2027-01']]
console.log('--- 決算の時期ごと（上方修正 / 下方修正 / 基準。損切りつき40日と、20日）')
for (const [a, b] of seasons) { const f = x => x.date >= a && x.date < b; const u = ev.filter(x => f(x) && x.kind === '上方修正'), dn = ev.filter(x => f(x) && x.kind === '下方修正'), bs = base.filter(f); console.log(' ', a, `上方 n=${String(u.length).padStart(4)} ${fm(av(u, 'rs'))} / ${fm(av(u, 'r20'))}  下方 n=${String(dn.length).padStart(4)} ${fm(av(dn, 'rs'))} / ${fm(av(dn, 'r20'))}  基準 ${fm(av(bs, 'rs'))} / ${fm(av(bs, 'r20'))}`) }
const up = ev.filter(x => x.kind === '上方修正')
const cut = (ev2, title, f, edges, labels) => { console.log('--- ' + title); labels.forEach((lab, k) => show('  ' + lab, ev2.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] }))) }
cut(up, '上方修正: 発表への最初の反応', x => x.react, [-100, -3, 0, 3, 7, 12, 1e9], ['−3%より下', '−3〜0%', '0〜+3%', '+3〜7%', '+7〜12%', '+12%以上'])
cut(up, '上方修正: 修正の大きさ（見出しの%）', x => x.pct, [0, 5, 10, 20, 40, 1e9], ['5%未満', '5〜10%', '10〜20%', '20〜40%', '40%以上'])
cut(up, '上方修正: 株価', x => x.price, [0, 700, 1500, 3000, 1e9], ['700円未満', '700〜1,500円', '1,500〜3,000円', '3,000円以上'])
cut(up, '上方修正: 直前20日の動き', x => x.run20, [-100, -10, 0, 10, 1e9], ['−10%より下', '−10〜0%', '0〜+10%', '+10%以上'])
cut(up, '上方修正: 売買代金', x => x.turnover, [0, 2e8, 1e9, 1e15], ['2億円未満', '2〜10億円', '10億円以上'])
cut(ev.filter(x => x.kind === '下方修正'), '下方修正: 発表への最初の反応', x => x.react, [-100, -10, -5, -2, 0, 1e9], ['−10%より下', '−10〜−5%', '−5〜−2%', '−2〜0%', '0%以上'])
console.log('見出しの例:', ev.filter(x => x.kind === 'その他').slice(0, 6).map(x => x.title).join(' / '))
