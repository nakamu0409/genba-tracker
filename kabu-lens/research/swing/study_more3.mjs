// まだ試していない形 その3（2026-11-21 本人の希望。先に一覧と分け方を決めてから回す）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_more3.mjs
// 1. 決算前の先回り：決算発表の日の5営業日前の寄りで買い、発表の前の営業日の引けで売る（反応の前に降りる）。TOPIX との差 − 0.2%。25日線の上・下で分ける
// 2. 年末の節税売りからの戻り：その年（1月の最初の営業日〜12月の最後の営業日）に大きく下げた株（下から20%）を、12月の最後の営業日の引けで買い、
//    1月の10営業日目の引けで売る。同じ日に全銘柄を買った平均とくらべる（売買代金1億円以上）
// 3. 連休の前後（TOPIX 連動ETF 1306。終値→終値）：次の営業日まで4日以上あく日（連休の前の日）／その次の日（連休明け）／ふつうの日
// 4. 配当の権利取りの先回り：3月・9月の権利付き最終日（月末の3営業日前）の15営業日前の引けで買い、権利付き最終日の引けで売る（配当はもらわない）。
//    予想配当利回り（J-Quants の FDivAnn ÷ 株価）の上位20%とほか。J-Quants の配当は2年分なので 2024-09・2025-03・2025-09・2026-03 の4回だけ
// 結果（11/21）：
//   1. 決算前の先回り：−0.17／−0.09／−0.09（25日線の上でも −0.32／−0.10／+0.21）。効かない
//   2. 年末の節税売り：差の平均 +0.12（2017〜2020）／+0.30（2021〜2024）／−2.48（2025）。年ごとにばらばらで効かない
//   3. 連休明けの日（1306 の終値→終値＝連休の前の引けで買い、明けの日の引けで売る）：年末年始を除くと +0.31(27)／+0.24(34)／+0.67(9)。
//      ふつうの日は +0.03／+0.05／+0.06。3つの期間とも約 +0.2〜0.3% 上。連休の前の日そのものは上がらない。見続ける候補（練習口座で試すか相談）
//   4. 配当の権利取りの先回り（2年・4回）：利回り上位20% − ほか ＝ +0.60／−0.03／+0.14／−0.11。効かない
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'

const A = SPLIT_DATE
const BB = '2025-11-14'
const D = loadAll({ withSwing: false })
const { stocks, bench } = D
const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
const bi = new Map(bench.map((b, i) => [b.date, i]))
const per = d => (d < A ? 0 : d < BB ? 1 : 2)
const p3 = (z, key = 'r') => [0, 1, 2].map(p => { const a = z.filter(x => per(x.date) === p).map(x => x[key]); return `${fmt(mean(a))}(${a.length})` }).join(' ')

// 1. 決算前の先回り
const pre = []
for (const [code, list] of Object.entries(irh)) {
  const st = stocks[code]
  if (!st || !Array.isArray(list)) continue
  for (const e of list) {
    const ie = st.idx.get(e.date)
    if (ie === undefined || ie < 65) continue
    const B = st.bars
    const s = ie - 5
    const x = ie - 1
    if (st.turn[s - 1] < 1e8 || B[s].h === B[s].l) continue
    const b0 = bi.get(B[s].date)
    const b1 = bi.get(B[x].date)
    if (b0 === undefined || b1 === undefined) continue
    let m25 = 0
    for (let k = s - 25; k < s; k++) m25 += B[k].c
    m25 /= 25
    pre.push({ date: e.date, up: B[s - 1].c > m25, r: (B[x].c / B[s].o - 1) * 100 - (bench[b1].c / bench[b0].o - 1) * 100 - 0.2 })
  }
}
console.log('1. 決算前の先回り（5営業日前の寄り→前の営業日の引け。TOPIX との差 − 0.2%。選ぶ／確かめる／最後の確認）')
console.log('  全部          ', p3(pre))
console.log('  25日線の上    ', p3(pre.filter(x => x.up)))
console.log('  25日線の下    ', p3(pre.filter(x => !x.up)))

// 2. 年末の節税売りからの戻り
const dates = bench.map(b => b.date)
const tax = []
for (let y = 2017; y <= 2025; y++) {
  const inY = dates.filter(d => d.startsWith(String(y)))
  const inJ = dates.filter(d => d.startsWith(`${y + 1}-01`))
  if (inY.length < 200 || inJ.length < 10) continue
  const d0 = inY[0]
  const dB = inY[inY.length - 1]
  const dS = inJ[9]
  const all = []
  for (const st of Object.values(stocks)) {
    const i0 = st.idx.get(d0)
    const iB = st.idx.get(dB)
    const iS = st.idx.get(dS)
    if (i0 === undefined || iB === undefined || iS === undefined || st.turn[iB] < 1e8) continue
    all.push({ ytd: st.bars[iB].c / st.bars[i0].c - 1, r: (st.bars[iS].c / st.bars[iB].c - 1) * 100 })
  }
  all.sort((a, b) => a.ytd - b.ytd)
  const lo = all.slice(0, Math.floor(all.length / 5))
  const avg = mean(all.map(x => x.r))
  tax.push({ year: y, n: lo.length, losers: mean(lo.map(x => x.r)), all: avg, diff: mean(lo.map(x => x.r)) - avg - 0.2 })
}
console.log('2. 年末の節税売りからの戻り（12月の最後の営業日の引け→1月の10営業日目の引け。その年に下げた下から20% − 全銘柄の平均 − 0.2%）')
for (const t of tax) console.log(`  ${t.year}→${t.year + 1}  ${String(t.n).padStart(4)}銘柄  下げた株 ${fmt(t.losers)}  全部 ${fmt(t.all)}  差 ${fmt(t.diff)}`)
const fin = a => a.filter(Number.isFinite)
const avgD = f => fmt(mean(fin(tax.filter(f).map(t => t.diff))))
console.log('  平均の差  前半(2017〜2020) ' + avgD(t => t.year <= 2020) + '  後半(2021〜2024) ' + avgD(t => t.year >= 2021 && t.year <= 2024) + '  最後(2025) ' + avgD(t => t.year === 2025))

// 3. 連休の前後（1306）
const b = bench.filter((x, i) => i === 0 || (x.c / bench[i - 1].c < 1.3 && x.c / bench[i - 1].c > 0.7))
const pre3 = []
const post3 = []
const norm = []
for (let i = 1; i + 1 < b.length; i++) {
  const r = { date: b[i].date, r: (b[i].c / b[i - 1].c - 1) * 100 }
  const gapNext = (new Date(b[i + 1].date) - new Date(b[i].date)) / 864e5
  const gapPrev = (new Date(b[i].date) - new Date(b[i - 1].date)) / 864e5
  if (gapNext >= 4) pre3.push(r)
  else if (gapPrev >= 4) post3.push(r)
  else norm.push(r)
}
console.log('3. 連休の前後（1306 の終値→終値。そのままの%。選ぶ／確かめる／最後の確認）')
console.log('  連休の前の日  ', p3(pre3))
console.log('  連休明けの日  ', p3(post3))
console.log('  ふつうの日    ', p3(norm))

// 4. 配当の権利取りの先回り
const fins = JSON.parse(readFileSync(new URL('../jq_fins.json', import.meta.url), 'utf-8'))
const div = {}
for (const l of Object.values(fins)) for (const r of l) if (r.FDivAnn !== '' && Number.isFinite(+r.FDivAnn) && +r.FDivAnn >= 0) (div[r.Code.slice(0, 4)] ||= []).push([r.DiscDate, +r.FDivAnn])
console.log('4. 配当の権利取りの先回り（権利付き最終日の15営業日前の引け→権利付き最終日の引け。TOPIX との差 − 0.2%）')
for (const ym of ['2024-09', '2025-03', '2025-09', '2026-03']) {
  const inM = dates.filter(d => d.startsWith(ym))
  const cum = inM[inM.length - 3]
  const ic = dates.indexOf(cum)
  const ds = dates[ic - 15]
  const bS = bi.get(ds)
  const bC = bi.get(cum)
  const z = []
  for (const st of Object.values(stocks)) {
    const is = st.idx.get(ds)
    const ie = st.idx.get(cum)
    if (is === undefined || ie === undefined || st.turn[is] < 1e8) continue
    const dv = (div[st.code] || []).filter(([d]) => d <= ds).sort().pop()
    if (!dv) continue
    z.push({ y: dv[1] / st.bars[is].c * 100, r: (st.bars[ie].c / st.bars[is].c - 1) * 100 - (bench[bC].c / bench[bS].c - 1) * 100 - 0.2 })
  }
  z.sort((a, b) => b.y - a.y)
  const top = z.slice(0, Math.floor(z.length / 5))
  const rest = z.slice(Math.floor(z.length / 5))
  console.log(`  ${ym}（${ds}→${cum}）  利回り上位20%（${top.length}銘柄・利回り${fmt(mean(top.map(x => x.y)), 1)}%） ${fmt(mean(top.map(x => x.r)))}  ほか ${fmt(mean(rest.map(x => x.r)))}`)
}
// 3b. 連休明けを、年末年始とそれ以外に分ける（年末年始が引っ張っていないか）
const ny = post3.filter(x => x.date.slice(5, 7) === '01' && Number(x.date.slice(8)) <= 7)
const other = post3.filter(x => !(x.date.slice(5, 7) === '01' && Number(x.date.slice(8)) <= 7))
console.log('3b. 連休明けの日（1306）')
console.log('  年末年始明け  ', p3(ny))
console.log('  それ以外      ', p3(other))
