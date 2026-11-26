// 「決算の型」を実際に買える値段で確かめる（15分足・直近60日）。
// 引け後（15:00以降）の決算・修正の見出し（株探）→ 次の営業日の寄り付きの反応が+12%以上（または+7〜12%）。
// 買う値段を「始値」「9:15の値段（最初の15分の終値）」で比べ、5営業日後の終値で評価（日足）。
// 9:00〜9:15に約定が無い日（ストップ高の気配のまま、など）は「買えなかった」として数える。
import { readFileSync } from 'node:fs'
const o15 = JSON.parse(readFileSync(new URL('./open15.json', import.meta.url), 'utf-8'))
const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
const kes = JSON.parse(readFileSync(new URL('../kessan.json', import.meta.url), 'utf-8'))
// 基準：同じ日に全銘柄を始値で買って5日後の平均
const base = {}
for (const { d } of Object.values(wide)) for (let e = 30; e + 4 < d.length; e++) { const b = base[d[e][0]] ||= { n: 0, s: 0 }; if (d[e][1] > 0) { b.n++; b.s += (d[e + 4][4] / d[e][1] - 1) * 100 } }
const ev = []
let missing = 0, missingBig = 0
for (const [code, list] of Object.entries(kes)) {
  const d = wide[code]?.d; if (!d) continue
  const idx = new Map(d.map((x, i) => [x[0], i]))
  const q = new Map((o15[code] || []).map(x => [x[0], x]))
  for (const k of list) {
    if (!/決算|修正/.test(k.ctg || '決算')) continue
    const date = k.t.slice(0, 10), hm = k.t.slice(11, 16)
    if (hm < '15:00') continue
    const i = idx.get(date); if (i === undefined || i + 5 >= d.length) continue
    const e = i + 1, day = d[e][0]
    if (day < '2026-08-18') continue
    const react = (d[e][1] / d[i][4] - 1) * 100
    if (react < 7) continue
    const bar = q.get(day)
    if (!bar) { missing++; if (react >= 12) missingBig++; continue }
    const [, o1, h1, l1, c1] = bar
    const c5 = d[e + 4][4], b = base[day]
    const bm = b && b.n ? b.s / b.n : 0
    ev.push({ code, day, react, title: k.title, rOpen: (c5 / o1 - 1) * 100 - bm, r915: (c5 / c1 - 1) * 100 - bm, rawOpen: (c5 / o1 - 1) * 100, raw915: (c5 / c1 - 1) * 100, first15: (c1 / o1 - 1) * 100, rangeFirst: (h1 / l1 - 1) * 100 })
  }
}
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const av = (l, k) => l.reduce((s, x) => s + x[k], 0) / l.length
const st = l => l.length ? `n=${String(l.length).padStart(3)} 始値で買う 5日${fm(av(l, 'rawOpen')).padStart(7)}（超過${fm(av(l, 'rOpen'))}、勝率${(l.filter(x => x.rawOpen > 0).length / l.length * 100).toFixed(0)}%） | 9:15で買う 5日${fm(av(l, 'raw915')).padStart(7)}（超過${fm(av(l, 'r915'))}、勝率${(l.filter(x => x.raw915 > 0).length / l.length * 100).toFixed(0)}%） | 最初の15分の動き${fm(av(l, 'first15'))}` : 'n=0'
console.log('期間 2026-08-18〜。引け後の決算・修正で、次の寄り付きが+7%以上:', ev.length + missing, '件（うち9:00〜9:15に約定が無く買えなかった', missing, '件。+12%以上では', missingBig, '件）')
console.log('反応 +7〜12% ', st(ev.filter(x => x.react < 12)))
console.log('反応 +12%以上', st(ev.filter(x => x.react >= 12)))
console.log('反応 +20%以上', st(ev.filter(x => x.react >= 20)))
const big = ev.filter(x => x.react >= 12)
console.log('--- +12%以上を、最初の15分の動きで分ける（9:15に買う場合）')
for (const [lab, f] of [['15分で上げた（+1%以上）', x => x.first15 >= 1], ['ほぼ横ばい（±1%）', x => Math.abs(x.first15) < 1], ['15分で下げた（−1%以下）', x => x.first15 <= -1]]) console.log('  ' + lab.padEnd(16), st(big.filter(f)))
console.log('--- 例（+12%以上、新しい順に8件）')
for (const x of big.sort((a, b) => b.day.localeCompare(a.day)).slice(0, 8)) console.log(' ', x.day, x.code, '反応' + fm(x.react), '始値から5日' + fm(x.rawOpen), '9:15から5日' + fm(x.raw915), x.title.slice(0, 28))
