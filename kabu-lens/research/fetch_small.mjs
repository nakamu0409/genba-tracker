// wide.json に入っていない上場株（売買代金の小さい会社。J-Quants の一覧のプライム・スタンダード・グロース）の日足10年分と、IR BANK の開示一覧を取る
// （2026-11-23。企業の行動を小さい会社まで広げると稼げるか・立会外分売を確かめるため）
// 使い方: node kabu-lens/research/fetch_small.mjs daily   → wide_small.json（途中から再開できる）
//         node kabu-lens/research/fetch_small.mjs ir      → irevents2.json（wide と wide_small の全部。立会外分売・決算も入れる。途中から再開できる）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const curl = (url, t = 30) => new Promise(res => {
  const p = spawn('curl', ['-sS', '-L', '--fail', '--max-time', String(t), '-A', UA, url])
  const ch = []
  p.stdout.on('data', d => ch.push(d))
  p.on('close', st => res(st === 0 ? Buffer.concat(ch).toString('utf-8') : null))
})
const mode = process.argv[2]
const master = R('./jq_master.json')
const wide = R('./wide.json')
if (mode === 'daily') {
  const file = new URL('./wide_small.json', import.meta.url)
  const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
  const todo = master.last.filter(x => ['プライム', 'スタンダード', 'グロース'].includes(x.MktNm)).map(x => [x.Code.slice(0, 4), x.CoName, x.MktNm]).filter(([c]) => !(c in wide) && !(c in out))
  const rd = x => Math.round(x * 10) / 10
  let n = 0
  const worker = async () => {
    while (todo.length) {
      const [c, name, mkt] = todo.shift()
      const txt = await curl(`https://query1.finance.yahoo.com/v8/finance/chart/${c}.T?range=10y&interval=1d`)
      let d = null
      try {
        const r = JSON.parse(txt).chart.result[0]
        const q = r.indicators.quote[0]
        d = []
        r.timestamp.forEach((ts, i) => {
          if (q.open[i] == null || q.close[i] == null || !(q.volume[i] > 0)) return
          d.push([new Date((ts + 32400) * 1000).toISOString().slice(0, 10), rd(q.open[i]), rd(q.high[i]), rd(q.low[i]), rd(q.close[i]), q.volume[i]])
        })
      } catch { d = null }
      out[c] = d && d.length > 300 ? { name, market: mkt, d } : null
      if (++n % 100 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('daily', n, 'left', todo.length) }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  writeFileSync(file, JSON.stringify(out))
  console.log('ok', Object.values(out).filter(Boolean).length, '/', Object.keys(out).length)
} else if (mode === 'ir') {
  const small = existsSync(new URL('./wide_small.json', import.meta.url)) ? R('./wide_small.json') : {}
  const codes = [...Object.keys(wide), ...Object.keys(small).filter(c => small[c])]
  const file = new URL('./irevents2.json', import.meta.url)
  const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
  const KEEP = /自己株式|自社株|株式分割|株主優待|配当|分売|決算|業績予想/
  const todo = codes.filter(c => !(c in out))
  let n = 0
  const worker = async () => {
    while (todo.length) {
      const c = todo.shift()
      const html = await curl(`https://irbank.net/${c}/ir`)
      if (html === null) { out[c] = null; continue }
      const rows = []
      const seen = new Set()
      for (const m of html.matchAll(/title="[^"|]*\| ([^"]*?)（(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})提出）"/g)) {
        const title = m[1].replace(/&amp;/g, '&')
        if (!KEEP.test(title)) continue
        const key = m[2] + m[3] + m[4] + title
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ date: `${m[2]}-${m[3]}-${m[4]}`, time: m[5], title })
      }
      out[c] = rows
      if (++n % 50 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('ir', Object.keys(out).length, '/', codes.length) }
      await new Promise(r => setTimeout(r, 400))
    }
  }
  await Promise.all([worker(), worker(), worker()])
  writeFileSync(file, JSON.stringify(out))
  console.log('ok', Object.values(out).filter(Boolean).length)
}
