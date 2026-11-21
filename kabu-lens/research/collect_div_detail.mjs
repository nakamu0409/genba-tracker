// 増配の開示 PDF の1〜2ページ目から、増配の幅を取り出す（2026-11-21）
// 使い方: node kabu-lens/research/collect_div_detail.mjs   （途中から再開できる。1件ずつ間を空ける。約1.5〜2時間）
// 出力: research/div_detail.json（git に入れない）。{ "<code>|<date>|<time>": { id, prev, now, up_pct, err } }
//   prev＝前回の予想（または直近の予想）の1株配当、now＝今回の額、up_pct＝(now ÷ prev − 1)×100。読めないときは up_pct なし
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const irev = JSON.parse(readFileSync(new URL('./irevents.json', import.meta.url), 'utf-8'))
const file = new URL('./div_detail.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const isB = t => /増配/.test(t) && !/(減配|無配|下方)/.test(t)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const curl = (url, outFile) => spawnSync('curl', ['-sS', '-L', '--fail', '--max-time', '40', '-A', UA, ...(outFile ? ['-o', outFile] : []), url], { encoding: outFile ? 'buffer' : 'utf-8', maxBuffer: 1 << 27 })
const zen = s => s.replace(/[０-９．，％]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/，/g, ',')
// 「28 円 00 銭」「28.5円」→ 28 / 28.5
const yen = line => [...line.matchAll(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*円(?:\s*([0-9]{1,2})\s*銭)?/g)].map(m => +m[1].replace(/,/g, '') + (m[2] ? +m[2] / 100 : 0))
function parse(text) {
  const lines = zen(text).replace(/[ \t　]+/g, ' ').split('\n')
  const r = {}
  // 修正の開示：「前回予想」「今回修正予想」の行の最初の額
  const prevL = lines.find(l => /(前回|直近)/.test(l) && /予想/.test(l) && yen(l).length)
  const nowL = lines.find(l => /(今回|修正後|決定)/.test(l) && yen(l).length && !/(前回|直近)/.test(l))
  if (prevL && nowL) {
    r.prev = yen(prevL)[0]
    r.now = yen(nowL)[0]
  } else {
    // 剰余金の配当の開示：「1株当たり配当金 28円 24円 60円」＝決定額・直近の予想・前期実績
    const l = lines.find(x => /1\s*株当たり配当金/.test(x) && yen(x).length >= 2)
    if (l) {
      const v = yen(l)
      r.now = v[0]
      r.prev = v[1]
    }
  }
  if (r.prev > 0 && r.now > 0) {
    const g = r.now / r.prev - 1
    if (g > 0 && g < 5) r.up_pct = Math.round(g * 1000) / 10
  }
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
    const dir = mkdtempSync(join(tmpdir(), 'dv-'))
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
