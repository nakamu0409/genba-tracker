// TDnet に残っている（約1か月）日の決算短信をすべて読み、要点を research/tanshin.json にためる（日付ごと。すでにある日は飛ばす）
// 使い方: node kabu-lens/research/collect_tanshin.mjs 20261021 20261120
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fetchTdnet, fetchTanshin } from '../../.claude/scripts/kabu-lens.mjs'

const [from, to] = process.argv.slice(2)
const file = new URL('./tanshin.json', import.meta.url)
const db = existsSync(file) ? JSON.parse(readFileSync(file, 'utf-8')) : {}
const d = new Date(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6, 8)}T00:00:00Z`)
const end = `${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6, 8)}`
for (; d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10)
  if ([0, 6].includes(d.getUTCDay()) || db[iso]) continue
  const td = await fetchTdnet(iso.replace(/-/g, ''))
  if (td.error) {
    console.log(iso, td.error)
    continue
  }
  const rows = []
  for (const x of td.rows.filter(x => x.pdf && /決算短信/.test(x.title) && !/訂正/.test(x.title))) {
    const r = fetchTanshin(x.pdf)
    rows.push({ code: x.code, name: x.name, time: x.time, title: x.title, ...r })
  }
  db[iso] = rows
  writeFileSync(file, JSON.stringify(db))
  console.log(iso, rows.length, '件', rows.filter(r => r.actual).length, '件読めた')
}
