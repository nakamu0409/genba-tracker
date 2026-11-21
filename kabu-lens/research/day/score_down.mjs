// 急落株の危険度スコアの検証: 点数が高いほど、後場にさらに大きく下げる割合が本当に高いか
import { readFileSync } from 'node:fs'
import { dipRisk } from '../../../.claude/scripts/kabu-lens.mjs'
const ev = JSON.parse(readFileSync(new URL('./events_down.json', import.meta.url), 'utf-8'))
const cnt = {}; for (const x of ev) cnt[x.date] = (cnt[x.date] || 0) + 1
const dates = [...new Set(ev.map(x => x.date))].sort(); const SPLIT = dates[Math.floor(dates.length / 2)]
const pct = (l, p) => { const s = l.map(x => x.aft).sort((a, b) => a - b); return s[Math.floor(s.length * p)] }
const st = l => { const n = l.length; if (!n) return 'n=0'; return `n=${String(n).padStart(5)} 平均${(l.reduce((a, x) => a + x.aft, 0) / n).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}% −5%以下${(l.filter(x => x.aft <= -5).length / n * 100).toFixed(0).padStart(3)}% +3%以上${(l.filter(x => x.aft >= 3).length / n * 100).toFixed(0).padStart(3)}% 悪い1割${pct(l, 0.1).toFixed(1)}% 最大下げ平均${(l.reduce((a, x) => a + x.mae, 0) / n).toFixed(1)}%` }
const sc = ev.map(x => ({ ...x, solo: cnt[x.date] < 50, s: dipRisk({ gainPct: x.drop, price: x.price, offLowPct: x.offLow, run5Pct: x.run5, range20Pct: x.range20 }).score }))
for (const [nm, set] of [['その株だけ下げた日', sc.filter(x => x.solo)], ['相場全体が崩れた日', sc.filter(x => !x.solo)], ['全部', sc]]) {
  console.log('== ' + nm)
  for (const [lab, f] of [['低', x => x.s < 15], ['中', x => x.s >= 15 && x.s < 35], ['高', x => x.s >= 35]]) {
    const l = set.filter(f)
    console.log(`${lab} 割合${(l.length / set.length * 100).toFixed(0).padStart(2)}% 前半 ${st(l.filter(x => x.date < SPLIT))}\n         後半 ${st(l.filter(x => x.date >= SPLIT))}\n         全期間 ${st(l)}`)
  }
}
