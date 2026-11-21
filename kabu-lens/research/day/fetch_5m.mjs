// 売買の多い約1,150銘柄（記録帳の universe-wide.json と同じ）の「5分ごとの株価」直近60日分を取る（Yahoo が出す5分足は60日分まで）
// 使い方: node kabu-lens/research/day/fetch_5m.mjs <universe-wide.json>   → five.json（途中から再開できる）
// five.json: { code: { date: [[分(9:00=540), o, h, l, c, v], ...] } }
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const list = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const out = new URL('./five.json', import.meta.url)
const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : {}
const J = 9 * 3600

function get(code) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=60d&interval=5m`
  for (let k = 0; k < 3; k++) {
    const r = spawnSync('curl', ['-sS', '--fail', '--max-time', '30', '-A', 'Mozilla/5.0', url], { encoding: 'utf-8', maxBuffer: 1 << 27 })
    if (r.status === 0 && r.stdout) {
      try {
        return JSON.parse(r.stdout)
      } catch { /* やり直す */ }
    }
    if (/404/.test(r.stderr || '')) return null
    spawnSync('sleep', [String(1.5 * (k + 1))])
  }
  return null
}

function compact(json) {
  const r = json?.chart?.result?.[0]
  if (!r?.timestamp) return null
  const q = r.indicators.quote[0]
  const days = {}
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i] ?? 0
    if (o == null || c == null || h == null || l == null) return
    const d = new Date((ts + J) * 1000)
    const date = d.toISOString().slice(0, 10)
    const m = d.getUTCHours() * 60 + d.getUTCMinutes()
    if (m < 540 || m >= 930) return
    ;(days[date] ||= []).push([m, o, h, l, c, v])
  })
  return days
}

let n = 0
for (const { code } of list) {
  if (data[code] !== undefined) continue
  data[code] = compact(get(code))
  if (++n % 25 === 0) {
    writeFileSync(out, JSON.stringify(data))
    console.log(n, code)
  }
}
writeFileSync(out, JSON.stringify(data))
console.log('done', Object.keys(data).length)
