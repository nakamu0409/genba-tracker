// 受注の中身で分ける（11/26 本人の希望：寄りの%だけでなく内容を深く見る。AIメカテックの「約60億円・売上の15%」の大口受注が寄り+6%から更に上げた日のあと）
// データ：../order_pdfs.json（fetch_order_pdfs.mjs。受注の開示の PDF の文字）。月次の受注実績は除く
// PDF から 受注金額（億円・百万円・千万円・万円）と、参考に載っている売上高（今期予想、無ければ前期実績。単位は百万円の表が多い）を読む
// 受注金額 ÷ 売上 で分け、引け後の発表の翌朝の寄りで買う（寄りで必ず買う）：寄り→引け、5日（全体との差%）、寄りの窓。期間：前半／後半／直近
// 使い方: node study_order_size.mjs [--show]（--show で読み取れなかったものを少し出す）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const P = JSON.parse(readFileSync(new URL('../order_pdfs.json', import.meta.url), 'utf-8'))
const z2h = s => s.replace(/[０-９．，]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
const num = s => Number(s.replace(/[,，]/g, ''))
// 受注金額（円）
export function orderAmount(text) {
  const t = z2h(text).replace(/[ \t]+/g, ' ')
  const m = t.match(/(?:受注金額|受注額|契約金額|受注総額|受注高|金額)[^0-9\n]{0,20}?([0-9][0-9,]*(?:\.[0-9]+)?) ?(億|千万|百万|万)?円/)
  if (!m) return null
  const unit = { 億: 1e8, 千万: 1e7, 百万: 1e6, 万: 1e4 }[m[2]] || 1
  return num(m[1]) * unit
}
// 売上高（円）：「単位：百万円」などの表で、売上高の列の最初の数字
export function sales(text) {
  const t = z2h(text)
  const u = t.match(/単位[:：]\s*(百万円|千円|億円|円)/)
  const unit = u ? { 百万円: 1e6, 千円: 1e3, 億円: 1e8, 円: 1 }[u[1]] : 1e6
  const i = t.indexOf('売上高')
  if (i < 0) return null
  const after = t.slice(i, i + 1200)
  const nums = [...after.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})(?![0-9.%年月])/g)].map(m => num(m[1])).filter(x => x >= 100)
  return nums.length ? nums[0] * unit : null
}
if (process.argv[1] && process.argv[1].endsWith('study_order_size.mjs')) {
  const { stocks, bench } = loadAll({ withSwing: false, withSmall: true })
  const bi = new Map(bench.map((b, i) => [b.date, i]))
  const G = {}
  const push = (g, p, v) => ((G[g] ||= [[], [], []])[p].push(v))
  let read = 0, noAmt = 0, noSales = 0
  const bad = []
  for (const [key, v] of Object.entries(P)) {
    if (!v.text) continue
    const [c, date] = key.split('|')
    const st = stocks[c]; if (!st) continue
    const amt = orderAmount(v.text), sl = sales(v.text)
    if (!amt) { noAmt++; if (bad.length < 8) bad.push(['金額なし', key]); continue }
    if (!sl) { noSales++; if (bad.length < 8) bad.push(['売上なし', key, amt]); continue }
    read++
    const ratio = amt / sl * 100
    const B = st.bars
    const i = B.findIndex(b => b.date > date); if (i < 1) continue
    const prev = B[i - 1], x = B[i]; if (!x || x.h === x.l) continue
    const k0 = bi.get(x.date); if (k0 === undefined) continue
    const p = per(date)
    const rb = ratio < 3 ? '売上の3%未満' : ratio < 10 ? '売上の3〜10%' : '売上の10%以上'
    const g = (x.o / prev.c - 1) * 100, gb = g <= 2 ? '窓+2%以下' : '窓+2%超'
    for (const tag of [rb, rb + '・' + gb]) {
      push(tag + '・寄りの窓%', p, g)
      push(tag + '・A 寄り→引け', p, (x.c / x.o - 1) * 100 - (bench[k0].c / bench[k0].o - 1) * 100)
      const y = B[i + 4], k5 = y && bi.get(y.date)
      if (y && k5 !== undefined) push(tag + '・B 5日', p, (y.c / x.o - 1) * 100 - (bench[k5].c / bench[k0].o - 1) * 100)
    }
  }
  console.log(`読めた ${read}・金額が読めない ${noAmt}・売上が読めない ${noSales}`)
  for (const [g, a] of Object.entries(G).sort()) console.log(`  ${g.padEnd(28)} ` + a.map(x => `${fmt(mean(x))}(${x.length})`).join(' ／ '))
  if (process.argv.includes('--show')) for (const b of bad) console.log(b)
}
