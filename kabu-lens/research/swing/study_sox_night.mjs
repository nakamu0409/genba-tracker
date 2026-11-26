// 半導体しだいの相場で、今の買い方の成績が変わるか（2026-11-23 本人の質問。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_sox_night.mjs
// 前の夜の米国の半導体指数（SOX）の騰落で分ける：−3%以下／−3〜+3%／+3%以上。SOX の20日の騰落でも分ける：−10%以下／間／+10%以上
// ① 企業の行動（自社株買い・増配）：翌日の寄指（終値+2%以内）→ 引け。TOPIX 連動ETF の同じ日の寄り→引けとの差
// ② スイングの候補（今の決まり：3R・40日・終値+2%以内）：平均R（合図の日の前の夜の SOX で分ける）
// ③ 参考：日本の半導体株（東京エレクトロン・アドバンテスト・レーザーテック・ディスコ・SCREEN）を SOX +3%以上の翌朝の寄りで買い、引けで売る
// 期間：選ぶ（〜2021-11-18）／確かめる（〜2025-11-13）／最後の確認
// 結果（2026-11-23）：
//   ① 企業の行動は、SOX の20日が −10%以下（半導体が崩れた後）で3つの期間とも強い（+0.72／+1.09／+1.76%）。前の夜の SOX −3%以下でもプラス（+1.20／+0.25／+0.19%）。
//      前の夜の SOX +3%以上は前半・後半で弱い（−0.36／−0.07%）が件数が少ない（19・51件）。→ 決まりは変えない
//   ② スイングは、SOX の20日が −10%以下のとき3つの期間とも平均R がマイナス（−0.12／−0.12／−0.16R）。口座全体で減らすと良くなるかは未検証（米国の下げ相場で減らす形は口座全体では良くならなかった）
//   ③ 半導体5社は SOX +3%以上の翌朝に平均 +2.5〜3.4% 窓をあけ、寄りで買うと −0.27／−0.19／+0.24%。追いかけても得にならない
import { loadAll, simulate, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
import { fetchYahoo } from '../../../.claude/scripts/kabu-lens.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const D = loadAll()
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const sox = (await fetchYahoo('^SOX', '10y')).bars
// 日本の日付 → その前の米国の日の SOX の騰落と20日の騰落
const soxNight = new Map()
const soxDates = sox.map(b => b.date)
let j = 0
for (const b of bench) {
  while (j + 1 < sox.length && soxDates[j + 1] < b.date) j++
  if (j < 21 || soxDates[j] >= b.date) continue
  soxNight.set(b.date, { r1: (sox[j].c / sox[j - 1].c - 1) * 100, r20: (sox[j].c / sox[j - 20].c - 1) * 100 })
}
const b1 = r => (r <= -3 ? '−3%以下' : r >= 3 ? '+3%以上' : '−3〜+3%')
const b20 = r => (r <= -10 ? '20日 −10%以下' : r >= 10 ? '20日 +10%以上' : '20日 間')
const show = (title, groups, keys, unit) => {
  console.log(`\n■ ${title}`)
  for (const k of keys) {
    const g = [0, 1, 2].map(p => (groups[k] || []).filter(x => x.p === p).map(x => x.v))
    console.log(`  ${k.padEnd(14)} ${g.map(a => `${fmt(mean(a))}${unit}(${a.length})`).join('  ')}`)
  }
}
const K1 = ['−3%以下', '−3〜+3%', '+3%以上']
const K20 = ['20日 −10%以下', '20日 間', '20日 +10%以上']
const ev1 = {}, ev20 = {}
for (const e of D.events) {
  if (e.kind !== 'buyback' && e.kind !== 'divup') continue
  const st = stocks[e.code]
  const x = st.bars[e.i + 1]
  if (!x || x.h === x.l || x.o > st.bars[e.i].c * 1.02) continue
  const s = soxNight.get(x.date); const k = bi.get(x.date)
  if (!s || k === undefined) continue
  const v = (x.c / x.o - 1) * 100 - (bench[k].c / bench[k].o - 1) * 100
  const p = per(st.bars[e.i].date)
  ;(ev1[b1(s.r1)] ||= []).push({ p, v }); (ev20[b20(s.r20)] ||= []).push({ p, v })
}
show('① 企業の行動：買う日の前の夜の SOX（翌日の寄り→引けの全体比%）', ev1, K1, '%')
show('① 企業の行動：SOX の20日の騰落', ev20, K20, '%')
const sw1 = {}, sw20 = {}
for (const s of D.swing) {
  const B = stocks[s.code].bars
  const nx = B[s.i + 1]
  if (!nx) continue
  const so = soxNight.get(nx.date)
  if (!so) continue
  const t = simulate(B, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (!t) continue
  const p = per(s.date)
  ;(sw1[b1(so.r1)] ||= []).push({ p, v: t.r }); (sw20[b20(so.r20)] ||= []).push({ p, v: t.r })
}
show('② スイング：買う日の前の夜の SOX（平均R）', sw1, K1, 'R')
show('② スイング：SOX の20日の騰落（平均R）', sw20, K20, 'R')
const semi = {}
for (const code of ['8035', '6857', '6920', '6146', '7735']) {
  const st = stocks[code]
  if (!st) continue
  for (let i = 1; i < st.bars.length; i++) {
    const x = st.bars[i]; const s = soxNight.get(x.date); const k = bi.get(x.date)
    if (!s || k === undefined || s.r1 < 3) continue
    ;(semi['寄りで買う'] ||= []).push({ p: per(x.date), v: (x.c / x.o - 1) * 100 - (bench[k].c / bench[k].o - 1) * 100 })
    ;(semi['窓（前日終値→寄り）'] ||= []).push({ p: per(x.date), v: (x.o / st.bars[i - 1].c - 1) * 100 })
  }
}
show('③ 参考：SOX +3%以上の翌日、日本の半導体5社', semi, ['窓（前日終値→寄り）', '寄りで買う'], '%')
