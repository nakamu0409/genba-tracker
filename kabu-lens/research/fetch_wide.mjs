// 売買の多い約1,400銘柄の日足10年分を取る（買える値段の株で、好材料の窓開けが効くかを調べるため）
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const market = JSON.parse(readFileSync(new URL('./day/market.json', import.meta.url), 'utf-8'))
const codes = Object.entries(market).filter(([, v]) => ['東Ｐ', '東Ｓ', '東Ｇ'].includes(v.market) && v.price && v.volume && v.price * v.volume >= 5e7).map(([c]) => c)
async function get(code) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=10y&interval=1d`
  for (let k = 0; k < 3; k++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) })
      if (res.ok) return await res.json()
      if (res.status === 404) return null
    } catch { /* やり直す */ }
    const r = spawnSync('curl', ['-sS', '--fail', '--max-time', '30', '-A', 'Mozilla/5.0', url], { encoding: 'utf-8', maxBuffer: 1 << 27 })
    if (r.status === 0 && r.stdout) return JSON.parse(r.stdout)
    await new Promise(res => setTimeout(res, 1500 * (k + 1)))
  }
  return null
}
const rd = x => Math.round(x * 10) / 10
function daily(json) {
  const r = json?.chart?.result?.[0]; if (!r?.timestamp) return null
  const q = r.indicators.quote[0]; const out = []
  r.timestamp.forEach((ts, i) => {
    if (q.open[i] == null || q.close[i] == null || !(q.volume[i] > 0)) return
    out.push([new Date((ts + 32400) * 1000).toISOString().slice(0, 10), rd(q.open[i]), rd(q.high[i]), rd(q.low[i]), rd(q.close[i]), q.volume[i]])
  })
  return out
}
const out = {}; let next = 0, okN = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < codes.length) {
    const c = codes[next++]
    const d = daily(await get(c))
    if (d && d.length > 300) { out[c] = { name: market[c].name, market: market[c].market, d }; okN++ }
  }
}))
writeFileSync(new URL('./wide.json', import.meta.url), JSON.stringify(out))
console.log('codes', codes.length, 'ok', okN)
