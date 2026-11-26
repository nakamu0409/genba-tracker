// 約1,150銘柄（universe-wide.json）の株探の決算ページ（通期・四半期の業績と発表日）を取る。途中から再開できる
// 使い方: node kabu-lens/research/long/fetch_fin.mjs <universe-wide.json>  → fin.json { code: {annual, quarterly} }
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fetchFinance } from '../../../.claude/scripts/kabu-lens.mjs'
const list = JSON.parse(readFileSync(process.argv[2], 'utf-8'))
const out = new URL('./fin.json', import.meta.url)
const data = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : {}
const todo = list.map(x => x.code).filter(c => data[c] === undefined)
let n = 0
for (let i = 0; i < todo.length; i += 3) {
  await Promise.all(todo.slice(i, i + 3).map(async (c) => {
    try {
      data[c] = await fetchFinance(c)
    } catch {
      data[c] = null
    }
  }))
  await new Promise(r => setTimeout(r, 400))
  n += 3
  if (n % 60 === 0) {
    writeFileSync(out, JSON.stringify(data))
    console.log(n, todo[i])
  }
}
writeFileSync(out, JSON.stringify(data))
console.log('done', Object.keys(data).length)
