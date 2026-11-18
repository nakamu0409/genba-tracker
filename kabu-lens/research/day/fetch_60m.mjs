// 約1,150銘柄（universe-wide.json）の「1時間ごとの株価」約3年分（Yahoo の60分足は730日分の範囲。2023年11月から）。途中から再開できる
// 使い方: node kabu-lens/research/day/fetch_60m.mjs <universe-wide.json>  → hour.json { code: { date: [[分(9:00=540), o, h, l, c, v], ...] } }
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
const list = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const out = new URL('./hour.json', import.meta.url)
const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : {}
const J = 9 * 3600
const curl = url => new Promise(res => {
  const p = spawn('curl', ['-sS', '--fail', '--max-time', '40', '-A', 'Mozilla/5.0', url])
  let s = ''
  p.stdout.on('data', d => { s += d })
  p.on('close', code => res(code === 0 ? s : null))
})
async function get(code) {
  for (let k = 0; k < 3; k++) {
    const t = await curl(`https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=730d&interval=60m`)
    if (t) {
      try { return JSON.parse(t) } catch { /* やり直す */ }
    }
    await new Promise(r => setTimeout(r, 1500 * (k + 1)))
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
    if (m < 540 || m > 930) return // 15:30 は大引けの値
    ;(days[date] ||= []).push([m, o, h, l, c, v])
  })
  return days
}
const todo = list.map(x => x.code).filter(c => data[c] === undefined)
let n = 0
for (let i = 0; i < todo.length; i += 6) {
  await Promise.all(todo.slice(i, i + 6).map(async c => { data[c] = compact(await get(c)) }))
  n += 6
  if (n % 60 === 0) {
    writeFileSync(out, JSON.stringify(data))
    console.log(n, todo[i])
  }
}
writeFileSync(out, JSON.stringify(data))
console.log('done', Object.keys(data).length)
