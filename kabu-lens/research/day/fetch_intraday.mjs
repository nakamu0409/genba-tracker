// 売買の多い銘柄の「1時間ごとの株価」約3年分を取り、1日ごとに前場・後場へまとめて保存する
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const market = JSON.parse(readFileSync(new URL('./market.json', import.meta.url), 'utf-8'))
const codes = Object.entries(market).filter(([, v]) => ['東Ｐ', '東Ｓ', '東Ｇ'].includes(v.market) && v.price && v.volume && v.price * v.volume >= 5e7).map(([c]) => c)
const J = 9 * 3600
async function get(code) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=730d&interval=60m`
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
function daily(json) {
  const r = json?.chart?.result?.[0]; if (!r?.timestamp) return null
  const q = r.indicators.quote[0]; const days = new Map()
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i] ?? 0
    if (o == null || c == null) return
    const d = new Date((ts + J) * 1000); const date = d.toISOString().slice(0, 10); const hh = d.getUTCHours()
    const x = days.get(date) || { date, m: null, a: null }
    const part = hh < 12 ? 'm' : 'a'
    const p = x[part] || { o, h, l, c, v: 0 }
    p.h = Math.max(p.h, h); p.l = Math.min(p.l, l); p.c = c; p.v += v
    x[part] = p; days.set(date, x)
  })
  // [日付, 前場始値, 前場高値, 前場安値, 前場終値, 前場出来高, 後場始値, 後場高値, 後場安値, 後場終値, 後場出来高]
  return [...days.values()].filter(x => x.m && x.a).map(x => [x.date, x.m.o, x.m.h, x.m.l, x.m.c, x.m.v, x.a.o, x.a.h, x.a.l, x.a.c, x.a.v])
}
const out = {}; let next = 0, okN = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < codes.length) {
    const c = codes[next++]
    const d = daily(await get(c))
    if (d && d.length > 60) { out[c] = d; okN++ }
    if ((okN % 200) === 0 && d) console.error('done', okN, 'of', codes.length)
  }
}))
writeFileSync(new URL('./intraday.json', import.meta.url), JSON.stringify(out))
console.log('codes', codes.length, 'ok', okN, 'days(example)', Object.values(out)[0]?.length)
