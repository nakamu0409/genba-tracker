// J-Quants（Free）から、期間中に上場廃止などで消えた銘柄（jq_master の first にあって last に無い）の日足を、銘柄ごとに取る
// 全銘柄の日付ごとの取得は時間がかかりすぎるため、今ある銘柄は Yahoo（wide.json）を使い、消えた銘柄だけをここで足す
// 使い方: node kabu-lens/research/collect_delisted.mjs  → research/jq_delisted.json（コード → 日足の配列）。途中から続けられる
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const sleep = ms => new Promise(r => setTimeout(r, ms))
let last = 0
async function get(path) {
  const out = []
  let key = null
  do {
    const wait = 15500 - (Date.now() - last)
    if (wait > 0) await sleep(wait)
    last = Date.now()
    const url = 'https://api.jquants.com/v2/' + path + (key ? `&pagination_key=${encodeURIComponent(key)}` : '')
    const r = spawnSync('curl', ['-s', '--max-time', '60', url], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
    const j = JSON.parse(r.stdout || '{}')
    if (!j.data) throw new Error(j.message || 'no data')
    out.push(...j.data)
    key = j.pagination_key || null
  } while (key)
  return out
}
const m = JSON.parse(readFileSync(new URL('./jq_master.json', import.meta.url), 'utf-8'))
const now = new Set(m.last.map(x => x.Code))
const gone = m.first.filter(x => !now.has(x.Code))
const file = new URL('./jq_delisted.json', import.meta.url)
const db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
let n = 0
for (const x of gone) {
  if (db[x.Code]) continue
  try {
    db[x.Code] = { name: x.CoName, market: x.MktNm, s33: x.S33Nm, bars: await get(`equities/bars/daily?code=${x.Code}`) }
  } catch (e) {
    console.log(x.Code, e.message)
    if (/Rate limit/i.test(e.message)) await sleep(60000)
    continue
  }
  if (++n % 10 === 0) {
    writeFileSync(file, JSON.stringify(db))
    console.log(new Date().toISOString().slice(11, 16), Object.keys(db).length, '/', gone.length)
  }
}
writeFileSync(file, JSON.stringify(db))
console.log('done', Object.keys(db).length, '/', gone.length)
