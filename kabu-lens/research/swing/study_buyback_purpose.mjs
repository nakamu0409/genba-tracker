// 自社株買いを目的で分ける（11/27 本人の希望：取得の割合の2%より目的が大事。目的ごとに、寄指の範囲で寄るかまで含めて計算する）
// データ：../buyback_pdfs.json（fetch_buyback_pdfs.mjs）と lib_signals の企業の行動（buyback）。決算と同じ日・場中の発表は lib 側で除いてある
// 目的（kabu-lens.mjs の buybackPurpose）：comp＝株式報酬・従業員持株、ma＝株式交換・M&A、return＝株主還元・資本効率、flex＝「機動的な資本政策」だけ、other
// 数えるもの（期間：前半／後半／直近）：
//   窓＝発表日の終値→翌朝の寄り%、寄指の上限（終値×1.02／1.03／1.05／1.10）ごとに 買えた割合・買えた日の寄り→引け（全体との差）・1回あたりの期待（買えない日は0）
//   参考：発表日の終値で買えた場合（PTS で発表直後に買う形の上限）の翌日の引けまで
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
import { parseBuybackPdf } from '../../../.claude/scripts/kabu-lens.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const P = JSON.parse(readFileSync(new URL('../buyback_pdfs.json', import.meta.url), 'utf-8'))
const { stocks, bench, events } = loadAll({ withSwing: false, withSmall: true })
const bi = new Map(bench.map((b, i) => [b.date, i]))
const LIMS = [1.02, 1.03, 1.05, 1.10]
const G = {}
const add = (g, p, k, v) => { const x = (G[g] ||= {}); ((x[k] ||= [[], [], []])[p]).push(v) }
let n = 0, read = 0
for (const e of events.filter(e => e.kind === 'buyback')) {
  const v = P[`${e.code}|${e.date}`]; if (!v?.text) continue
  const B = stocks[e.code].bars, c = B[e.i], x = B[e.i + 1]; if (!x || x.h === x.l) continue
  const k = bi.get(x.date), k0 = bi.get(c.date); if (k === undefined || k0 === undefined) continue
  read++
  const pb = parseBuybackPdf(v.text)
  const p = per(e.date)
  const turn = stocks[e.code].turn[e.i]
  const amtDays = pb.amount_oku && turn ? pb.amount_oku * 1e8 / turn : null // 総額が20日平均の売買代金の何日分か
  const tags = ['全部', '目的・' + pb.purpose]
  if (pb.pct != null) tags.push('目的・' + pb.purpose + (pb.pct >= 2 ? '・割合2%以上' : '・割合2%未満'))
  if (amtDays != null) tags.push('総額・売買代金の' + (amtDays >= 5 ? '5日分以上' : amtDays >= 1 ? '1〜5日分' : '1日分未満'))
  if (pb.method === 'ToSTNeT' || pb.method === 'TOB') tags.push('方法・' + pb.method)
  const gap = (x.o / c.c - 1) * 100
  const mk = (bench[k].c / bench[k].o - 1) * 100
  const oc = (x.c / x.o - 1) * 100 - mk
  const cc = (x.c / c.c - 1) * 100 - (bench[k].c / bench[k0].c - 1) * 100
  for (const t of tags) {
    add(t, p, '窓', gap); add(t, p, '終値で買い→翌日の引け', cc)
    for (const L of LIMS) {
      const f = x.o <= c.c * L
      add(t, p, `寄指×${L}・買えた%`, f ? 100 : 0)
      if (f) add(t, p, `寄指×${L}・買えた日の寄り→引け`, oc)
      add(t, p, `寄指×${L}・1回あたり`, f ? oc : 0)
    }
  }
  n++
}
console.log(`読めた ${read} 件（PDF のある自社株買い）`)
const order = Object.keys(G).sort()
for (const g of order) {
  console.log(`\n■ ${g}（回数 ${G[g]['窓'].map(a => a.length).join('／')}）`)
  for (const [k, a] of Object.entries(G[g])) console.log(`  ${k.padEnd(26)} ${a.map(x => fmt(mean(x))).join(' ／ ')}`)
}
