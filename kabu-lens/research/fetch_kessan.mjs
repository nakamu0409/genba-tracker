// 株探の銘柄ニュース（決算カテゴリ）から、決算・業績修正の見出しと発表時刻を集める。
// 無料で見えるのは1銘柄あたり直近8件ほど（約2年ぶん）。それより前の月別アーカイブは取れなかった。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const codes = Object.keys(wide)
const file = new URL('./kessan.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const strip = t => String(t ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
function get(code) {
  const r = spawnSync('curl', ['-sS', '--fail', '--max-time', '25', '-A', UA, `https://kabutan.jp/stock/news?code=${code}&nmode=2`], { encoding: 'utf-8', maxBuffer: 1 << 26 })
  if (r.status !== 0) return null
  const table = r.stdout.match(/<table class="s_news_list[^"]*">([\s\S]*?)<\/table>/)?.[1]
  if (table === undefined) return []
  const rows = []
  for (const tr of table.split(/<tr>/).slice(1)) {
    const t = tr.match(/<time datetime="([^"]+)"/)?.[1]
    const title = strip(tr.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1])
    const ctg = strip(tr.match(/<div class="newslist_ctg[^"]*">([\s\S]*?)<\/div>/)?.[1])
    if (t && title) rows.push({ t: t.slice(0, 16), ctg, title })
  }
  return rows
}
let n = 0, fail = 0
for (const c of codes) {
  if (out[c]) continue
  const rows = get(c)
  if (rows === null) { fail++; await new Promise(r => setTimeout(r, 3000)); if (fail > 30) break; continue }
  out[c] = rows; n++
  if (n % 100 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', Object.keys(out).length) }
  await new Promise(r => setTimeout(r, 250))
}
writeFileSync(file, JSON.stringify(out))
const all = Object.values(out).flat()
console.log('銘柄', Object.keys(out).length, '見出し', all.length, '失敗', fail, '期間', all.map(x => x.t).sort()[0], '〜', all.map(x => x.t).sort().at(-1))
