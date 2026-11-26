// 超低位株のイナゴ（11/26 本人の問い）：株価が安い株（前日終値 100円未満／100〜300円）が1日で大きく上げた日に乗ると得か
// 日足10年（wide.json＋wide_small.json）。合図＝その日の終値が前日終値から +10%以上（ストップ高に近いものも含む）
// 買い方：A) その日の引けで買う、B) 翌日の寄りで買う。売り方：翌日の寄り／翌日の引け／5日目の引け。
// 低位株は1円刻みで値段の差が大きいので、買いと売りに1円ずつ不利に（滑り）入れる。全体（1306）との差ではなく、そのままの%（低位株は全体と動きが違うため）
// 期間：前半／後半／直近
// 結果（11/26。NOSLIP=1、前半／後半／直近）：
//  イナゴの形＝大きく上げた翌日の寄りで買う：+25%以上の翌日 寄り→引け 100〜300円 −3.06／−3.83／−6.07%、100円未満 −2.89／−3.97／−5.37%。5日持つと −4〜−11%。勝率2〜3割 → 負け
//  +25%以上の日の引けで買って翌朝の寄りで売ると +5〜+9%（勝率6〜7割）に見えるが、ほぼ全部が「高値で引けた日」（ストップ高で引けた日。買いが残って引けで買えない）。
//    高値より下で引けた日（引けで買える日）は 100〜300円 +0.30／+0.84／−1.88%、100円未満 +2.17／−0.12／+1.98%（回数が少ない）→ 買える日だけでは得がない
//  1円の滑りを入れると（既定）100円未満はどの形も −5〜−8%。超低位株は値段の刻みが大きく、売り買いの差だけで負ける
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const { stocks } = loadAll({ withSwing: false, withSmall: true })
const G = {}
const push = (g, p, v) => ((G[g] ||= [[], [], []])[p].push(v))
const win = {}
const pw = (g, p, v) => ((win[g] ||= [[0, 0], [0, 0], [0, 0]])[p][v > 0 ? 0 : 1]++)
for (const st of Object.values(stocks)) {
  const B = st.bars
  for (let i = 1; i < B.length - 6; i++) {
    const pc = B[i - 1].c, x = B[i]
    if (pc >= 300) continue
    const g = (x.c / pc - 1) * 100
    if (g < 10) continue
    if (st.turn[i - 1] < 1e7) continue // 売買代金が少なすぎる株（1,000万円未満）は買えないので除く
    const band = pc < 100 ? '100円未満' : '100〜300円'
    const gb = g >= 25 ? '+25%以上' : '+10〜25%'
    // 高値で引けた日（ストップ高で引けた日が多い）は、買いが多すぎて引けで買えないことが多い。高値より下で引けた日と分ける
    const hb = x.c >= x.h ? '高値引け' : '高値より下で引け'
    const p = per(x.date)
    const n1 = B[i + 1], n5 = B[i + 5]
    const SLP = process.env.NOSLIP ? 0 : 1 // NOSLIP=1：滑りなし（寄りと引けは板寄せなので、売り買いの差はかからない場合）
    const r = (buy, sell) => ((sell - SLP) / (buy + SLP) - 1) * 100
    for (const tag of [band, band + '・' + gb, band + '・' + gb + '・' + hb]) {
      const vals = { 'A 引けで買う→翌日の寄り': r(x.c, n1.o), 'A 引けで買う→翌日の引け': r(x.c, n1.c), 'A 引けで買う→5日': r(x.c, n5.c), 'B 翌日の寄りで買う→引け': r(n1.o, n1.c), 'B 翌日の寄りで買う→5日': r(n1.o, n5.c) }
      for (const [k, v] of Object.entries(vals)) { push(tag + '・' + k, p, v); pw(tag + '・' + k, p, v) }
    }
  }
}
console.log('（前半／後半／直近の平均%と回数。カッコの後ろは勝率%）')
for (const [g, a] of Object.entries(G).sort()) console.log(`  ${g.padEnd(34)} ` + a.map((x, j) => `${fmt(mean(x))}(${x.length},${x.length ? Math.round(win[g][j][0] / x.length * 100) : '-'}%)`).join(' ／ '))
