// 寄り付き後15分（9:15）の時点で急騰・急落している株を、そこで買って引けで売ったらどうなったか。
// 昼の時点で作った危険度（chaseRisk・dipRisk）を、朝にそのまま当てはめて通用するかを確かめる。直近60日分。
import { readFileSync } from 'node:fs'
import { chaseRisk, dipRisk } from '../../../.claude/scripts/kabu-lens.mjs'
const data = JSON.parse(readFileSync(new URL('./open15.json', import.meta.url), 'utf-8'))
const allDates = [...new Set(Object.values(data).flatMap(d => d.map(x => x[0])))].sort()
const SPLIT = allDates[Math.floor(allDates.length / 2)]
const up = [], down = []
for (const [code, d] of Object.entries(data)) {
  for (let i = 21; i < d.length; i++) {
    const [date, , h1, l1, c1, v1, rl, rh, close, , , , mc] = d[i]
    const prev = d[i - 1][8]
    if (!(prev > 0) || !(c1 > 0)) continue
    const gain = (c1 / prev - 1) * 100
    if (Math.abs(gain) < 5) continue
    let mvAvg = 0, rg = 0
    for (let k = i - 20; k < i; k++) { mvAvg += d[k][9]; rg += (d[k][10] / d[k][11] - 1) * 100 }
    mvAvg /= 20; rg /= 20
    const f = { gainPct: gain, price: c1, volSurge: mvAvg > 0 ? v1 / mvAvg : null, offHighPct: (c1 / h1 - 1) * 100, offLowPct: (c1 / l1 - 1) * 100, run5Pct: (prev / d[i - 5][8] - 1) * 100, range20Pct: rg }
    const e = { code, date, ...f, aft: (close / c1 - 1) * 100, toNoon: (mc / c1 - 1) * 100, mae: (rl / c1 - 1) * 100, mfe: (rh / c1 - 1) * 100 }
    if (gain >= 5) up.push({ ...e, s: chaseRisk(f).score }); else down.push({ ...e, s: dipRisk(f).score })
  }
}
const pct = (l, p) => { const s = l.map(x => x.aft).sort((a, b) => a - b); return s[Math.floor(s.length * p)] }
const st = l => { const n = l.length; if (!n) return 'n=0'; return `n=${String(n).padStart(4)} 平均${(l.reduce((a, x) => a + x.aft, 0) / n).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}% −5%以下${(l.filter(x => x.aft <= -5).length / n * 100).toFixed(0).padStart(3)}% +3%以上${(l.filter(x => x.aft >= 3).length / n * 100).toFixed(0).padStart(3)}% 悪い1割${pct(l, 0.1).toFixed(1)}% 前場引けまで${(l.reduce((a, x) => a + x.toNoon, 0) / n).toFixed(2)}% 途中の最大下げ${(l.reduce((a, x) => a + x.mae, 0) / n).toFixed(1)}%` }
const show = (name, l) => console.log(name.padEnd(16), '前半', st(l.filter(x => x.date < SPLIT)), '\n' + ' '.repeat(17) + '後半', st(l.filter(x => x.date >= SPLIT)))
console.log('期間', allDates[0], '〜', allDates.at(-1), '境目', SPLIT)
for (const [nm, ev] of [['9:15に+5%以上', up], ['9:15に−5%以下', down]]) {
  console.log('\n==== ' + nm + ' ' + ev.length + '回'); show('全部', ev)
  for (const [lab, f] of [['危険度 低', x => x.s < 15], ['危険度 中', x => x.s >= 15 && x.s < 35], ['危険度 高', x => x.s >= 35]]) { const l = ev.filter(f); console.log(lab, '割合' + (l.length / ev.length * 100).toFixed(0) + '%'); show('', l) }
  const cut = (title, f, edges, labels) => { console.log('--- ' + title); labels.forEach((lab, k) => console.log('  ' + lab.padEnd(14), st(ev.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] })))) }
  cut('騰落の大きさ', x => Math.abs(x.gainPct), [5, 7, 10, 15, 1e9], ['5〜7%', '7〜10%', '10〜15%', '15%以上'])
  cut('株価', x => x.price, [0, 100, 300, 1000, 1e9], ['100円未満', '100〜300円', '300〜1,000円', '1,000円以上'])
  cut('最初の15分の出来高（普段の前場の何倍）', x => x.volSurge, [0, 0.3, 1, 3, 10, 1e9], ['0.3倍未満', '0.3〜1倍', '1〜3倍', '3〜10倍', '10倍以上'])
  cut('15分の高値から', x => x.offHighPct, [-100, -5, -3, -1, 0.001], ['−5%より下', '−5〜−3%', '−3〜−1%', '−1%以内'])
  cut('15分の安値から', x => x.offLowPct, [0, 1, 3, 5, 1e9], ['1%未満', '1〜3%', '3〜5%', '5%以上'])
  cut('直前5日', x => x.run5Pct, [-100, -15, -5, 5, 15, 30, 1e9], ['−15%より下', '−15〜−5%', '−5〜+5%', '+5〜15%', '+15〜30%', '+30%以上'])
  cut('普段の値幅', x => x.range20Pct, [0, 3, 5, 8, 1e9], ['3%未満', '3〜5%', '5〜8%', '8%以上'])
}
console.log('\n==== 全期間（通知に載せる数字）')
for (const [nm, ev] of [['up', up], ['down', down]]) for (const [lab, f] of [['LOW', x => x.s < 15], ['MID', x => x.s >= 15 && x.s < 35], ['HIGH', x => x.s >= 35]]) { const l = ev.filter(f); console.log(nm, lab, (l.length / ev.length * 100).toFixed(0) + '%', st(l)) }
