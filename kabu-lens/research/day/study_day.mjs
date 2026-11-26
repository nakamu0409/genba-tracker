// 前場に急騰した株に、昼に飛びついたらどうなったか。どんな特徴の株が危なかったか
import { readFileSync, writeFileSync } from 'node:fs'
const data = JSON.parse(readFileSync(new URL('./intraday.json', import.meta.url), 'utf-8'))
const allDates = [...new Set(Object.values(data).flatMap(d => d.map(x => x[0])))].sort()
const SPLIT = allDates[Math.floor(allDates.length / 2)]
const ev = []; const base = []
for (const [code, d] of Object.entries(data)) {
  for (let i = 21; i < d.length; i++) {
    const [date, mo, mh, ml, mc, mv, ao, ah, al, ac] = d[i]
    const prev = d[i - 1][9]
    if (!(prev > 0) || !(ao > 0) || !(mc > 0)) continue
    const aft = (ac / ao - 1) * 100
    if (i % 5 === 0) base.push({ date, aft })
    const gain = (mc / prev - 1) * 100
    if (gain < 5) continue
    let tv = 0, mvAvg = 0, rg = 0
    for (let k = i - 20; k < i; k++) { tv += (d[k][5] + d[k][10]) * d[k][9]; mvAvg += d[k][5]; rg += (Math.max(d[k][2], d[k][7]) / Math.min(d[k][3], d[k][8]) - 1) * 100 }
    tv /= 20; mvAvg /= 20; rg /= 20
    const next = d[i + 1]
    ev.push({
      code, date, aft, mae: (al / ao - 1) * 100, mfe: (ah / ao - 1) * 100, lunchGap: (ao / mc - 1) * 100,
      overnight: next ? (next[1] / ac - 1) * 100 : null,
      gain, gapShare: gain > 0 ? ((mo / prev - 1) * 100) / gain : 0, offHigh: (mc / mh - 1) * 100,
      pos: mh > ml ? (mc - ml) / (mh - ml) : 1, price: mc, turnover: tv, volSurge: mvAvg > 0 ? mv / mvAvg : null,
      run5: (prev / d[i - 5][9] - 1) * 100, gainVsRange: rg > 0 ? gain / rg : null, range20: rg
    })
  }
}
writeFileSync(new URL('./events.json', import.meta.url), JSON.stringify(ev))
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const st = l => { const n = l.length; if (!n) return 'n=0'; const m = l.reduce((a, x) => a + x.aft, 0) / n; return `n=${String(n).padStart(5)} 平均${m.toFixed(2).padStart(6)}% 中央${med(l.map(x => x.aft)).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}% −5%以下${(l.filter(x => x.aft <= -5).length / n * 100).toFixed(0).padStart(3)}% 最大下げ平均${(l.reduce((a, x) => a + x.mae, 0) / n).toFixed(1)}%` }
const show = (name, l) => console.log(name.padEnd(22), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
console.log('期間', allDates[0], '〜', allDates.at(-1), ' 前半/後半の境目', SPLIT, ' 急騰の回数', ev.length)
const bm = l => (l.reduce((a, x) => a + x.aft, 0) / l.length).toFixed(3)
console.log('基準（どの株でも後場の寄りで買って引けで売る）: 前半', bm(base.filter(x => x.date < SPLIT)), '% 後半', bm(base.filter(x => x.date >= SPLIT)), '%')
show('前場+5%以上の全部', ev)
console.log('  昼休みをはさんだ値動き（前場終値→後場始値）の平均', (ev.reduce((a, x) => a + x.lunchGap, 0) / ev.length).toFixed(2), '%  翌朝の始値まで持った場合（引け→翌朝）', (ev.filter(x => x.overnight != null).reduce((a, x) => a + x.overnight, 0) / ev.filter(x => x.overnight != null).length).toFixed(2), '%')
const cut = (title, f, edges, labels) => { console.log('\n--- ' + title); labels.forEach((lab, k) => show('  ' + lab, ev.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] }))) }
cut('前場の上げ幅', x => x.gain, [5, 7, 10, 15, 20, 1e9], ['+5〜7%', '+7〜10%', '+10〜15%', '+15〜20%', '+20%以上'])
cut('株価', x => x.price, [0, 100, 300, 1000, 3000, 1e9], ['100円未満', '100〜300円', '300〜1,000円', '1,000〜3,000円', '3,000円以上'])
cut('普段の売買代金（20日平均）', x => x.turnover, [0, 1e8, 5e8, 2e9, 1e10, 1e15], ['1億円未満', '1〜5億円', '5〜20億円', '20〜100億円', '100億円以上'])
cut('前場の出来高（普段の前場の何倍か）', x => x.volSurge, [0, 2, 5, 10, 30, 1e9], ['2倍未満', '2〜5倍', '5〜10倍', '10〜30倍', '30倍以上'])
cut('前場の高値からの下げ', x => x.offHigh, [-100, -8, -5, -3, -1, 0.0001], ['−8%より下', '−8〜−5%', '−5〜−3%', '−3〜−1%', '−1%以内（高値圏）'])
cut('上げのうち窓開けの割合', x => x.gapShare, [-10, 0.2, 0.5, 0.8, 10], ['寄り後に上げた(20%未満)', '20〜50%', '50〜80%', 'ほぼ窓開け(80%以上)'])
cut('直前5日間の上げ', x => x.run5, [-100, -5, 5, 15, 30, 1e9], ['−5%より下', '−5〜+5%', '+5〜15%', '+15〜30%', '+30%以上'])
cut('上げ幅が普段の値幅の何倍か', x => x.gainVsRange, [0, 1, 2, 3, 5, 1e9], ['1倍未満', '1〜2倍', '2〜3倍', '3〜5倍', '5倍以上'])
cut('普段の1日の値幅', x => x.range20, [0, 2, 3, 5, 8, 1e9], ['2%未満', '2〜3%', '3〜5%', '5〜8%', '8%以上'])
