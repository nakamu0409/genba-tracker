// 急落した株の反発（5日で−15%以下・25日線から−20%以下）を、消えた銘柄にも当てて、同じ期間（2024-08〜2026-08）の今ある銘柄と比べる
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_crash_delisted.mjs
import { readFileSync } from 'node:fs'
const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const FROM = '2024-08-28'
const TO = '2026-08-20'
function run(B) {
  const out = { crash: [], dev: [] }
  let sc = 0
  let st = 0
  for (let i = 0; i < B.length; i++) {
    sc += B[i].c
    st += B[i].c * B[i].v
    if (i >= 25) sc -= B[i - 25].c
    if (i >= 20) st -= B[i - 20].c * B[i - 20].v
    if (i < 30 || i + 5 >= B.length || B[i].date < FROM || B[i].date > TO) continue
    if (st / 20 < 1e8 || B[i].c < 100) continue
    const e = i + 1
    const r5 = (B[e + 4].c / B[e].o - 1) * 100
    if (B[i].c / B[i - 5].c <= 0.85) out.crash.push(r5)
    if (B[i].c <= (sc / 25) * 0.8) out.dev.push(r5)
  }
  return out
}
const live = { crash: [], dev: [] }
for (const w of Object.values(R('../wide.json'))) {
  const r = run((w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.c > 0))
  live.crash.push(...r.crash)
  live.dev.push(...r.dev)
}
const dead = { crash: [], dev: [] }
for (const x of Object.values(R('../jq_delisted.json'))) {
  const r = run(x.bars.map(b => ({ date: b.Date, o: +b.AdjO, h: +b.AdjH, l: +b.AdjL, c: +b.AdjC, v: +b.AdjVo })).filter(b => b.o > 0 && b.c > 0))
  dead.crash.push(...r.crash)
  dead.dev.push(...r.dev)
}
const m = a => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(2)
console.log('5日で−15%以下 → 翌日の寄りから5日（そのままの%）：今ある', live.crash.length, '件', m(live.crash), '／消えた', dead.crash.length, '件', m(dead.crash), '／合わせて', m(live.crash.concat(dead.crash)))
console.log('25日線から−20%以下 → 5日：今ある', live.dev.length, '件', m(live.dev), '／消えた', dead.dev.length, '件', m(dead.dev), '／合わせて', m(live.dev.concat(dead.dev)))
