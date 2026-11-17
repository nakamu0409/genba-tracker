// IR BANK の「決算まとめ」から、年度ごとの売上・営業利益（実績）を取る（約10〜20年ぶん）。
// 四半期ごとの発表日は長く取れなかったので、年度の数字だけを使う。
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const wide = JSON.parse(readFileSync(new URL('./wide.json', import.meta.url), 'utf-8'))
const N = Number(process.argv[2] || 500)
const codes = Object.keys(wide).filter((c, i) => i % Math.max(1, Math.floor(Object.keys(wide).length / N)) === 0).slice(0, N)
const file = new URL('./irbank.json', import.meta.url)
const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const val = (t) => { // 「4.53億」「1.2兆」「139百万」「-0.07億」→ 億円
  const m = String(t).replace(/,/g, '').match(/^(-?[\d.]+)(兆|億|百万|万)?$/); if (!m) return null
  const v = Number(m[1]); return m[2] === '兆' ? v * 1e4 : m[2] === '百万' ? v / 100 : m[2] === '万' ? v / 1e4 : v
}
let n = 0
for (const c of codes) {
  if (out[c]) continue
  const r = spawnSync('curl', ['-sS', '--fail', '--max-time', '25', '-A', UA, `https://irbank.net/${c}/results`], { encoding: 'utf-8', maxBuffer: 1 << 26 })
  if (r.status !== 0) { out[c] = []; continue }
  const h = r.stdout.replace(/<script[\s\S]*?<\/script>/g, '')
  const t = h.match(/<table[\s\S]*?<\/table>/)?.[0] || ''
  const rows = []
  for (const tr of t.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
    const fy = cells[0]?.match(/^(\d{4})\/(\d{2})$/)
    if (!fy) continue // 「予」の行や見出しは除く
    rows.push({ fy: `${fy[1]}-${fy[2]}`, sales: val(cells[1]), op: val(cells[2]) })
  }
  out[c] = rows; n++
  if (n % 50 === 0) { writeFileSync(file, JSON.stringify(out)); console.error('done', Object.keys(out).length) }
  await new Promise(res => setTimeout(res, 600))
}
writeFileSync(file, JSON.stringify(out))
console.log('銘柄', Object.keys(out).length, '年度の行', Object.values(out).flat().length)
