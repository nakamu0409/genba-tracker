// まだ試していない形（2026-11-21 本人の希望。先に一覧と分け方を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_events_more2.mjs
// 1. 株主優待の導入・新設・拡充の発表（比べる相手：廃止）
// 2. 上の市場への変更（記念配当・記念優待の見出しで分かるもの）
// 3. 復配の発表
//    1〜3 は今の企業の行動と同じ買い方：15:00以降・決算と別の日・売買代金1億円以上 → 翌日の寄指（終値×1.02以下）で買い、その日の引け（1日）と5営業日目の引け（5日）。TOPIX との差 − 0.2%
//    同じ日に自社株買い・増配・株式分割も出ているものは「単独」から外す（今の決まりで買っている分と重ならないように）
// 4. 月末・月初：TOPIX 連動ETF（1306）を、月の最後の営業日の2日前の引けで買い、翌月3営業日目の引けで売る（5日持つ）。ほかの5日間とくらべる
// 結果（11/21）：どれも決まりには入れない
//   1. 優待の導入・拡充（270件）：その日 −0.07(59)／−0.14(86)／−0.16(30)、5日 +0.54／−0.44／−0.38。上乗せなし（窓が+2%開いて、寄りで織り込み済み）
//      比べる相手の廃止（52件）は窓 −2.7% のあと、その日 +1.12(20)／+1.11(22)／+0.15(3) と戻る。件数が少なく、先に決めた買い方ではないので、見続けるだけ
//   2. 市場変更の記念（3件）：手持ちの開示の見出しでは、市場変更の承認の発表がほとんど拾えず、判定できない
//   3. 復配（7件）：件数が少なすぎて判定できない
//   4. 月末・月初（1306・5日）：−0.16(60)／−0.07(48)／+0.81(12)、ほかの日は +0.18／+0.31／+0.35。日本株では月の変わり目はむしろ弱い
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
import { tickFloor } from '../../../.claude/scripts/kabu-lens.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const bi = new Map(bench.map((b, i) => [b.date, i]))
const isB = t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|経過|ToSTNeT|立会外)/.test(t)
const isDiv = t => /増配/.test(t) && !/(減配|無配|下方)/.test(t)
const isSplit = t => /株式分割/.test(t) && !/(結果|延期|中止)/.test(t)
const KINDS = {
  yutai: t => /株主優待/.test(t) && /(導入|新設|拡充|再開)/.test(t) && !/(廃止|中止|縮小|休止)/.test(t),
  yutai_end: t => /株主優待/.test(t) && /(廃止|中止|休止)/.test(t),
  market: t => /(市場変更|市場区分|上場市場|プライム市場上場)/.test(t) && /記念/.test(t),
  fukuhai: t => /復配/.test(t)
}
const rows = []
for (const [code, list] of Object.entries(irev)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  const kd = new Set((irh[code] || []).map(r => r.date))
  const seen = new Set()
  for (const r of list) {
    if (!r || !r.title || r.time < '15:00') continue
    for (const [kind, f] of Object.entries(KINDS)) {
      if (!f(r.title)) continue
      if (kd.has(r.date) || list.some(x => x && x.date === r.date && /決算/.test(x.title || ''))) continue
      const i = st.idx.get(r.date)
      if (i === undefined || i < 60 || st.turn[i] < 1e8) continue
      if (seen.has(kind + i)) continue
      seen.add(kind + i)
      const B = st.bars
      const k = i + 1
      if (k + 5 >= B.length || B[k].h === B[k].l) continue
      const lim = tickFloor(B[i].c * 1.02)
      const k0 = bi.get(B[k].date)
      const k4 = bi.get(B[k + 4].date)
      if (k0 === undefined || k4 === undefined) continue
      const other = list.some(x => x && x.date === r.date && x.time >= '15:00' && (isB(x.title || '') || isDiv(x.title || '') || isSplit(x.title || '')))
      rows.push({
        kind, date: r.date, other, filled: B[k].o <= lim,
        gap: (B[k].o / B[i].c - 1) * 100,
        d1: (B[k].c / B[k].o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100 - 0.2,
        d5: (B[k + 4].c / B[k].o - 1) * 100 - (bench[k4].c / bench[k0].o - 1) * 100 - 0.2
      })
    }
  }
}
const per = r => (r.date < A ? 0 : r.date < BB ? 1 : 2)
const line = (n, z0) => {
  const z = z0.filter(r => r.filled)
  console.log(`  ${n.padEnd(14)} 発表${String(z0.length).padStart(4)} 寄指で買えた${(z.length / (z0.length || 1) * 100).toFixed(0).padStart(3)}% 窓${fmt(mean(z0.map(r => r.gap)))}  その日 ${[0, 1, 2].map(p => { const a = z.filter(r => per(r) === p).map(r => r.d1); return `${fmt(mean(a))}(${a.length})` }).join(' ')}  5日 ${[0, 1, 2].map(p => fmt(mean(z.filter(r => per(r) === p).map(r => r.d5)))).join('/')}`)
}
console.log('企業の開示（翌日の寄指で買えた分。TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認）')
for (const [k, n] of [['yutai', '優待の導入・拡充'], ['yutai_end', '優待の廃止（比べる相手）'], ['market', '市場変更の記念'], ['fukuhai', '復配']]) {
  line(n, rows.filter(r => r.kind === k))
  line(' └ 単独', rows.filter(r => r.kind === k && !r.other))
}

// 4. 月末・月初（1306）
const b = bench.filter((x, i) => i === 0 || (x.c / bench[i - 1].c < 1.3 && x.c / bench[i - 1].c > 0.7))
const mon = b.map(x => x.date.slice(0, 7))
const tom = []
const rest = []
for (let i = 3; i + 5 < b.length; i++) {
  // i が「月の最後の営業日の2日前」か
  const isEntry = mon[i] === mon[i + 2] && mon[i + 2] !== mon[i + 3]
  const r = (b[i + 5].c / b[i].c - 1) * 100
  ;(isEntry ? tom : rest).push({ date: b[i].date, r })
}
const p3 = (z, f) => [0, 1, 2].map(p => { const a = z.filter(x => per(x) === p).map(x => x.r); return `${fmt(mean(a))}(${a.length})` }).join(' ')
console.log('月末・月初（1306 を月末の2営業日前の引けで買い、5日後の引けで売る。そのままの%。手数料は考えない）')
console.log('  月の変わり目の5日   ', p3(tom))
console.log('  ほかの日から5日   ', p3(rest))
