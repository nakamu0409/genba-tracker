// 売買の多い銘柄の「15分ごとの株価」直近60日分を取り、寄り付き後15分とその後に分けて保存する（Yahoo が出すのは60日分まで）
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const market = JSON.parse(readFileSync(new URL('./market.json', import.meta.url), 'utf-8'))
const codes = Object.entries(market).filter(([, v]) => ['東Ｐ', '東Ｓ', '東Ｇ'].includes(v.market) && v.price && v.volume && v.price * v.volume >= 5e7).map(([c]) => c)
const J = 9 * 3600
async function get(code) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=60d&interval=15m`
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
    const d = new Date((ts + J) * 1000); const date = d.toISOString().slice(0, 10); const hm = d.getUTCHours() * 60 + d.getUTCMinutes()
    const x = days.get(date) || { date, f: null, rl: Infinity, rh: -Infinity, mv: 0, dh: -Infinity, dl: Infinity, mc: null, c: null }
    if (hm === 540) x.f = { o, h, l, c, v }
    else { x.rl = Math.min(x.rl, l); x.rh = Math.max(x.rh, h) }
    if (hm < 720) { x.mv += v; x.mc = c }
    x.dh = Math.max(x.dh, h); x.dl = Math.min(x.dl, l); x.c = c
    days.set(date, x)
  })
  // [日付, 最初の15分の始値, 高値, 安値, 終値, 出来高, その後の安値, その後の高値, 終値, 前場の出来高, 1日の高値, 1日の安値, 前場終値]
  return [...days.values()].filter(x => x.f && x.mc != null && Number.isFinite(x.rl)).map(x => [x.date, x.f.o, x.f.h, x.f.l, x.f.c, x.f.v, x.rl, x.rh, x.c, x.mv, x.dh, x.dl, x.mc])
}
const out = {}; let next = 0, okN = 0
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < codes.length) {
    const c = codes[next++]
    const d = daily(await get(c))
    if (d && d.length > 25) { out[c] = d; okN++ }
    if ((okN % 200) === 0 && d) console.error('done', okN, 'of', codes.length)
  }
}))
writeFileSync(new URL('./open15.json', import.meta.url), JSON.stringify(out))
console.log('codes', codes.length, 'ok', okN, 'days(example)', Object.values(out)[0]?.length)
