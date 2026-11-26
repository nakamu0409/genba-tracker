// 17業種のETF（NEXT FUNDS TOPIX-17シリーズ）の日足10年分と、各銘柄の業種（株探の33業種）を集める
import { fetchYahoo } from '../../.claude/scripts/kabu-lens.mjs'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const ETF = { 1617: '食品', 1618: 'エネルギー資源', 1619: '建設・資材', 1620: '素材・化学', 1621: '医薬品', 1622: '自動車・輸送機', 1623: '鉄鋼・非鉄', 1624: '機械', 1625: '電機・精密', 1626: '情報通信・サービスその他', 1627: '電力・ガス', 1628: '運輸・物流', 1629: '商社・卸売', 1630: '小売', 1631: '銀行', 1632: '金融（除く銀行）', 1633: '不動産' }
const etf = {}
for (const [c, name] of Object.entries(ETF)) { try { etf[name] = (await fetchYahoo(`${c}.T`, '10y')).bars } catch (e) { console.error(c, e.message) } }
const codes = JSON.parse(readFileSync(new URL('./codes.json', import.meta.url), 'utf-8'))
const industry = {}
for (const c of codes) {
  const r = spawnSync('curl', ['-sSL', '--max-time', '25', '-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120', `https://kabutan.jp/stock/?code=${c}`], { encoding: 'utf-8', maxBuffer: 1 << 26 })
  const m = (r.stdout || '').match(/<a href="\/themes\/\?industry=\d+[^"]*">([^<]+)<\/a>/)
  industry[c] = m ? m[1] : null
  await new Promise(res => setTimeout(res, 350))
}
writeFileSync(new URL('./sector.json', import.meta.url), JSON.stringify({ etf, industry }))
console.log('etf', Object.entries(etf).map(([k, v]) => `${k}:${v.length}`).join(' '))
console.log('industry ok', Object.values(industry).filter(Boolean).length, 'of', codes.length, [...new Set(Object.values(industry))].join('、'))
