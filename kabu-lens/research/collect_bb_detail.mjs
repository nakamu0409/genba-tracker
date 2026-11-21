// 自社株買い（取得の決定）の開示 PDF の1ページ目から、取得の規模・期間・方法を取り出す（2026-11-21）
// 使い方: node kabu-lens/research/collect_bb_detail.mjs   （途中から再開できる。1件ずつ間を空ける。約1〜2時間）
// 出力: research/bb_detail.json（git に入れない）。{ "<code>|<date>|<time>": { id, pct, amountOku, days, method, err } }
// 取り出すもの：
//   pct：取得しうる株式の総数の、発行済株式総数（自己株式を除く）に対する割合（％）。変更の開示は「変更後」（いちばん後ろ）の値
//   amountOku：取得価額の総額（億円）
//   days：取得期間の長さ（日）
//   method：市場買付／ToSTNeT／公開買付／信託／その他
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const irev = JSON.parse(readFileSync(new URL('./irevents.json', import.meta.url), 'utf-8'))
const file = new URL('./bb_detail.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
// lib_signals.mjs の自社株買いの判定と同じ
const isB = t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|経過|ToSTNeT|立会外)/.test(t)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const curl = (url, outFile) => spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', '40', '-A', UA, ...(outFile ? ['-o', outFile] : []), url], { encoding: outFile ? 'buffer' : 'utf-8', maxBuffer: 1 << 27 })
const zen = s => s.replace(/[０-９．，％]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/，/g, ',')
function parse(text) {
  const t = zen(text).replace(/[ \t　]+/g, ' ')
  const r = {}
  const pcts = [...t.matchAll(/割合\s*([0-9]+(?:\.[0-9]+)?)\s*[%％]/g)].map(m => +m[1])
  if (pcts.length) r.pct = pcts[pcts.length - 1]
  const am = [...t.matchAll(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(兆|億|百万)\s*円/g)]
  if (am.length) {
    const [, v, u] = am[am.length - 1]
    const n = +v.replace(/,/g, '')
    r.amountOku = u === '兆' ? n * 1e4 : u === '億' ? n : n / 100
  }
  const per = t.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*[～〜~から\-－]+\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/)
  if (per) r.days = Math.round((new Date(+per[4], per[5] - 1, +per[6]) - new Date(+per[1], per[2] - 1, +per[3])) / 864e5)
  r.method = /公開買付/.test(t) ? 'TOB' : /ToSTNeT|立会外/.test(t) ? 'ToSTNeT' : /信託/.test(t) ? '信託' : /市場買付|市場における|取引所における/.test(t) ? '市場' : 'その他'
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
    const dir = mkdtempSync(join(tmpdir(), 'bb-'))
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
