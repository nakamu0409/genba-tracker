import { fetchYahoo } from '../../.claude/scripts/kabu-lens.mjs'
import { writeFileSync, readFileSync } from 'node:fs'
const codes = [...new Set(JSON.parse(readFileSync(new URL('./codes.json', import.meta.url), 'utf-8')))]
const out = {}
const bench = (await fetchYahoo('1306.T', '10y')).bars
let n = 0
for (const c of codes) {
  try { out[c] = (await fetchYahoo(`${c}.T`, '10y')).bars; n++ } catch (e) { console.error(c, e.message) }
}
writeFileSync('bars.json', JSON.stringify({ bench, stocks: out }))
console.log('codes', codes.length, 'ok', n, 'bench bars', bench.length, bench[0].date, bench.at(-1).date)
