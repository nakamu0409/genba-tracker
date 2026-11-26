// 受注の開示の中身（11/26 本人の希望：寄りの%だけでなく内容を深く見る）
// irevents_more.json の受注（月次の受注実績は除く）について、IR BANK の開示一覧からその開示のページを探し、PDF の文字を取り出して保存する
// 使い方: node kabu-lens/research/fetch_order_pdfs.mjs   → order_pdfs.json（gitignore。途中から再開できる）
// 保存するもの：{ "<コード>|<日付>|<題名>": { url, text（先頭6000字） } }。金額・売上の読み取りは swing/study_order_size.mjs
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const ev = JSON.parse(readFileSync(new URL('./irevents_more.json', import.meta.url), 'utf-8'))
const file = new URL('./order_pdfs.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const MONTHLY = /月次|月度|受注実績|受注高|受注状況|受注残/
const isOrder = t => /受注/.test(t) && !/(訂正|損失|取消)/.test(t) && !MONTHLY.test(t)
const curl = (url, outPath) => new Promise(res => {
  const args = ['-sS', '-L', '--fail', '--max-time', '40', '-A', UA, url]
  if (outPath) args.push('-o', outPath)
  const p = spawn('curl', args)
  const chunks = []
  p.stdout.on('data', d => chunks.push(d))
  p.on('close', st => res(st === 0 ? (outPath ? true : Buffer.concat(chunks).toString('utf-8')) : null))
})
const byCode = {}
for (const [c, rows] of Object.entries(ev)) for (const r of rows || []) if (isOrder(r.title)) (byCode[c] ||= []).push(r)
const todo = Object.keys(byCode).filter(c => byCode[c].some(r => !out[`${c}|${r.date}|${r.title}`]?.text))
console.error('銘柄', todo.length, '件', Object.values(byCode).flat().length)
const tmp = mkdtempSync(join(tmpdir(), 'opdf-'))
let n = 0
const worker = async w => {
  while (todo.length) {
    const c = todo.shift()
    const html = await curl(`https://irbank.net/${c}/ir`)
    if (!html) continue
    for (const r of byCode[c]) {
      const key = `${c}|${r.date}|${r.title}`
      if (key in out && out[key].text) continue
      const [y, m, d] = r.date.split('-')
      const esc = r.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&(?:amp;)?')
      const mm = html.match(new RegExp(`title="[^"|]*\\| ${esc}（${y}/${m}/${d} [0-9:]+提出）" href="(/${c}/(\\d+))"`))
      if (!mm) { out[key] = { url: null, text: null }; continue }
      // PDF は f.irbank.net/pdf/<提出日>/<番号>.pdf（11/26 直した：番号の中の日付ではなく、表題の提出日。前は番号の日付を使い、6割が取れなかった）
      const id = mm[2]
      const url = `https://f.irbank.net/pdf/${y}${m}${d}/${id}.pdf`
      const pp = join(tmp, `${w}.pdf`)
      const ok = await curl(url, pp)
      let text = null
      if (ok) {
        const t = spawnSync('pdftotext', ['-layout', pp, '-'], { encoding: 'utf-8' })
        text = (t.stdout || '').slice(0, 6000)
      }
      out[key] = { url, text }
      await new Promise(r2 => setTimeout(r2, 300))
    }
    if (++n % 20 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', n) }
    await new Promise(r2 => setTimeout(r2, 400))
  }
}
await Promise.all([worker(0), worker(1), worker(2)])
writeFileSync(file, JSON.stringify(out))
rmSync(tmp, { recursive: true, force: true })
const v = Object.values(out)
console.log('件', v.length, 'PDF の文字あり', v.filter(x => x.text).length)
