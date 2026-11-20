// J-Quants（V2・Free：2年分・12週遅れ）から、日付ごとに財務のまとめ（fins/summary）と全銘柄の日足（equities/bars/daily）を取ってためる
// キーは環境の通信の設定で自動で付く（コードには書かない）。Free は1分5回なので13秒あける。途中で止まっても続きから取る
// 使い方: node kabu-lens/research/collect_jquants.mjs 2024-08-28 2026-08-28
// 保存先: research/jq_fins.json（日付 → 開示の配列）、research/jq_daily.json（日付 → 全銘柄の日足の配列）、research/jq_master.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const [from, to] = process.argv.slice(2)
const BASE = 'https://api.jquants.com/v2/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let last = 0
async function get(path) {
  const out = []
  let key = null
  do {
    const wait = 13000 - (Date.now() - last)
    if (wait > 0) await sleep(wait)
    last = Date.now()
    const url = BASE + path + (key ? `&pagination_key=${encodeURIComponent(key)}` : '')
    const r = spawnSync('curl', ['-s', '--max-time', '60', url], { encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024 })
    let j
    try {
      j = JSON.parse(r.stdout)
    } catch {
      throw new Error(`読めない応答 ${path}: ${String(r.stdout).slice(0, 120)}`)
    }
    if (!j.data) throw new Error(`${path}: ${j.message || JSON.stringify(j).slice(0, 120)}`)
    out.push(...j.data)
    key = j.pagination_key || null
  } while (key)
  return out
}
const load = f => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf-8')) : {})
const fF = new URL('./jq_fins.json', import.meta.url)
const fD = new URL('./jq_daily.json', import.meta.url)
const fM = new URL('./jq_master.json', import.meta.url)
const fins = load(fF)
const daily = load(fD)
if (!existsSync(fM)) {
  // 期間の最初と最後の銘柄一覧（あとで上場廃止の銘柄を見分ける）
  writeFileSync(fM, JSON.stringify({ first: await get(`equities/master?date=${from}`), last: await get(`equities/master?date=${to}`) }))
  console.log('master saved')
}
const days = []
for (const d = new Date(from + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
  if (![0, 6].includes(d.getUTCDay())) days.push(d.toISOString().slice(0, 10))
}
for (const [name, store, file, path] of [['fins', fins, fF, 'fins/summary?date='], ['daily', daily, fD, 'equities/bars/daily?date=']]) {
  let n = 0
  for (const day of days) {
    if (store[day]) continue
    try {
      store[day] = await get(path + day)
    } catch (e) {
      console.log(name, day, e.message)
      if (/subscription|limit|Too Many/i.test(e.message)) await sleep(60000)
      continue
    }
    if (++n % 10 === 0) {
      writeFileSync(file, JSON.stringify(store))
      console.log(name, day, Object.keys(store).length, '日')
    }
  }
  writeFileSync(file, JSON.stringify(store))
  console.log(name, 'done', Object.keys(store).length, '日')
}
