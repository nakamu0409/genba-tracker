// 本人の考え（11/25）：米国で半導体（SOX）が大きく下げた翌日、半導体の影響を受けにくい株は上がり続けるのでは。買うと得か
// SOX の前の米国の日の騰落が −3% 以下の日（と −2%・+3% 以上も参考）に、各株の「SOX への感応度」（その日より前の120営業日で、日本の終値→終値 を 前の米国の日の SOX の騰落 で回帰した傾き）で3つに分ける。
// 当日の寄り→引け（%、そのまま と 全部の株の平均との差）、当日の引け→5営業日あとの引け（全体との差）を比べる。期間：前半／後半／直近。滑りは入れない（入れると0.2%ほど悪くなる）
// 結果（11/25。前半／後半／直近）：SOX −3%以下の翌日、感応度の低い3分の1は寄り→引け +0.46／+0.07／+0.20%、高い3分の1は +0.49／+0.05／+0.25%。全体との差はどれも ±0.05% 以内で差が無い。
//   その後5日も低い3分の1が良いわけではない（直近 −0.49%）。−2〜−3%の日も差は ±0.1% 以内。「半導体と関係ない株を選んで買う」得は無い（採らない）
import { readFileSync } from 'node:fs'
import { loadAll, mean, fmt, SPLIT_DATE } from './lib_signals.mjs'
const BB = '2025-11-14', per = d => (d < SPLIT_DATE ? 0 : d < BB ? 1 : 2)
const sx = JSON.parse(readFileSync(new URL('../world/SOX.json', import.meta.url), 'utf-8')).chart.result[0]
const soxS = sx.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: sx.indicators.quote[0].close[i] })).filter(x => x.c != null)
const soxRet = soxS.map((x, i) => (i ? { date: x.date, r: (x.c / soxS[i - 1].c - 1) * 100 } : null)).filter(Boolean)
// 日本の日 d の前の米国の日の SOX 騰落
const prevSox = d => { let a = null; for (let lo = 0, hi = soxRet.length - 1; lo <= hi;) { const m = (lo + hi) >> 1; if (soxRet[m].date < d) { a = soxRet[m]; lo = m + 1 } else hi = m - 1 } return a ? a.r : null }
const { stocks, bench } = loadAll({ withSwing: false })
const days = bench.map(b => b.date)
const sxOf = new Map(days.map(d => [d, prevSox(d)]))
const idx = {}; for (const [c, st] of Object.entries(stocks)) idx[c] = new Map(st.bars.map((b, i) => [b.date, i]))
const beta = (st, i) => {
  if (i < 121) return null
  let sx2 = 0, sxy = 0, sxm = 0, sym = 0, n = 0; const xs = [], ys = []
  for (let j = i - 120; j < i; j++) { const s = sxOf.get(st.bars[j].date); if (s == null) continue; xs.push(s); ys.push((st.bars[j].c / st.bars[j - 1].c - 1) * 100) }
  n = xs.length; if (n < 80) return null
  sxm = mean(xs); sym = mean(ys)
  for (let k = 0; k < n; k++) { sx2 += (xs[k] - sxm) ** 2; sxy += (xs[k] - sxm) * (ys[k] - sym) }
  return sxy / sx2
}
const run = (title, cond) => {
  const G = ['感応度 低い3分の1', '真ん中', '高い3分の1'].map(name => ({ name, oc: [[], [], []], exoc: [[], [], []], ex5: [[], [], []], win: [[], [], []] }))
  let nd = [0, 0, 0]
  for (const d of days) {
    const s = sxOf.get(d); if (s == null || !cond(s)) continue
    const rows = []
    for (const [c, st] of Object.entries(stocks)) {
      const i = idx[c].get(d); if (i === undefined || i + 5 >= st.bars.length) continue
      const b = beta(st, i); if (b == null) continue
      const B = st.bars
      rows.push({ b, oc: (B[i].c / B[i].o - 1) * 100, f5: (B[i + 5].c / B[i].c - 1) * 100 })
    }
    if (rows.length < 100) continue
    const p = per(d); nd[p]++
    const mOC = mean(rows.map(r => r.oc)), m5 = mean(rows.map(r => r.f5))
    rows.sort((a, b) => a.b - b.b)
    const t = Math.floor(rows.length / 3)
    ;[rows.slice(0, t), rows.slice(t, rows.length - t), rows.slice(rows.length - t)].forEach((g, k) => {
      const oc = mean(g.map(r => r.oc))
      G[k].oc[p].push(oc); G[k].exoc[p].push(oc - mOC); G[k].ex5[p].push(mean(g.map(r => r.f5)) - m5); G[k].win[p].push(oc > 0 ? 100 : 0)
    })
  }
  console.log(`\n■ ${title}（日数 ${nd.join('／')}）前半／後半／直近`)
  for (const g of G) {
    const f = a => a.map(x => fmt(mean(x)) + '%').join(' ／ ')
    console.log(`  ${g.name.padEnd(12)} 寄り→引け ${f(g.oc)}  全体との差 ${f(g.exoc)}  プラスの日 ${f(g.win)}  その後5日の全体との差 ${f(g.ex5)}`)
  }
}
run('SOX −3%以下の翌日', s => s <= -3)
run('SOX −2〜−3%の翌日', s => s <= -2 && s > -3)
run('参考：SOX +3%以上の翌日', s => s >= 3)
console.log('\n昨夜（直近の米国の日）の SOX：', soxRet.at(-1))
