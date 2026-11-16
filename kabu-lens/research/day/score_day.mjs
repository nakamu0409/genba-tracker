// 危険度スコアの検証: 点数が高いほど、後場に大きく下げる割合が本当に高いか
import { readFileSync } from 'node:fs'
import { chaseRisk } from '../../../.claude/scripts/kabu-lens.mjs'
const ev = JSON.parse(readFileSync(new URL('./events.json', import.meta.url), 'utf-8'))
const dates = [...new Set(ev.map(x => x.date))].sort(); const SPLIT = dates[Math.floor(dates.length / 2)]
const pct = (l, p) => { const s = l.map(x => x.aft).sort((a, b) => a - b); return s[Math.floor(s.length * p)] }
const st = l => { const n = l.length; if (!n) return 'n=0'; return `n=${String(n).padStart(5)} 平均${(l.reduce((a, x) => a + x.aft, 0) / n).toFixed(2).padStart(6)}% 勝率${(l.filter(x => x.aft > 0).length / n * 100).toFixed(0)}% −3%以下${(l.filter(x => x.aft <= -3).length / n * 100).toFixed(0).padStart(3)}% −5%以下${(l.filter(x => x.aft <= -5).length / n * 100).toFixed(0).padStart(3)}% 悪い1割${pct(l, 0.1).toFixed(1).padStart(6)}% 良い1割${pct(l, 0.9).toFixed(1).padStart(5)}% 途中の最大下げ平均${(l.reduce((a, x) => a + x.mae, 0) / n).toFixed(1)}%` }
const scored = ev.map(x => ({ ...x, s: chaseRisk({ gainPct: x.gain, price: x.price, volSurge: x.volSurge, offHighPct: x.offHigh, run5Pct: x.run5, range20Pct: x.range20 }).score }))
for (const [lab, lo, hi] of [['0〜9', 0, 10], ['10〜19', 10, 20], ['20〜34', 20, 35], ['35〜49', 35, 50], ['50〜69', 50, 70], ['70以上', 70, 1000]]) {
  const l = scored.filter(x => x.s >= lo && x.s < hi)
  console.log(`点数 ${lab.padEnd(6)} 前半 ${st(l.filter(x => x.date < SPLIT))}\n            後半 ${st(l.filter(x => x.date >= SPLIT))}`)
}
for (const [lab, f] of [['低', x => x.s < 15], ['中', x => x.s >= 15 && x.s < 35], ['高', x => x.s >= 35]]) { const l = scored.filter(f); console.log(`危険度 ${lab}  全期間 ${st(l)}  割合${(l.length / scored.length * 100).toFixed(0)}%`) }
