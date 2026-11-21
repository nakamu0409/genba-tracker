// study9 の続き：最初の反応が大きい決算・修正を、実際に買える形で確かめる。
// A: 反応が出た日の次の営業日の始値で買う（study9 と同じ）
// B: 1日遅らせて、その次の営業日の始値で買う（夜の通知を見てから買う形）
// どちらも、損切り（買値 − ATR×2）つきで5日・20日持つ。手数料・値段のずれは入っていない。
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const hist = JSON.parse(readFileSync(new URL('./irhist.json', import.meta.url), 'utf-8'))
const SPLIT = '2020-01-01'
const base = {}
for (const { d } of Object.values(wide)) for (let e = 30; e + 20 < d.length; e++) { const b = base[d[e][0]] ||= { n: 0, r5: 0, r20: 0 }; const o = d[e][1]; if (!(o > 0)) continue; b.n++; b.r5 += (d[e + 4][4] / o - 1) * 100; b.r20 += (d[e + 19][4] / o - 1) * 100 }
const ev = []
for (const [code, rows] of Object.entries(hist)) {
  const d = wide[code]?.d; if (!d || !rows) continue
  const idx = new Map(d.map((x, i) => [x[0], i]))
  const atr = new Array(d.length).fill(null); let a = null; const tr = []
  for (let i = 1; i < d.length; i++) { const t = Math.max(d[i][2] - d[i][3], Math.abs(d[i][2] - d[i - 1][4]), Math.abs(d[i][3] - d[i - 1][4])); tr.push(t); a = a === null ? (tr.length === 14 ? tr.reduce((x, y) => x + y, 0) / 14 : null) : (a * 13 + t) / 14; atr[i] = a }
  const seen = new Set()
  for (const r of rows) {
    if (!['1Q', '2Q', '3Q', '通期', '修正'].includes(r.kind)) continue
    const i = idx.get(r.date); if (i === undefined || i < 25) continue
    const after = r.time >= '15:00'
    const e = i + 1
    if (e + 22 >= d.length || seen.has(d[e][0])) continue; seen.add(d[e][0])
    let to = 0; for (let j = i - 20; j < i; j++) to += d[j][5] * d[j][4]; if (to / 20 < 5e7) continue
    const react = after ? (d[e][1] / d[i][4] - 1) * 100 : (d[i][4] / d[i - 1][4] - 1) * 100
    if (react < 7) continue
    const run = (s, hold) => { const o = d[s][1], stop = o - 2 * atr[s - 1]; for (let k = s; k < s + hold; k++) { if (d[k][3] <= stop) return (Math.min(d[k][1], stop) / o - 1) * 100 } return (d[s + hold - 1][4] / o - 1) * 100 }
    const mk = (s) => { const b = base[d[s][0]]; return { r5: (d[s + 4][4] / d[s][1] - 1) * 100, ex5: (d[s + 4][4] / d[s][1] - 1) * 100 - (b && b.n ? b.r5 / b.n : 0), s5: run(s, 5), s20: run(s, 20), ex20: (d[s + 19][4] / d[s][1] - 1) * 100 - (b && b.n ? b.r20 / b.n : 0) } }
    const [, eo, eh, el, ec] = d[e]
    const stuck = eh - el <= eh * 0.002 // 1日じゅう値幅が無い＝張り付きで買えなかった可能性
    const openAtHigh = eo >= eh * 0.999 // 始値がその日の高値＝ストップ高で寄った可能性
    ev.push({ date: d[e][0], react, price: d[e][1], stuck, openAtHigh, A: mk(e), B: mk(e + 1), gap2: (d[e + 1][1] / d[e][4] - 1) * 100 })
  }
}
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const av = (l, f) => l.reduce((s, x) => s + f(x), 0) / l.length
const st = (l, k) => l.length ? `n=${String(l.length).padStart(4)} 5日${fm(av(l, x => x[k].r5)).padStart(7)}（超過${fm(av(l, x => x[k].ex5))}） 損切りつき5日${fm(av(l, x => x[k].s5)).padStart(7)} 勝率${(l.filter(x => x[k].s5 > 0).length / l.length * 100).toFixed(0)}% 損切りつき20日${fm(av(l, x => x[k].s20)).padStart(7)}（超過${fm(av(l, x => x[k].ex20))}）` : 'n=0'
for (const [lab, lo, hi] of [['反応 +7〜12%', 7, 12], ['反応 +12%以上', 12, 1e9], ['反応 +20%以上', 20, 1e9]]) {
  const l = ev.filter(x => x.react >= lo && x.react < hi)
  for (const k of ['A', 'B']) console.log(lab.padEnd(12), k === 'A' ? '翌日の始値で買う  ' : '1日遅れて買う    ', '前半', st(l.filter(x => x.date < SPLIT), k), '\n' + ' '.repeat(33) + '後半', st(l.filter(x => x.date >= SPLIT), k))
}
const big = ev.filter(x => x.react >= 12)
console.log('反応+12%以上で、翌日さらに窓を開けた（+3%以上）もの / 開けなかったもの（1日遅れて買う場合）')
console.log('  窓あり', st(big.filter(x => x.gap2 >= 3), 'B')); console.log('  窓なし', st(big.filter(x => x.gap2 < 3), 'B'))

console.log('--- 張り付き・高値寄りを除いた場合（反応+12%以上、翌日の始値で買う）')
const b12 = ev.filter(x => x.react >= 12)
console.log('  張り付き', b12.filter(x => x.stuck).length, '件 / 始値が高値（張り付きを除く）', b12.filter(x => !x.stuck && x.openAtHigh).length, '件 / 全体', b12.length, '件')
for (const [lab, f] of [['張り付きだけ', x => x.stuck], ['始値が高値（張り付き以外）', x => !x.stuck && x.openAtHigh], ['どちらでもない（ふつうに買えた）', x => !x.stuck && !x.openAtHigh]]) { const l = b12.filter(f); console.log('  ' + lab.padEnd(18), '前半', st(l.filter(x => x.date < SPLIT), 'A'), '\n' + ' '.repeat(22) + '後半', st(l.filter(x => x.date >= SPLIT), 'A')) }
const b7 = ev.filter(x => x.react >= 7 && x.react < 12 && !x.stuck && !x.openAtHigh)
console.log('  反応+7〜12%（ふつうに買えたもの）前半', st(b7.filter(x => x.date < SPLIT), 'A'), '\n' + ' '.repeat(22) + '後半', st(b7.filter(x => x.date >= SPLIT), 'A'))
const ok12 = b12.filter(x => !x.stuck && !x.openAtHigh)
console.log('  ふつうに買えた+12%以上 年ごと（損切りつき5日）')
for (let y = 2017; y <= 2026; y++) { const l = ok12.filter(x => x.date.startsWith(y)); if (l.length) console.log('   ', y, 'n=' + l.length, fm(av(l, x => x.A.s5)), '超過' + fm(av(l, x => x.A.ex5))) }
