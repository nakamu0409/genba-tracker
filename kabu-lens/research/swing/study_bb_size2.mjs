// 自社株買いの規模を、会社の売買の大きさとくらべて見る（2026-11-21。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_bb_size2.mjs   （research/bb_detail.json を使う）
// 買い方：翌日の寄指（終値×1.02以下）で買い、その日の引け（1日）・5日目の引け。TOPIX との差 − 0.2%
// 分け方（先に決めた）：
//   A. 取得の総額 ÷ ふだんの1日の売買代金（20日平均）＝何日分の売買か：5日分未満／5〜20日分／20〜60日分／60日分以上
//   B. ふだんの売買代金：3億円未満／3〜30億円／30億円以上
//   C. 取得の割合2%以上の中で、B の大きさ
// 結果（11/21・寄指で買えた720件）：A（総額は売買の何日分か）は総額の読み取りが少なく、はっきりした差なし。
//   C. 取得の割合2%以上 × ふだんの売買代金3億円未満は その日 +1.05(9)／+1.04(31)／+1.47(11) と3つの期間ともそろって大きい（3〜30億円 +0.08／+0.43／+0.28、30億円以上 +0.42／+0.01／+0.98）
//   → 口座全体で「同じ日はこれを先に買う」（study_combined の evOrder 'bbsmall'）を試すと、前半 23.8→23.8・後半 28.7→29.1・直近 44.6→46.6。わずかに良い（本人と相談の候補）
//   寄指の上限（evLimit）を変えると直近の1年が大きく動く（+2%＝+44.6、+3%＝+12.7、+1%＝+15.5）。直近の1年の数字は運の影響が大きいので、決まりを選ぶ材料にしすぎない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const det = JSON.parse(readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const rows = []
for (const e of D.events) {
  if (e.kind !== 'buyback') continue
  const x = det[`${e.code}|${e.date}|${e.time}`]
  if (!x || x.err) continue
  const st = stocks[e.code]
  const B = st.bars
  const k = e.i + 1
  if (k + 5 >= B.length || B[k].h === B[k].l || B[k].o > e.limit) continue
  const k0 = bi.get(B[k].date)
  const k4 = bi.get(B[k + 4].date)
  if (k0 === undefined || k4 === undefined) continue
  const turn = st.turn[e.i]
  rows.push({
    date: e.date, score: e.score ?? 0, pct: x.pct ?? null, turn,
    daysOfVol: x.amountOku > 0 && turn > 0 ? x.amountOku * 1e8 / turn : null,
    d1: (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2,
    d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2
  })
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z) => console.log(`  ${n.padEnd(16)} その日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d1); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  5日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d5)))).join('/')}`)
console.log(`寄指で買えた自社株買い ${rows.length}件（PDF の読めたもの）`)
console.log('■ A. 取得の総額は、ふだんの売買の何日分か')
for (const [n, a, b] of [['5日分未満', 0, 5], ['5〜20日分', 5, 20], ['20〜60日分', 20, 60], ['60日分以上', 60, 1e9]]) line(n, rows.filter(r => r.daysOfVol !== null && r.daysOfVol >= a && r.daysOfVol < b))
line('総額が読めない', rows.filter(r => r.daysOfVol === null))
console.log('■ B. ふだんの売買代金（20日平均）')
for (const [n, a, b] of [['3億円未満', 0, 3e8], ['3〜30億円', 3e8, 3e9], ['30億円以上', 3e9, 1e15]]) line(n, rows.filter(r => r.turn >= a && r.turn < b))
console.log('■ C. 取得の割合2%以上の中で、売買代金の大きさ')
for (const [n, a, b] of [['3億円未満', 0, 3e8], ['3〜30億円', 3e8, 3e9], ['30億円以上', 3e9, 1e15]]) line(n, rows.filter(r => r.pct >= 2 && r.turn >= a && r.turn < b))
console.log('■ 今の決まり（良い条件＋割合2%以上で2つ以上）の中で、A')
const now = rows.filter(r => r.score + (r.pct >= 2 ? 1 : 0) >= 2)
line('全部', now)
for (const [n, a, b] of [['20日分未満', 0, 20], ['20日分以上', 20, 1e9]]) line(n, now.filter(r => r.daysOfVol !== null && r.daysOfVol >= a && r.daysOfVol < b))
