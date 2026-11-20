// 米国の下げ相場（S&P500 が20日で −5%以下）の間の日経平均（約56年。2026-11-21。先に一覧を決めてから回す）
// 使い方: node kabu-lens/research/swing/study_usbear_long.mjs <N225の chart JSON> <GSPCの chart JSON>
// 日本の日 d に使う米国の値：d より前の日付の、最後の S&P500 の終値（時差のため）
// 見るもの：その日の日経平均の終値で買って 5・20日持った騰落と、同じ10年のふつうの平均との差。下げ相場の日・そうでない日
import { readFileSync } from 'node:fs'

const load = f => {
  const r = JSON.parse(readFileSync(f, 'utf-8')).chart.result[0]
  const q = r.indicators.quote[0]
  return r.timestamp.map((t, i) => ({ date: new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(b => b.c > 0)
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
const f = v => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  —  ')
const N = load(process.argv[2])
// S&P500 は米国時間の日付なので、9時間足した日付は翌日になることがある。米国の日付（-5h）で付け直す
const S = (() => {
  const r = JSON.parse(readFileSync(process.argv[3], 'utf-8')).chart.result[0]
  const q = r.indicators.quote[0]
  return r.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: q.close[i] })).filter(b => b.c > 0)
})()
let j = -1
const rows = []
for (let i = 0; i < N.length - 21; i++) {
  while (j + 1 < S.length && S[j + 1].date < N[i].date) j++
  if (j < 20) continue
  const spx20 = (S[j].c / S[j - 20].c - 1) * 100
  rows.push({ date: N[i].date, bear: spx20 <= -5, r5: (N[i + 5].c / N[i].c - 1) * 100, r20: (N[i + 20].c / N[i].c - 1) * 100 })
}
console.log('日経平均の騰落%（下げ相場の日／そうでない日、差）')
for (const dec of [...new Set(rows.map(r => r.date.slice(0, 3)))]) {
  const z = rows.filter(r => r.date.slice(0, 3) === dec)
  const b = z.filter(r => r.bear)
  const n = z.filter(r => !r.bear)
  console.log(`  ${dec}0年代 下げ相場 ${String(b.length).padStart(4)}日  5日 ${f(mean(b.map(r => r.r5)))}／${f(mean(n.map(r => r.r5)))}（${f(mean(b.map(r => r.r5)) - mean(n.map(r => r.r5)))}）  20日 ${f(mean(b.map(r => r.r20)))}／${f(mean(n.map(r => r.r20)))}（${f(mean(b.map(r => r.r20)) - mean(n.map(r => r.r20)))}）`)
}
