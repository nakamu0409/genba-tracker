// 急騰の押し目（今の決まり）を、上場廃止などで消えた銘柄にも当てて、今ある銘柄と同じ期間（2024-08〜2026-08）で比べる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_delisted_surge.mjs
import { readFileSync } from 'node:fs'
import { surgePullback } from '../../../.claude/scripts/kabu-lens.mjs'
import { simulate, mean, fmt } from './lib_signals.mjs'

const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const FROM = '2024-08-28'
const TO = '2026-08-28'
function run(bars) {
  const out = []
  for (let L = 40; L < bars.length - 1; L++) {
    if (bars[L].date < FROM || bars[L].date > TO) continue
    let t = 0
    for (let k = Math.max(0, L - 19); k <= L; k++) t += bars[k].c * bars[k].v
    if (t / Math.min(20, L + 1) < 1e8) continue
    const s = surgePullback(bars.slice(Math.max(0, L - 60), L + 1))
    if (!s) continue
    const r = simulate(bars, L, s.stop, { rMult: 3, maxDays: 10 })
    if (r) out.push(r.r)
  }
  return out
}
const live = []
for (const w of Object.values(R('../wide.json'))) {
  const bars = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0)
  live.push(...run(bars))
}
const dead = []
for (const x of Object.values(R('../jq_delisted.json'))) {
  const bars = x.bars.map(b => ({ date: b.Date, o: +b.AdjO, h: +b.AdjH, l: +b.AdjL, c: +b.AdjC, v: +b.AdjVo })).filter(b => b.o > 0 && b.c > 0)
  dead.push(...run(bars))
}
const line = (n, a) => console.log(`${n.padEnd(16)} ${String(a.length).padStart(5)}件 平均${fmt(mean(a), 3)}R 勝率${(a.filter(x => x > 0).length / a.length * 100).toFixed(0)}%`)
line('今ある銘柄', live)
line('消えた銘柄', dead)
line('合わせて', live.concat(dead))
