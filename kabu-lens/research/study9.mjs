// 決算・業績修正の発表（IR BANK、2013年〜）のあと、「最初の株価の反応」が大きかった株は、その後も同じ向きに動くか。
// 引け後（15:00以降）の発表は、次の営業日の始値を「最初の反応」とし、そこで買う。
// 場中の発表は、その日の終値を「最初の反応」とし、次の営業日の始値で買う。
// 比べ方：同じ日に買った全イベントの平均ではなく、wide.json の全銘柄から同じ日の「いつでも買う」平均を引いた差（超過）。
import { readFileSync } from 'node:fs'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const hist = JSON.parse(readFileSync(new URL('./irhist.json', import.meta.url), 'utf-8'))
const SPLIT = '2020-01-01'
// 日ごとの「全銘柄の、その日の始値で買ってN日後」の平均（基準）
const baseSum = {}
for (const { d } of Object.values(wide)) {
  for (let e = 30; e + 20 < d.length; e++) {
    const k = d[e][0]; const o = d[e][1]; if (!(o > 0)) continue
    const b = baseSum[k] ||= { n: 0, r1: 0, r5: 0, r20: 0 }
    b.n++; b.r1 += (d[e][4] / o - 1) * 100; b.r5 += (d[e + 4][4] / o - 1) * 100; b.r20 += (d[e + 19][4] / o - 1) * 100
  }
}
const ev = []
for (const [code, rows] of Object.entries(hist)) {
  const d = wide[code]?.d; if (!d || !rows) continue
  const idx = new Map(d.map((x, i) => [x[0], i]))
  const seen = new Set()
  for (const r of rows) {
    if (!['1Q', '2Q', '3Q', '通期', '修正'].includes(r.kind)) continue
    const after = r.time >= '15:00'
    let i = idx.get(r.date)
    if (i === undefined) continue
    const e = after ? i + 1 : i + 1
    if (i < 25 || e + 20 >= d.length) continue
    const key = d[e][0] + r.kind.replace(/[1-4]Q|通期/, 'K'); if (seen.has(key)) continue; seen.add(key)
    let to = 0; for (let j = i - 20; j < i; j++) to += d[j][5] * d[j][4]; if (to / 20 < 5e7) continue
    const react = after ? (d[e][1] / d[i][4] - 1) * 100 : (d[i][4] / d[i - 1][4] - 1) * 100
    const o = d[e][1]; const b = baseSum[d[e][0]]; if (!b || b.n < 50) continue
    const r5 = (d[e + 4][4] / o - 1) * 100, r20 = (d[e + 19][4] / o - 1) * 100, r1 = (d[e][4] / o - 1) * 100
    ev.push({ code, date: d[e][0], kind: r.kind === '修正' ? (/上方/.test(r.title) ? '修正(上方)' : /下方/.test(r.title) ? '修正(下方)' : '修正') : '決算', react, price: o, ex1: r1 - b.r1 / b.n, ex5: r5 - b.r5 / b.n, ex20: r20 - b.r20 / b.n })
  }
}
const fm = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%'
const st = l => { const n = l.length; if (!n) return 'n=0'.padEnd(46); const a = k => l.reduce((s, x) => s + x[k], 0) / n; return `n=${String(n).padStart(5)} 超過1日${fm(a('ex1')).padStart(7)} 5日${fm(a('ex5')).padStart(7)} 20日${fm(a('ex20')).padStart(7)} 5日勝ち${(l.filter(x => x.ex5 > 0).length / n * 100).toFixed(0)}%` }
const show = (name, l) => console.log(name.padEnd(16), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
console.log('イベント', ev.length, '期間', ev.map(x => x.date).sort()[0], '〜', ev.map(x => x.date).sort().at(-1), '境目', SPLIT)
for (const k of ['決算', '修正', '修正(上方)', '修正(下方)']) show(k + ' 全部', ev.filter(x => x.kind === k))
const R = [[-100, -12], [-12, -7], [-7, -3], [-3, 0], [0, 3], [3, 7], [7, 12], [12, 1000]]
for (const k of [['決算', x => x.kind === '決算'], ['修正（向き問わず）', x => x.kind.startsWith('修正')]]) {
  console.log('--- ' + k[0] + '：最初の反応で分ける')
  for (const [lo, hi] of R) show(`  ${lo}〜${hi}%`, ev.filter(x => k[1](x) && x.react >= lo && x.react < hi))
}
console.log('--- 最初の反応 +12%以上（決算と修正）年ごと：超過5日')
const big = ev.filter(x => x.react >= 12)
for (let y = 2013; y <= 2026; y++) { const l = big.filter(x => x.date.startsWith(y)); if (l.length) console.log(' ', y, st(l)) }
console.log('--- 最初の反応 +12%以上：株価で分ける')
for (const [lo, hi, lab] of [[0, 300, '300円未満'], [300, 1000, '300〜1,000円'], [1000, 3000, '1,000〜3,000円'], [3000, 1e9, '3,000円以上']]) show('  ' + lab, big.filter(x => x.price >= lo && x.price < hi))
