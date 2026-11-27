// 自社株買いの開示の中身（11/27 本人の希望：取得の割合の2%より、目的のほうが大事。目的ごとに、寄指の範囲で寄るかまで数える）
// lib_signals の企業の行動（kind: buyback、10年・約1,700件）について、IR BANK の開示一覧からその日の自社株買いの開示を探し、PDF の文字を保存する
// 使い方: node kabu-lens/research/fetch_buyback_pdfs.mjs → buyback_pdfs.json（gitignore。途中から再開できる）。{ "<コード>|<日付>": { url, title, text（先頭5000字） } }
// PDF の場所は f.irbank.net/pdf/<提出日>/<番号>.pdf（提出日は表題の日付。11/26 に番号の中の日付ではないと分かった）
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAll } from './swing/lib_signals.mjs'
import { isBuybackTitle } from '../../.claude/scripts/kabu-lens.mjs'
const file = new URL('./buyback_pdfs.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const curl = (url, outPath) => new Promise(res => {
  const args = ['-sS', '-L', '--fail', '--max-time', '40', '-A', UA, url]
  if (outPath) args.push('-o', outPath)
  const p = spawn('curl', args)
  const chunks = []
  p.stdout.on('data', d => chunks.push(d))
  p.on('close', st => res(st === 0 ? (outPath ? true : Buffer.concat(chunks).toString('utf-8')) : null))
})
const { events } = loadAll({ withSwing: false, withSmall: true })
const byCode = {}
for (const e of events.filter(e => e.kind === 'buyback')) (byCode[e.code] ||= []).push(e.date)
const todo = Object.keys(byCode).filter(c => byCode[c].some(d => !out[`${c}|${d}`]?.text))
console.error('銘柄', todo.length)
const tmp = mkdtempSync(join(tmpdir(), 'bpdf-'))
let n = 0
const worker = async w => {
  while (todo.length) {
    const c = todo.shift()
    const html = await curl(`https://irbank.net/${c}/ir`)
    if (!html) continue
    const links = []
    for (const m of html.matchAll(/title="[^"|]*\| ([^"]*?)（(\d{4})\/(\d{2})\/(\d{2}) [0-9:]+提出）" href="\/[0-9A-Z]+\/(\d+)"/g)) {
      const title = m[1].replace(/&amp;/g, '&')
      if (isBuybackTitle(title)) links.push({ date: `${m[2]}-${m[3]}-${m[4]}`, ymd: `${m[2]}${m[3]}${m[4]}`, id: m[5], title })
    }
    for (const d of byCode[c]) {
      const key = `${c}|${d}`
      if (out[key]?.text) continue
      const l = links.find(x => x.date === d)
      if (!l) { out[key] = { url: null, text: null }; continue }
      const url = `https://f.irbank.net/pdf/${l.ymd}/${l.id}.pdf`
      const pp = join(tmp, `${w}.pdf`)
      const ok = await curl(url, pp)
      const text = ok ? (spawnSync('pdftotext', ['-layout', '-l', '2', pp, '-'], { encoding: 'utf-8' }).stdout || '').slice(0, 5000) : null
      out[key] = { url, title: l.title, text }
      await new Promise(r => setTimeout(r, 250))
    }
    if (++n % 25 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', n) }
    await new Promise(r => setTimeout(r, 350))
  }
}
await Promise.all([worker(0), worker(1), worker(2)])
writeFileSync(file, JSON.stringify(out))
rmSync(tmp, { recursive: true, force: true })
const v = Object.values(out)
console.log('件', v.length, 'PDF の文字あり', v.filter(x => x.text).length)
