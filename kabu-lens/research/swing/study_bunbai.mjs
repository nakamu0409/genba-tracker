// 立会外分売（楽天で申し込める。前の日の終値から数%安い値段で買える）は稼げるか（2026-11-23。先に一覧を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_bunbai.mjs   （先に fetch_small.mjs ir で irevents2.json を作る）
// 「立会外分売実施に関するお知らせ」の日（D1、引けのあと）に値段が決まり、次の営業日（D2）の朝、寄りの前に受け渡し。
// 分売の値段＝D1 の終値 ×（1 − 割引）。割引は開示の PDF にしか無いので、ここでは D1 の終値からの騰落を出し、割引が何%なら得になるかを見る。
// 出すもの：D2 の寄り・引け、5日後の引けの D1 終値からの%（そのまま／TOPIX 比）。期間：選ぶ／確かめる／最後の確認
// 結果（2026-11-23、wide.json の1,403社・10年で119件）：翌朝の寄りは D1 の終値から平均 −1.09／−0.49／−1.84%（真ん中 −1.39／−0.14／−1.35%）。
//   割引が2%なら寄りで売って得になるのは71%・平均+1.0%、2.5%なら81%・+1.6%、3%なら87%・+2.1%。5日持つと得は減る（寄りで売るのが良い）。
//   注意：割引の%は PDF にしか無い（ここでは仮定）。人気の分売は抽選で買えないことがある。1人あたりの上限株数がある。件数が少ない（小さい会社を足してもう一度）
import { readFileSync } from 'node:fs'
import { loadAll, mean, median, fmt, SPLIT_DATE } from './lib_signals.mjs'
const A = SPLIT_DATE, BB = '2025-11-14'
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const ir = JSON.parse(readFileSync(new URL('../irevents2.json', import.meta.url), 'utf-8'))
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const bi = new Map(bench.map((b, i) => [b.date, i]))
const G = { open: [], close: [], d5: [], ex5: [], openSmall: [], openBig: [] }
let n = 0
for (const [code, list] of Object.entries(ir)) {
  const st = stocks[code]
  if (!st || !list) continue
  const seen = new Set()
  for (const r of list) {
    if (!/立会外分売実施/.test(r.title) || seen.has(r.date)) continue
    seen.add(r.date)
    const i = st.idx.get(r.date)
    if (i === undefined || i + 6 >= st.bars.length) continue
    const B = st.bars
    const c1 = B[i].c, x = B[i + 1], z = B[i + 5]
    const p = per(r.date)
    n++
    const k1 = bi.get(B[i].date), k5 = bi.get(z.date), k2 = bi.get(x.date)
    G.open.push({ p, v: (x.o / c1 - 1) * 100 })
    G.close.push({ p, v: (x.c / c1 - 1) * 100 })
    G.d5.push({ p, v: (z.c / c1 - 1) * 100 })
    if (k1 !== undefined && k5 !== undefined) G.ex5.push({ p, v: (z.c / c1 - 1) * 100 - (bench[k5].c / bench[k1].c - 1) * 100 })
    ;(st.turn[i] < 3e8 ? G.openSmall : G.openBig).push({ p, v: (x.o / c1 - 1) * 100 })
  }
}
const show = (name, a) => {
  const g = [0, 1, 2].map(p => a.filter(x => x.p === p).map(x => x.v))
  console.log(`  ${name.padEnd(30)} ${g.map(z => `平均${fmt(mean(z))}%・真ん中${fmt(median(z))}%(${z.length})`).join('  ')}`)
}
console.log(`立会外分売の実施 ${n}件（前日 D1 の終値からの%）`)
show('翌朝（D2）の寄り', G.open)
show('D2 の引け', G.close)
show('5日後の引け', G.d5)
show('5日後の引け（TOPIX 比）', G.ex5)
show('寄り：売買代金3億円未満の会社', G.openSmall)
show('寄り：3億円以上の会社', G.openBig)
const all = G.open.map(x => x.v).sort((a, b) => a - b)
for (const disc of [1.5, 2, 2.5, 3]) {
  const win = all.filter(v => v > -disc).length / all.length * 100
  console.log(`  割引 ${disc}% のとき：寄りで売って得になる割合 ${win.toFixed(0)}%・平均の損益 ${fmt(mean(all.map(v => (1 + v / 100) / (1 - disc / 100) * 100 - 100)))}%`)
}
