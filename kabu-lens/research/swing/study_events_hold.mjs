// 企業の行動（自社株買い・増配・株式分割）の持ち方（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_hold.mjs
// 今の決まり：発表の翌日の寄指（終値×1.02以下）で買い、自社株買い・増配はその日の引け、株式分割は5日目の引けで売る
// 比べる：その日の引け／翌日の寄り／翌日の引け／3日目／5日目／10日目の引け。TOPIX との差から往復 0.2% を引く
// 期間：選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const COST = 0.2
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const bTo = (d0, d1, toOpen = false) => (bi.has(d0) && bi.has(d1) ? ((toOpen ? bench[bi.get(d1)].o : bench[bi.get(d1)].c) / bench[bi.get(d0)].o - 1) * 100 : null)
const G = {}
for (const e of D.events) {
  const B = stocks[e.code].bars
  const k = e.i + 1
  if (k + 10 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const grp = e.kind === 'buyback' ? (e.score >= 2 ? '自社株買い（良い条件2つ以上）' : e.score === 1 ? '自社株買い（良い条件1つ）' : '自社株買い（良い条件なし）') : e.kind === 'divup' ? '増配' : '株式分割'
  const o = B[k].o
  const ex = (px, d1, toOpen) => {
    const bm = bTo(B[k].date, d1, toOpen)
    return bm === null ? null : (px / o - 1) * 100 - bm - COST
  }
  const r = {
    date: e.date,
    c0: ex(B[k].c, B[k].date),
    o1: ex(B[k + 1].o, B[k + 1].date, true),
    c1: ex(B[k + 1].c, B[k + 1].date),
    c3: ex(B[k + 2].c, B[k + 2].date),
    c5: ex(B[k + 4].c, B[k + 4].date),
    c10: ex(B[k + 9].c, B[k + 9].date)
  }
  ;(G[grp] ||= []).push(r)
}
const KEYS = [['c0', 'その日の引け'], ['o1', '翌日の寄り'], ['c1', '翌日の引け'], ['c3', '3日目の引け'], ['c5', '5日目の引け'], ['c10', '10日目の引け']]
for (const [g, rows] of Object.entries(G)) {
  console.log(`■ ${g}（${rows.length}件）`)
  for (const [k, n] of KEYS) {
    const m = p => mean(rows.filter(p).map(r => r[k]).filter(v => v !== null))
    const v = [m(r => r.date < A), m(r => r.date >= A && r.date < BB), m(r => r.date >= BB)]
    const tag = v.every(x => x > 0) ? '◎◎' : v[0] > 0 && v[1] > 0 ? '◎' : ''
    console.log(`  ${n.padEnd(10)} 選ぶ${fmt(v[0])}  確かめる${fmt(v[1])}  最後${fmt(v[2])}  ${tag}`)
  }
}
