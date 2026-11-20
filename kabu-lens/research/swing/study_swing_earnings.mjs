// スイングで持っている株の決算をまたぐか、前に売るか（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_swing_earnings.mjs
// 決算の日：research/irhist.json（IR BANK・約10年）。15:00 より前の発表はその日、15:00 以降は翌営業日を「反応の日」とする
// スイング：今の決まり（翌日の寄りで買う・終値+2%以内・損切り 2×ATR・目標 3R・40日）。避ける形は外した候補
// 比べる（平均R、選ぶ／確かめる／最後の確認）：
//   ① 持っている間に反応の日が来たトレード：そのまま持つ／反応の日の前の日の引けで売る
//   ② 合図の日から5営業日以内に反応の日が来る候補（決算の直前に買う）と、それ以外
//   ③ 反応の日に買った日がちょうど重なる（買った日が反応の日）
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const SLIP = 0.001
const ir = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const D = loadAll()
const { stocks } = D
// 銘柄ごとの反応の日の番号の集合
const react = {}
const firstOf = {}
for (const [code, list] of Object.entries(ir)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  const idx = new Map(st.bars.map((b, i) => [b.date, i]))
  const set = new Set()
  for (const k of list) {
    if (!k?.date || !/決算短信/.test(k.title || '')) continue
    let i = idx.get(k.date)
    if (i === undefined) continue
    if ((k.time || '15:00') >= '15:00') i++
    set.add(i)
  }
  react[code] = set
  firstOf[code] = list.filter(k => k?.date && /決算短信/.test(k.title || '')).map(k => k.date).sort()[0] || '9'
}
const first = Object.values(firstOf).sort()[0]
console.log(`決算の日がある銘柄 ${Object.keys(react).length}（いちばん古い発表 ${first}）`)
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const thru = []
const near = []
const far = []
const onEntry = []
for (const s of D.swing) {
  const set = react[s.code]
  if (!set || s.date < firstOf[s.code]) continue
  const B = stocks[s.code].bars
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const risk = t.entry - s.stop
  let R = -1
  for (let k = t.e; k <= t.x; k++) if (set.has(k)) { R = k; break }
  let soon = false
  for (let k = s.i + 1; k <= s.i + 5; k++) if (set.has(k)) soon = true
  ;(soon ? near : far).push({ date: s.date, r: t.r })
  if (R === t.e) onEntry.push({ date: s.date, r: t.r })
  else if (R > t.e) {
    const sell = B[R - 1].c * (1 - SLIP)
    thru.push({ date: s.date, r: t.r, rSell: (sell - t.entry) / risk, jump: (B[R].c / B[R - 1].c - 1) * 100 })
  }
}
const row = (n, z, k = 'r') => console.log(`  ${n.padEnd(26)} ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r[k]); return `${fmt(mean(a), 3)}(${a.length})` }).join('  ')}`)
console.log('\n■ ① 持っている間に決算が来たトレード')
row('そのまま持つ', thru, 'r')
row('前の日の引けで売る', thru, 'rSell')
console.log('  決算の日の値動き（前の日の引け→その日の引け %）', [0, 1, 2].map(p => fmt(mean(thru.filter(r => per(r) === p).map(r => r.jump)))).join(' / '))
console.log('  そのまま持つ − 前に売る（R）', [0, 1, 2].map(p => fmt(mean(thru.filter(r => per(r) === p).map(r => r.r - r.rSell)), 3)).join(' / '))
console.log('\n■ ② 合図から5営業日以内に決算が来る候補')
row('5日以内に決算', near)
row('それ以外', far)
console.log('\n■ ③ 買った日が決算の反応の日')
row('買った日＝反応の日', onEntry)
