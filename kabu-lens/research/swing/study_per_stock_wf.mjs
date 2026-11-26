// 株ごとに勝てる数字を当てはめる（11/26 本人の考え：箱ではなく、その株ごとの癖で買う値段・売る値段を決める。傾向で読めないか）
// 後から合わせないように「前の期間で選んで、次の期間で使う」（ウォークフォワード）：各株について、選ぶ日より前の trainDays 営業日の取引だけで一番良い組み合わせを選び、次の testDays 営業日にそのまま使う。
// 組み合わせ（12通り）：前日終値から −dip% の指値で買う（dip 2/4）、買値から +up% の指値で売る（up 2/4/6）、−stop% で損切り（4/8）、最長10日で引け。1銘柄1つずつ、決着してから次。滑り 往復0.2%
// 比べる相手：A) 全銘柄で同じ組み合わせ（その時点で前の期間に全銘柄で一番良かったもの）、B) 同じ日に買って同じ日数持つだけ
// 選び方の物差し：持つだけとの差の平均（取引8回以上の組み合わせだけ）。期間：前半／後半／直近（使う期間の日付で分ける）
// 結果（11/26。前半／後半／直近、持つだけとの差%）：
//   株ごとに選んだ数字（前の500日で選ぶ）−0.07／−0.20／−0.20、全銘柄で同じ数字 −0.09／−0.19／−0.13 → 株ごとに合わせても良くならない
//   癖がはっきりした株だけ（前の期間で持つだけより+1%以上・MINEDGE=1）：−0.09／−0.04／−0.12。+2%以上 −0.09／−0.02／+0.06（回数900ほど）。
//   選ぶ期間を変えても（250日 −0.08／−0.09／−0.19、1000日 +0.09／+0.04／−0.07）3つそろわない → 過去の値動きの癖は、次の半年には続かない（study_stock_history.mjs と同じ向き）
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const trainDays = Number(process.env.TRAIN || 500), testDays = Number(process.env.TEST || 120)
const { stocks } = loadAll({ withSwing: false })
const COMBOS = []
for (const dip of [2, 4]) for (const up of [2, 4, 6]) for (const stop of [4, 8]) COMBOS.push({ dip, up, stop })
const SL = 0.001
// 株ごと・組み合わせごとの取引の一覧（入った日の番号、%、持つだけの%）
function trades(B, c) {
  const out = []
  let i = 1
  while (i < B.length - 1) {
    const lim = B[i - 1].c * (1 - c.dip / 100)
    if (B[i].l > lim) { i++; continue }
    const e = Math.min(B[i].o, lim) * (1 + SL), tgt = e * (1 + c.up / 100), st = e * (1 - c.stop / 100)
    let j = i, x = null
    if (B[i].l <= st && B[i].o > lim) x = st * (1 - SL)
    while (x === null && ++j < B.length) {
      const b = B[j]
      if (b.l <= st) x = Math.min(b.o, st) * (1 - SL)
      else if (b.h >= tgt) x = Math.max(b.o, tgt) * (1 - SL)
      else if (j - i >= 10) x = b.c * (1 - SL)
    }
    if (x === null) break
    out.push({ i, j, r: (x / e - 1) * 100, base: (B[j].c / B[i].c - 1) * 100 })
    i = j + 1
  }
  return out
}
const res = { own: [[], [], []], glob: [[], [], []], ownBase: [[], [], []], globBase: [[], [], []] }
const T = {}
for (const [code, st] of Object.entries(stocks)) {
  if (st.bars.length < trainDays + testDays) continue
  T[code] = COMBOS.map(c => trades(st.bars, c))
}
// 日付の区切り（共通の営業日の並びで）
const allDates = [...new Set(Object.values(stocks).flatMap(s => s.bars.map(b => b.date)))].sort()
for (let s = trainDays; s < allDates.length; s += testDays) {
  const d0 = allDates[s - trainDays], d1 = allDates[s], d2 = allDates[Math.min(s + testDays, allDates.length - 1)]
  // 全銘柄で同じ組み合わせ：前の期間で全銘柄の差の平均が一番良いもの
  const gScore = COMBOS.map((_, k) => { const a = []; for (const [code, L] of Object.entries(T)) { const B = stocks[code].bars; for (const t of L[k]) { const dt = B[t.i].date; if (dt >= d0 && dt < d1 && stocks[code].turn[t.i] >= 1e8) a.push(t.r - t.base) } } return a.length ? mean(a) : -Infinity })
  const gk = gScore.indexOf(Math.max(...gScore))
  for (const [code, L] of Object.entries(T)) {
    const B = stocks[code].bars
    let best = -Infinity, bk = -1
    L.forEach((ts, k) => { const a = ts.filter(t => B[t.i].date >= d0 && B[t.i].date < d1).map(t => t.r - t.base); if (a.length >= 8 && mean(a) > best) { best = mean(a); bk = k } })
    const use = (k, key) => { for (const t of L[k]) { const dt = B[t.i].date; if (dt >= d1 && dt < d2 && stocks[code].turn[t.i] >= 1e8) { const p = per(dt); res[key][p].push(t.r); res[key + 'Base'][p].push(t.base) } } }
    // MINEDGE：前の期間で持つだけより MINEDGE% 以上良かった株だけ使う（癖がはっきりした株だけ）
    if (bk >= 0 && best >= Number(process.env.MINEDGE || -99)) use(bk, 'own')
    use(gk, 'glob')
  }
}
const line = k => res[k].map((a, p) => `${fmt(mean(a))}（持つだけ ${fmt(mean(res[k + 'Base'][p]))}・差 ${fmt(mean(a) - mean(res[k + 'Base'][p]))}・${a.length}回）`).join(' ／ ')
console.log(`前の${trainDays}営業日で選び、次の${testDays}営業日に使う（前半／後半／直近、1回の平均%）`)
console.log('  株ごとに選んだ数字 :', line('own'))
console.log('  全銘柄で同じ数字   :', line('glob'))
