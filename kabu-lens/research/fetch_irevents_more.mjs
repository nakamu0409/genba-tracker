// IR BANK の適時開示一覧（2013年ごろから）から、業務提携・受注・中期経営計画・公開買付け（TOB）・配当方針の開示の日時と表題を集める（11/25 本人の希望。fetch_irevents.mjs と同じ作り）
// 使い方: node kabu-lens/research/fetch_irevents_more.mjs   （wide.json の銘柄すべて。途中から再開できる。約15〜20分）
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawn } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const codes = Object.keys(wide)
const file = new URL('./irevents_more.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const KEEP = /業務提携|資本提携|資本業務提携|受注|中期経営計画|公開買付け|公開買付|累進配当|配当方針|株主還元/
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
console.log('銘柄', Object.values(out).filter(Boolean).length, '行', rows.length)
