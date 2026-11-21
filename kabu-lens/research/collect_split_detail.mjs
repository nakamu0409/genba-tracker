// 株式分割の開示 PDF の1ページ目から、分割の比率を取り出す（2026-11-21）
// 使い方: node kabu-lens/research/collect_split_detail.mjs   （途中から再開できる。1件ずつ間を空ける。約1〜2時間）
// 出力: research/split_detail.json（git に入れない）。{ "<code>|<date>|<time>": { id, ratio, yutai, div, err } }
// 取り出すもの：
//   ratio：分割の比率（1株につき N 株なら N。「1株を2株に」「1：3」も読む）
//   yutai：株主優待の変更・新設にふれているか、div：配当（増配・記念配当）にふれているか
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const irev = JSON.parse(readFileSync(new URL('./irevents.json', import.meta.url), 'utf-8'))
const file = new URL('./split_detail.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
// lib_signals.mjs の自社株買いの判定と同じ
const isB = t => /株式分割/.test(t) && !/(結果|延期|中止)/.test(t)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const curl = (url, outFile) => spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', '40', '-A', UA, ...(outFile ? ['-o', outFile] : []), url], { encoding: outFile ? 'buffer' : 'utf-8', maxBuffer: 1 << 27 })
const zen = s => s.replace(/[０-９．，％]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/，/g, ',')
function parse(text) {
  const t = zen(text).replace(/[ \t　]+/g, ' ')
  const r = {}
  const m = t.match(/1\s*株\s*(?:につき|を|に対し)[、,]?\s*([0-9]+(?:\.[0-9]+)?)\s*株/) || t.match(/1\s*[:：]\s*([0-9]+(?:\.[0-9]+)?)\s*の\s*(?:割合|比率)/)
  if (m) r.ratio = +m[1]
  r.yutai = /株主優待/.test(t)
  r.div = /(増配|記念配当|配当予想の修正)/.test(t)
  return r
}
const codes = Object.keys(irev).filter(c => Array.isArray(irev[c]) && irev[c].some(r => r && isB(r.title || '')))
let done = 0
for (const code of codes) {
  const want = irev[code].filter(r => r && isB(r.title || '') && !out[`${code}|${r.date}|${r.time}`])
  if (!want.length) continue
  const page = curl(`https://irbank.net/${code}/ir`)
  await sleep(800)
  if (page.status !== 0) continue
  const html = page.stdout
  const links = []
  for (const m of html.matchAll(/title="[^"|]*\| ([^"]*?)（(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})提出）" href="\/[^/]+\/(\d+)"/g)) links.push({ title: m[1].replace(/&amp;/g, '&'), date: `${m[2]}-${m[3]}-${m[4]}`, time: m[5], id: m[6] })
  for (const w of want) {
    const key = `${code}|${w.date}|${w.time}`
    const l = links.find(x => x.date === w.date && x.time === w.time && x.title === w.title) || links.find(x => x.date === w.date && x.time === w.time && isB(x.title))
    if (!l) { out[key] = { err: 'no_link' }; continue }
    const dir = mkdtempSync(join(tmpdir(), 'sp-'))
    const pdf = join(dir, 'a.pdf')
    const g = curl(`https://f.irbank.net/pdf/${w.date.replace(/-/g, '')}/${l.id}.pdf`, pdf)
    await sleep(1200)
    if (g.status !== 0) { out[key] = { id: l.id, err: 'pdf' }; rmSync(dir, { recursive: true, force: true }); continue }
    const txt = spawnSync('pdftotext', ['-l', '2', '-layout', pdf, '-'], { encoding: 'utf-8', maxBuffer: 1 << 26 })
    rmSync(dir, { recursive: true, force: true })
    out[key] = { id: l.id, ...(txt.status === 0 ? parse(txt.stdout) : { err: 'text' }) }
    if (++done % 25 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', done) }
  }
}
writeFileSync(file, JSON.stringify(out))
console.error('finished', Object.keys(out).length)
