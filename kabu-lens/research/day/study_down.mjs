// 前場に急落した株を、昼に買ったらどうなったか。どんな特徴の株が、さらに崩れやすかったか
import { readFileSync, writeFileSync } from 'node:fs'
const data = JSON.parse(readFileSync(new URL('./intraday.json', import.meta.url), 'utf-8'))
const allDates = [...new Set(Object.values(data).flatMap(d => d.map(x => x[0])))].sort()
const SPLIT = allDates[Math.floor(allDates.length / 2)]
const ev = []
for (const [code, d] of Object.entries(data)) {
  for (let i = 21; i < d.length; i++) {
    const [date, mo, , ml, mc, mv, ao, ah, al, ac] = d[i]
    const prev = d[i - 1][9]
    if (!(prev > 0) || !(ao > 0) || !(mc > 0)) continue
    const drop = (mc / prev - 1) * 100
    if (drop > -5) continue
    let mvAvg = 0, rg = 0
    for (let k = i - 20; k < i; k++) { mvAvg += d[k][5]; rg += (Math.max(d[k][2], d[k][7]) / Math.min(d[k][3], d[k][8]) - 1) * 100 }
    mvAvg /= 20; rg /= 20
    const next = d[i + 1]
    ev.push({
      code, date, aft: (ac / ao - 1) * 100, mae: (al / ao - 1) * 100, mfe: (ah / ao - 1) * 100,
      overnight: next ? (next[1] / ac - 1) * 100 : null,
      drop, gapShare: ((mo / prev - 1) * 100) / drop, offLow: (mc / ml - 1) * 100, price: mc,
      volSurge: mvAvg > 0 ? mv / mvAvg : null, run5: (prev / d[i - 5][9] - 1) * 100, range20: rg
    })
  }
}
writeFileSync(new URL('./events_down.json', import.meta.url), JSON.stringify(ev))
const st = l => { const n = l.length; if (!n) return 'n=0'; return `n=${String(n).padStart(5)} 平均${(l.reduce((a, x) => a + x.aft, 0) / n).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}% +3%以上${(l.filter(x => x.aft >= 3).length / n * 100).toFixed(0).padStart(3)}%` }
const show = (name, l) => console.log(name.padEnd(20), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
console.log('境目', SPLIT, '急落の回数', ev.length)
show('前場−5%以下の全部', ev)
const on = ev.filter(x => x.overnight != null)
console.log('  引け→翌朝の始値 平均', (on.reduce((a, x) => a + x.overnight, 0) / on.length).toFixed(2), '%')
const cut = (title, f, edges, labels) => { console.log('--- ' + title); labels.forEach((lab, k) => show('  ' + lab, ev.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] }))) }
cut('前場の下げ幅', x => -x.drop, [5, 7, 10, 15, 1e9], ['−5〜7%', '−7〜10%', '−10〜15%', '−15%以上'])
cut('株価', x => x.price, [0, 100, 300, 1000, 3000, 1e9], ['100円未満', '100〜300円', '300〜1,000円', '1,000〜3,000円', '3,000円以上'])
cut('前場の出来高（普段の何倍）', x => x.volSurge, [0, 2, 5, 10, 30, 1e9], ['2倍未満', '2〜5倍', '5〜10倍', '10〜30倍', '30倍以上'])
cut('前場の安値からの戻り', x => x.offLow, [0, 0.5, 1.5, 3, 5, 1e9], ['安値圏(0.5%未満)', '0.5〜1.5%', '1.5〜3%', '3〜5%', '5%以上戻した'])
cut('下げのうち窓開けの割合', x => x.gapShare, [-10, 0.2, 0.5, 0.8, 10], ['寄り後に下げた', '20〜50%', '50〜80%', 'ほぼ窓開け'])
cut('直前5日間の動き', x => x.run5, [-100, -15, -5, 5, 15, 30, 1e9], ['−15%より下', '−15〜−5%', '−5〜+5%', '+5〜15%', '+15〜30%', '+30%以上'])
cut('普段の1日の値幅', x => x.range20, [0, 2, 3, 5, 8, 1e9], ['2%未満', '2〜3%', '3〜5%', '5〜8%', '8%以上'])
