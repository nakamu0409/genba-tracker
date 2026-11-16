// 急落を「相場全体が崩れた日」と「その株だけ下げた日」に分けて、特徴がどちらでも効くかを見る
import { readFileSync } from 'node:fs'
const ev = JSON.parse(readFileSync(new URL('./events_down.json', import.meta.url), 'utf-8'))
const cnt = {}; for (const x of ev) cnt[x.date] = (cnt[x.date] || 0) + 1
const dates = [...new Set(ev.map(x => x.date))].sort(); const SPLIT = dates[Math.floor(dates.length / 2)]
const st = l => { const n = l.length; if (!n) return 'n=0'; return `n=${String(n).padStart(5)} 平均${(l.reduce((a, x) => a + x.aft, 0) / n).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}%` }
const big = Object.entries(cnt).filter(([, n]) => n >= 50).sort((a, b) => b[1] - a[1])
console.log('急落が50銘柄以上あった日', big.length, '日', big.slice(0, 8).map(([d, n]) => d + ':' + n).join(' '))
const solo = ev.filter(x => cnt[x.date] < 50), crash = ev.filter(x => cnt[x.date] >= 50)
console.log('その株だけ', st(solo), '\n全体が崩れた日', st(crash))
const show = (name, l) => console.log(name.padEnd(18), '前半', st(l.filter(x => x.date < SPLIT)), '| 後半', st(l.filter(x => x.date >= SPLIT)))
const cut = (title, f, edges, labels) => { console.log('--- ' + title + '（その株だけ下げた日）'); labels.forEach((lab, k) => show('  ' + lab, solo.filter(x => { const v = f(x); return v != null && v >= edges[k] && v < edges[k + 1] }))) }
show('その株だけ 全部', solo)
cut('下げ幅', x => -x.drop, [5, 7, 10, 15, 1e9], ['−5〜7%', '−7〜10%', '−10〜15%', '−15%以上'])
cut('株価', x => x.price, [0, 100, 300, 1e9], ['100円未満', '100〜300円', '300円以上'])
cut('出来高', x => x.volSurge, [0, 2, 5, 10, 1e9], ['2倍未満', '2〜5倍', '5〜10倍', '10倍以上'])
cut('安値からの戻り', x => x.offLow, [0, 0.5, 1.5, 3, 5, 1e9], ['0.5%未満', '0.5〜1.5%', '1.5〜3%', '3〜5%', '5%以上'])
cut('窓開けの割合', x => x.gapShare, [-10, 0.2, 0.5, 0.8, 10], ['寄り後に下げた', '20〜50%', '50〜80%', 'ほぼ窓開け'])
cut('直前5日', x => x.run5, [-100, -15, -5, 5, 15, 30, 1e9], ['−15%より下', '−15〜−5%', '−5〜+5%', '+5〜15%', '+15〜30%', '+30%以上'])
cut('普段の値幅', x => x.range20, [0, 3, 5, 8, 1e9], ['3%未満', '3〜5%', '5〜8%', '8%以上'])
