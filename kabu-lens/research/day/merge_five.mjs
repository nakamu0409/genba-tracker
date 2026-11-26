// 記録帳に保存した5分足（five_index の各ファイル）を、研究用の five.json にまとめる
// 使い方:
//   1. 記録帳の five_index を ArtifactData で list し、各 assetId を Artifact の read（path に assetId）で保存する
//   2. node kabu-lens/research/day/merge_five.mjs <保存したファイル...>   → five.json に足す（同じ日は上書き）
// ファイルの形は2つ: 1日分 {date, bars: {code: [[分, 始, 高, 安, 終, 出来高], ...]}} と、複数日 {days: {date: {code: [...]}}}
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const out = new URL('./five.json', import.meta.url)
const five = existsSync(out) ? JSON.parse(readFileSync(out, 'utf-8')) : {}
let added = 0
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, 'utf-8'))
  const days = j.days || (j.date ? { [j.date]: j.bars } : {})
  for (const [date, byCode] of Object.entries(days)) {
    for (const [code, bars] of Object.entries(byCode)) {
      if (five[code] === null || five[code] === undefined) five[code] = {}
      five[code][date] = bars
    }
    added++
  }
}
writeFileSync(out, JSON.stringify(five))
const dates = new Set()
for (const d of Object.values(five)) if (d) for (const k of Object.keys(d)) dates.add(k)
const s = [...dates].sort()
console.log(`足した日 ${added}、five.json は ${Object.keys(five).length}銘柄・${s.length}日（${s[0]}〜${s[s.length - 1]}）`)
