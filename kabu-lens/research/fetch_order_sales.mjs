// 受注の開示を出した会社の年ごとの売上（株探の決算ページ。百万円）を集める（study_order_size.mjs で、PDF に売上が無いときに使う）
// 使い方: node kabu-lens/research/fetch_order_sales.mjs → order_sales.json（gitignore）：{ コード: [{ period: '2025.03', sales: 百万円, forecast }] }
import { readFileSync, writeFileSync } from 'node:fs'
import { fetchFinance } from '../../.claude/scripts/kabu-lens.mjs'
const P = JSON.parse(readFileSync(new URL('./order_pdfs.json', import.meta.url), 'utf-8'))
const codes = [...new Set(Object.entries(P).filter(([, v]) => v.text).map(([k]) => k.split('|')[0]))]
import { existsSync } from 'node:fs'
const of = new URL('./order_sales.json', import.meta.url)
const out = existsSync(of) ? JSON.parse(readFileSync(of, 'utf-8')) : {}
for (const c of codes) {
  if (out[c] && out[c].length && out[c][0].q !== undefined) continue
  try {
    const f = await fetchFinance(c)
    // 年の表が読めない会社もあるので、四半期の売上（新しい4つの合計＝直近1年）も入れる
    const q = (f.quarterly || []).filter(x => x.sales != null).slice(-4)
    const ttm = q.length === 4 ? q.reduce((a, x) => a + x.sales, 0) : null
    out[c] = [{ q: ttm, qdate: q.length ? q[q.length - 1].date : null }, ...(f.annual || []).map(a => ({ period: a.period, sales: a.sales, forecast: !!a.forecast }))]
  } catch (e) { out[c] = null }
  await new Promise(r => setTimeout(r, 2500))
}
writeFileSync(new URL('./order_sales.json', import.meta.url), JSON.stringify(out))
console.log('銘柄', codes.length, '取れた', Object.values(out).filter(x => x && x.length && (x[0].q || x.length > 1)).length)
