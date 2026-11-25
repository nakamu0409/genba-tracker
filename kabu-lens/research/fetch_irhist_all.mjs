// IR BANK の銘柄ページから、決算発表・業績修正の日時と表題の一覧（2013年ごろから）を取る
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const all = Object.keys(wide)
const N = Number(process.argv[2] || 700)
const codes = all.filter((c, i) => i % Math.max(1, Math.floor(all.length / N)) === 0).slice(0, N)
const file = new URL('./irhist_all.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const strip = t => String(t ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
let n = 0
for (const c of codes) {
  if (out[c]) continue
  const r = spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', '25', '-A', UA, `https://irbank.net/${c}`], { encoding: 'utf-8', maxBuffer: 1 << 26 })
  if (r.status !== 0) { out[c] = null; continue }
  const t = (r.stdout.match(/<table[\s\S]*?<\/table>/g) || []).find(x => x.includes('提出日') && x.includes('区分')) || ''
  const rows = []
  for (const tr of t.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))
    if (td.length >= 4 && /^\d{4}\/\d{2}\/\d{2}$/.test(td[0])) rows.push({ date: td[0].replace(/\//g, '-'), time: td[1], kind: td[2], title: td[3] })
  }
  out[c] = rows; n++
  if (n % 50 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', Object.keys(out).length) }
  await new Promise(res => setTimeout(res, 600))
}
writeFileSync(file, JSON.stringify(out))
const rows = Object.values(out).filter(Boolean).flat()
console.log('銘柄', Object.values(out).filter(Boolean).length, '行', rows.length, '修正', rows.filter(x => x.kind === '修正').length, '上方', rows.filter(x => /上方修正/.test(x.title)).length, '下方', rows.filter(x => /下方修正/.test(x.title)).length)
