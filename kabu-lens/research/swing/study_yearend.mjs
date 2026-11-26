// 年末の損出しの売りと1月の戻り：今年大きく下げた株を12月に買い、1月に売ると得か（2026-11-24 本人と試す。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_yearend.mjs
// 対象：wide.json＋wide_small.json（小さい会社を含む約3,600社）。株価50円以上・20日平均の売買代金3,000万円以上
// 年初来：その年の最初の営業日の始値 → 買う日の終値。グループ：年初来 −40%以下／−40〜−20%／−20〜0%／0%以上（比べる相手）
// 買う日：①12月の15営業日目ごろ（12/20前後）の終値 ②大納会（12月の最後の営業日）の終値
// 売る日：1月の5営業日目・10営業日目・1月の最後の営業日の終値。TOPIX 連動ETF の同じ期間を引き、手数料・すべり0.2%を引く
// 年ごとに出す（2016年末〜2025年末の10回）。期間：前半（2016〜2020年末）／後半（2021〜2024年末）／直近（2025年末）
// 注意：今も上場している会社だけ（下げて上場廃止になった会社が入らない＝下げた株ほど良く出やすい）
// 結果（2026-11-24、使えたのは8回の年末）：採らない。年によって ±5〜7% と大きくぶれ、向きがそろわない。
//   12/20ごろ→1月10日目：年初来 −40%以下 +0.86／−1.96／+4.88%（勝った年 5/8）、−40〜−20% +1.80／−1.31／+0.01%。後半（2021〜2024年末）はどの形もマイナス。
//   年ごと（−40%以下）：2017 +5.8、2019 −3.4、2020 +0.2、2021 −7.4、2022 +1.6、2023 −4.9、2024 +2.8、2025 +4.9%。
//   どのグループも TOPIX 比では1月におおむね負け（0%以上も −0.2〜−2.7%）。大納会で買うほうが悪い。上場廃止の会社が入っていないので、本当はもっと悪い
import { readFileSync } from 'node:fs'
import { mean, median, fmt } from './lib_signals.mjs'
const R = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf-8'))
const wide = { ...R('../wide_small.json'), ...R('../wide.json') }
const benchRaw = R('./bench1306.json')
const bench = []
for (const b of benchRaw) { const p = bench[bench.length - 1]; if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue; bench.push(b) }
const bc = new Map(bench.map(b => [b.date, b.c]))
const days = bench.map(b => b.date)
const COST = 0.2
const G = ['−40%以下', '−40〜−20%', '−20〜0%', '0%以上']
const grp = y => (y <= -40 ? 0 : y <= -20 ? 1 : y < 0 ? 2 : 3)
const res = {} // key `${entry}|${exit}` -> year -> group -> []
const stocks = []
for (const [code, w] of Object.entries(wide)) {
  const bars = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.c > 0 && b.o > 0)
  if (bars.length < 120) continue
  stocks.push({ code, bars, idx: new Map(bars.map((b, i) => [b.date, i])) })
}
for (let Y = 2016; Y <= 2025; Y++) {
  const dec = days.filter(d => d.startsWith(`${Y}-12`))
  const jan = days.filter(d => d.startsWith(`${Y + 1}-01`))
  const first = days.find(d => d.startsWith(`${Y}-01`))
  if (dec.length < 15 || jan.length < 10 || !first) continue
  const entries = { '12/20ごろ': dec[14], '大納会': dec[dec.length - 1] }
  const exits = { '1月5日目': jan[4], '1月10日目': jan[9], '1月末': jan[jan.length - 1] }
  for (const [en, ed] of Object.entries(entries)) for (const [xn, xd] of Object.entries(exits)) {
    const key = `${en}→${xn}`
    const br = (bc.get(xd) / bc.get(ed) - 1) * 100
    for (const s of stocks) {
      const i0 = s.idx.get(first), ie = s.idx.get(ed), ix = s.idx.get(xd)
      if (i0 === undefined || ie === undefined || ix === undefined || ie < 20) continue
      const B = s.bars
      if (B[ie].c < 50) continue
      let t = 0
      for (let j = ie - 19; j <= ie; j++) t += B[j].c * B[j].v
      if (t / 20 < 3e7) continue
      const ytd = (B[ie].c / B[i0].o - 1) * 100
      const r = (B[ix].c / B[ie].c - 1) * 100 - br - COST
      ;(((res[key] ||= {})[Y] ||= [[], [], [], []])[grp(ytd)]).push(r)
    }
  }
}
const per = Y => (Y <= 2020 ? 0 : Y <= 2024 ? 1 : 2)
for (const [key, byY] of Object.entries(res)) {
  console.log(`\n■ ${key}（TOPIX 比・0.2%を引いた%。年の平均をさらに平均）`)
  for (let g = 0; g < 4; g++) {
    const P = [[], [], []]
    let n = 0, wins = 0
    for (const [Y, gs] of Object.entries(byY)) { const a = gs[g]; if (a.length < 5) continue; const m = mean(a); P[per(+Y)].push(m); n += a.length; if (m > 0) wins++ }
    const yrs = Object.keys(byY).filter(Y => byY[Y][g].length >= 5)
    console.log(`  ${G[g].padEnd(10)} 前半 ${fmt(mean(P[0]))}／後半 ${fmt(mean(P[1]))}／直近 ${fmt(mean(P[2]))}  勝った年 ${wins}/${yrs.length}  件数 ${n}`)
  }
  if (key === '12/20ごろ→1月10日目') {
    console.log('  年ごと（−40%以下／0%以上）：' + Object.entries(byY).map(([Y, gs]) => `${Y} ${fmt(mean(gs[0]))}(${gs[0].length})/${fmt(mean(gs[3]))}`).join('  '))
  }
}
