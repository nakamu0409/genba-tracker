// 世界の状況（前の夜の米国・VIX・ドル円・金利・半導体など）で、日本の翌日と今のやり方の成績が変わるか（10年）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_world.mjs
// ・日本の日付 d には、d より前の日付で終わった海外の最後の足を使う（米国の引けは日本の朝。寄りの前に分かる）
// ・見るもの：TOPIX 連動ETF の窓・寄り→引け、企業の行動（寄り→引け・全体比）、急騰の押し目（R）、スイング（R）
// ・前半（2021-11-18 まで）と後半で同じ向きなら、たまたまではない見込みが少し高い
import { readFileSync } from 'node:fs'
import { loadAll, simulate, mean, fmt, SPLIT_DATE, SLIP } from './lib_signals.mjs'

function series(file, tz) {
  const j = JSON.parse(readFileSync(new URL('../world/' + file + '.json', import.meta.url), 'utf-8')).chart.result[0]
  const q = j.indicators.quote[0]
  const out = []
  j.timestamp.forEach((t, i) => {
    if (q.close[i] === null || q.close[i] === undefined) return
    const d = new Date((t + (tz || 0)) * 1000).toISOString().slice(0, 10)
    out.push({ date: d, c: q.close[i], o: q.open[i] })
  })
  return out
}
// 米国は現地の日付（ニューヨークは UTC−5 前後）
const NY = -5 * 3600
const W = {
  spx: series('GSPC', NY), sox: series('SOX', NY), vix: series('VIX', NY), tnx: series('TNX', NY),
  jpy: series('JPYX', 0), oil: series('CLF', NY), nkf: series('NIYF', NY)
}
function asOf(s) {
  // 日本の日付 d → d より前の最後の足の番号
  return d => {
    let lo = 0
    let hi = s.length - 1
    let ans = -1
    while (lo <= hi) {
      const m = (lo + hi) >> 1
      if (s[m].date < d) {
        ans = m
        lo = m + 1
      } else hi = m - 1
    }
    return ans
  }
}
const AT = Object.fromEntries(Object.entries(W).map(([k, s]) => [k, asOf(s)]))
const chg = (k, d, n = 1) => {
  const s = W[k]
  const i = AT[k](d)
  return i >= n ? (s[i].c / s[i - n].c - 1) * 100 : null
}
const lvl = (k, d) => {
  const i = AT[k](d)
  return i >= 0 ? W[k][i].c : null
}
function world(d) {
  return { spx: chg('spx', d), sox: chg('sox', d), vix: lvl('vix', d), vix5: chg('vix', d, 5), jpy: chg('jpy', d), tnx: (() => { const i = AT.tnx(d); return i >= 1 ? W.tnx[i].c - W.tnx[i - 1].c : null })(), oil: chg('oil', d), spx20: chg('spx', d, 20) }
}

const t0 = Date.now()
const D = loadAll()
const { stocks, bench } = D
console.log(`読み込み ${((Date.now() - t0) / 1000).toFixed(0)}秒`)
const bIdx = new Map(bench.map((b, i) => [b.date, i]))
const benchOC = d => {
  const i = bIdx.get(d)
  return i === undefined ? 0 : (bench[i].c / bench[i].o - 1) * 100
}

// 1) TOPIX 連動ETF の日ごと
const days = []
for (let i = 1; i < bench.length; i++) {
  const b = bench[i]
  days.push({ date: b.date, w: world(b.date), gap: (b.o / bench[i - 1].c - 1) * 100, oc: (b.c / b.o - 1) * 100 })
}
// 2) やり方ごと（買う日の世界の状況で分ける）
const res = { event: [], surge: [], swing: [] }
for (const ev of D.events) {
  const B = stocks[ev.code].bars
  const e = ev.i + 1
  if (e >= B.length || B[e].h === B[e].l || B[e].o > ev.limit) continue
  if (ev.kind === 'buyback' && ev.score === 0) continue
  if (ev.kind === 'split') continue
  res.event.push({ date: B[e].date, w: world(B[e].date), v: (B[e].c / B[e].o - 1) * 100 - benchOC(B[e].date) })
}
for (const s of D.surge) {
  const st = stocks[s.code]
  const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 10 })
  if (t) res.surge.push({ date: st.bars[t.e].date, w: world(st.bars[t.e].date), v: t.r })
}
for (const s of D.swing) {
  const st = stocks[s.code]
  const t = simulate(st.bars, s.i, s.stop, { rMult: 3, maxDays: 40, gapMax: 2 })
  if (t) res.swing.push({ date: st.bars[t.e].date, w: world(st.bars[t.e].date), v: t.r })
}

const CUTS = [
  ['全部', () => true],
  ['前夜の S&P500 −2%以下', w => w.spx !== null && w.spx <= -2],
  ['前夜の S&P500 −1〜−2%', w => w.spx !== null && w.spx > -2 && w.spx <= -1],
  ['前夜の S&P500 ±1%', w => w.spx !== null && Math.abs(w.spx) < 1],
  ['前夜の S&P500 +1%以上', w => w.spx !== null && w.spx >= 1],
  ['前夜の半導体（SOX）−3%以下', w => w.sox !== null && w.sox <= -3],
  ['前夜の半導体（SOX）+3%以上', w => w.sox !== null && w.sox >= 3],
  ['VIX 30以上（恐怖が強い）', w => w.vix !== null && w.vix >= 30],
  ['VIX 20〜30', w => w.vix !== null && w.vix >= 20 && w.vix < 30],
  ['VIX 15未満（落ち着いている）', w => w.vix !== null && w.vix < 15],
  ['VIX 5日で+30%以上（急に上がった）', w => w.vix5 !== null && w.vix5 >= 30],
  ['ドル円 −1%以下（急な円高）', w => w.jpy !== null && w.jpy <= -1],
  ['ドル円 +1%以上（急な円安）', w => w.jpy !== null && w.jpy >= 1],
  ['米10年金利 +0.1以上（急上昇）', w => w.tnx !== null && w.tnx >= 0.1],
  ['米10年金利 −0.1以下（急低下）', w => w.tnx !== null && w.tnx <= -0.1],
  ['原油 −4%以下', w => w.oil !== null && w.oil <= -4],
  ['S&P500 20日で−5%以下（米国が下げ相場）', w => w.spx20 !== null && w.spx20 <= -5],
  ['S&P500 20日で+5%以上（米国が強い）', w => w.spx20 !== null && w.spx20 >= 5]
]
function table(title, xs, key, unit) {
  console.log(`\n■ ${title}（${unit}）`)
  for (const [name, fn] of CUTS) {
    const z = xs.filter(x => fn(x.w))
    if (z.length < 30) {
      console.log(`  ${name.padEnd(30)} ${String(z.length).padStart(6)}件（少ない）`)
      continue
    }
    const A = z.filter(x => x.date < SPLIT_DATE).map(x => x[key])
    const B = z.filter(x => x.date >= SPLIT_DATE).map(x => x[key])
    const same = A.length >= 20 && B.length >= 20 && Math.sign(mean(A)) === Math.sign(mean(B))
    console.log(`  ${name.padEnd(30)} ${String(z.length).padStart(6)}件 平均${fmt(mean(z.map(x => x[key])), 3).padStart(7)}  前半${fmt(mean(A), 3).padStart(7)}（${A.length}）後半${fmt(mean(B), 3).padStart(7)}（${B.length}）${same ? ' 同じ向き' : ''}`)
  }
}
table('TOPIX 連動ETF の窓（前日の引け→寄り）', days, 'gap', '%')
table('TOPIX 連動ETF の寄り→引け', days, 'oc', '%')
table('企業の行動の翌日（寄り→引け・全体比）', res.event, 'v', '%')
table('急騰の押し目（3R・10日）', res.surge, 'v', 'R')
table('スイングの候補（3R・40日）', res.swing, 'v', 'R')
void SLIP
