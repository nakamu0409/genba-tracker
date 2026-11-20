// 損切り・利確・持つ日数の見直し（2026-11-20 本人の希望。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_exits.mjs
// 1) スイングの候補（今の決まり：翌日の寄りで買う（終値+2%以内）、損切り＝合図の日の終値 − 2×ATR、目標 3R、40営業日）
//    損切りの幅（1・1.5・2・3×ATR）× 目標（2R・3R・5R・なし）× 損切りの引き上げ（なし／+1R で買値へ／高値から3×ATR下で追う）
//    比べる物差し：1回の平均R（1回の損＝損切り幅を1とした損益。資金の何%を賭けるかが同じなら、平均R が大きいほど儲かる）と、持った日数・10日あたりのR
// 2) 急落の反発・つられ下げ：損切り（なし・−8%・−12%・−20%）× 持つ日数 × 利確（なし・+10%）。TOPIX との差（%）
// 期間：選ぶ（〜2021-11-18）・確かめる（〜2025-11-13）・最後の確認。手数料・値段のずれは 0.1%×往復（SLIP）で入れてある
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const SLIP = 0.001
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const atrOf = {}
for (const st of Object.values(stocks)) {
  const B = st.bars
  const a = new Float64Array(B.length)
  let s = 0
  for (let i = 0; i < B.length; i++) {
    const tr = i ? Math.max(B[i].h, B[i - 1].c) - Math.min(B[i].l, B[i - 1].c) : B[i].h - B[i].l
    s += tr
    if (i >= 14) s -= i - 14 ? Math.max(B[i - 14].h, B[i - 15].c) - Math.min(B[i - 14].l, B[i - 15].c) : B[0].h - B[0].l
    a[i] = s / Math.min(14, i + 1)
  }
  atrOf[st.code] = a
}
// 一般の売り方：e の寄りで買い、stop・target・trail で売る
function run(B, atr, i, { k, rMult, trail, maxDays = 40, gapMax = 2 }) {
  const e = i + 1
  if (e >= B.length || B[e].h === B[e].l) return null
  if (gapMax !== null && B[e].o > B[i].c * (1 + gapMax / 100)) return null
  const entry = B[e].o * (1 + SLIP)
  let stop = B[i].c - k * atr[i]
  if (!(entry > stop)) return null
  const risk = entry - stop
  const target = rMult ? entry + rMult * risk : Infinity
  let hiC = entry
  for (let j = e; j < B.length && j < e + maxDays; j++) {
    const x = B[j]
    let ex = null
    if (j > e && x.o <= stop) ex = x.o * (1 - SLIP)
    else if (x.l <= stop) ex = stop * (1 - SLIP)
    else if (j > e && x.o >= target) ex = x.o
    else if (x.h >= target) ex = target
    else if (j === e + maxDays - 1) ex = x.c * (1 - SLIP)
    if (ex !== null) return { r: (ex - entry) / risk, days: j - e + 1, date: B[i].date }
    // 引けで損切りを見直す（次の日から効く）
    hiC = Math.max(hiC, x.c)
    if (trail === 'be' && x.c >= entry + risk) stop = Math.max(stop, entry)
    if (trail === 'atr3') stop = Math.max(stop, hiC - 3 * atr[j])
  }
  return null
}
function line(name, rows) {
  const s = p => rows.filter(p)
  const r1 = s(r => r.date < A)
  const r2 = s(r => r.date >= A && r.date < BB)
  const r3 = s(r => r.date >= BB)
  const m = z => mean(z.map(r => r.r))
  const per10 = z => mean(z.map(r => r.r)) / mean(z.map(r => r.days)) * 10
  return { name, n: rows.length, m1: m(r1), m2: m(r2), m3: m(r3), days: mean(rows.map(r => r.days)), p10: per10(rows), win: rows.filter(r => r.r > 0).length / rows.length }
}
console.log(`スイングの候補 ${D.swing.length}件で試す（今の決まり：2×ATR・3R・引き上げなし）\n`)
const res = []
for (const k of [1, 1.5, 2, 3]) {
  for (const rMult of [2, 3, 5, 0]) {
    for (const trail of ['none', 'be', 'atr3']) {
      const rows = []
      for (const s of D.swing) {
        const st = stocks[s.code]
        const t = run(st.bars, atrOf[s.code], s.i, { k, rMult, trail })
        if (t) rows.push(t)
      }
      res.push(line(`損切り ${k}×ATR・目標 ${rMult ? rMult + 'R' : 'なし'}・引き上げ ${trail === 'none' ? 'なし' : trail === 'be' ? '+1Rで買値へ' : '高値−3ATR'}`, rows))
    }
  }
}
res.sort((a, b) => b.m2 - a.m2)
const cur = res.find(r => r.name === '損切り 2×ATR・目標 3R・引き上げ なし')
const show = r => console.log(`  ${r.name.padEnd(40)} 平均R 選ぶ${fmt(r.m1, 3)}  確かめる${fmt(r.m2, 3)}  最後${fmt(r.m3, 3)}  持つ${r.days.toFixed(1)}日  10日あたり${fmt(r.p10, 3)}R  勝率${(r.win * 100).toFixed(0)}%`)
console.log('■ 今の決まり')
show(cur)
console.log('\n■ 確かめる期間の平均R が良い順（上位12）')
res.slice(0, 12).forEach(show)
console.log('\n■ 選ぶ期間でも確かめる期間でも今の決まりより良く、最後の確認でも今より良いもの')
res.filter(r => r.m1 > cur.m1 && r.m2 > cur.m2 && r.m3 > cur.m3).forEach(show)

// 2) 急落の反発・つられ下げ
const bOpenTo = (d0, d1) => (bi.has(d0) && bi.has(d1) ? (bench[bi.get(d1)].c / bench[bi.get(d0)].o - 1) * 100 : null)
const bGap = d => {
  const i = bi.get(d)
  return i > 0 ? (bench[i].o / bench[i - 1].c - 1) * 100 : null
}
function hold(B, e, { sl, days, tp }) {
  const entry = B[e].o * (1 + SLIP)
  const stop = sl ? entry * (1 - sl / 100) : 0
  const tgt = tp ? entry * (1 + tp / 100) : Infinity
  for (let j = e; j < B.length && j < e + days; j++) {
    const x = B[j]
    let ex = null
    if (sl && j > e && x.o <= stop) ex = x.o
    else if (sl && x.l <= stop) ex = stop
    else if (tp && j > e && x.o >= tgt) ex = x.o
    else if (tp && x.h >= tgt) ex = tgt
    else if (j === e + days - 1) ex = x.c
    if (ex !== null) {
      const bm = bOpenTo(B[e].date, B[j].date)
      return bm === null ? null : (ex * (1 - SLIP) / entry - 1) * 100 - bm
    }
  }
  return null
}
const cr = []
const ts = []
for (const st of Object.values(stocks)) {
  const B = st.bars
  let last = -99
  for (let i = 260; i < B.length - 21; i++) {
    if (st.turn[i] < 1e8) continue
    if (B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300) {
      if (i - last > 10 && B[i + 1].h !== B[i + 1].l) cr.push({ B, e: i + 1, date: B[i].date })
      last = i
    }
    const g = bGap(B[i].date)
    if (B[i - 1].c >= 300 && B[i].o / B[i - 1].c <= 0.95 && g !== null && g <= -2.5) ts.push({ B, e: i, date: B[i].date })
  }
}
function table(title, list, combos) {
  console.log(`\n■ ${title}（TOPIX との差・%。往復 0.2% 相当を引いてある）`)
  for (const c of combos) {
    const rows = list.map(x => ({ date: x.date, v: hold(x.B, x.e, c) })).filter(x => x.v !== null)
    const m = p => mean(rows.filter(p).map(x => x.v))
    console.log(`  損切り ${c.sl ? '−' + c.sl + '%' : 'なし'}・${c.days}日・利確 ${c.tp ? '+' + c.tp + '%' : 'なし'}`.padEnd(30) + `  選ぶ${fmt(m(r => r.date < A))}  確かめる${fmt(m(r => r.date >= A && r.date < BB))}  最後${fmt(m(r => r.date >= BB))}  （${rows.length}件）`)
  }
}
const combos = []
for (const sl of [0, 8, 12, 20]) for (const days of [5, 10]) for (const tp of [0, 10]) combos.push({ sl, days, tp })
table('急落の反発（10日ぶりの最初の合図・翌日の寄りで買う）', cr, combos)
table('つられ下げ（TOPIX の窓 −2.5% 以下の日に、窓 −5% 以下の株をその日の寄りで買う）', ts, combos)
