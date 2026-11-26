// IR BANK の適時開示一覧（2013年ごろから）から、企業の行動の開示（自社株買い・株式分割・優待・配当）の日時と表題を集める
// 使い方: node kabu-lens/research/fetch_irevents.mjs   （wide.json の銘柄すべて。途中から再開できる。約15〜20分）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const codes = Object.keys(wide)
const file = new URL('./irevents.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const KEEP = /自己株式|自社株|株式分割|株主優待|配当/
const get = code => new Promise(res => {
  const p = spawn('curl', ['-sS', '-L', '--fail', '--max-time', '30', '-A', UA, `https://irbank.net/${code}/ir`])
  const chunks = []
  p.stdout.on('data', d => chunks.push(d))
  p.on('close', st => res(st === 0 ? Buffer.concat(chunks).toString('utf-8') : null))
})
const todo = codes.filter(c => !(c in out))
let n = 0
const worker = async () => {
  while (todo.length) {
    const c = todo.shift()
    const html = await get(c)
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
    if (++n % 50 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', Object.keys(out).length, '/', codes.length) }
    await new Promise(r => setTimeout(r, 400))
  }
}
await Promise.all([worker(), worker(), worker()])
writeFileSync(file, JSON.stringify(out))
const rows = Object.values(out).filter(Boolean).flat()
console.log('銘柄', Object.values(out).filter(Boolean).length, '行', rows.length, '自社株買いの決定', rows.filter(r => /自己株式.*取得.*(決定|事項)/.test(r.title) && !/取得状況|結果|終了|完了/.test(r.title)).length)
