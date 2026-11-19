// 全部入りの口座を10年分（2017〜2026年11月）、1日ずつ動かす。「今の決まりで、今の資金なら月いくら増えるか」を出す
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_portfolio.mjs
//
// 決まり（今の記録帳の settings と夜の点検の手順 3a・3b に合わせた）：
// ・毎朝、前の営業日の夜に出た合図で、寄りに買う。1日の買いは dayTradeMax（5）回まで。順番は
//   (1) 企業の行動（株式分割 → 自社株買い・良い条件2つ以上 → 増配 → 自社株買い・良い条件1つ。0は見送り）。寄指＝前日の終値×1.02 以下で寄ったときだけ。
//       株数＝（資金×maxPosPct、現金）÷ 寄り値。自社株買い・増配はその日の引けで売る。株式分割は寄り値×0.92 の逆指値を置き、5営業日目の引けで売る
//   (2) 急騰の押し目（売買代金の大きい順に2件まで。3R・10日）
//   (3) スイングの候補（買いスコアの高い順。寄りが前日の終値+2%以内。3R・40日）
// ・(2)(3) の株数＝ 1回の損失の上限（資金×riskPct）÷（寄り値−損切り）、資金×maxPosPct ÷ 寄り値、現金 ÷ 寄り値、
//   「損の合計の上限（1回の上限×maxOpenRiskMult）− 持ち越している株の (終値−損切り)×株数」÷（寄り値−損切り）の一番小さいもの。100株単位
// ・日足なので、同じ日に損切りと目標の両方に届いたら損切りとみる。成行・逆指値は0.1%不利。手数料0（楽天のゼロコース）。税金・配当は入れていない
// ・入っていないもの：場中のデイトレ・低位株の強い引け・夜のPTS（10年分の5分足・1時間足が無いため）
// ・気をつけること：銘柄は今も上場している約1,400銘柄（倒産・上場廃止した株が入っていない＝成績は甘めに出る）。自社株買いの「良い条件」は同じ10年で見つけたもの
import { loadAll, SLIP, mean, median, fmt } from './lib_signals.mjs'

const D = loadAll()
const { stocks, bench } = D
const dates = bench.map(b => b.date).filter(d => d >= '2017-01-04')
const prevOf = new Map()
for (let i = 1; i < bench.length; i++) prevOf.set(bench[i].date, bench[i - 1].date)
const byDate = (arr, key = 'date') => {
  const m = new Map()
  for (const x of arr) {
    if (!m.has(x[key])) m.set(x[key], [])
    m.get(x[key]).push(x)
  }
  return m
}
const EV = byDate(D.events)
const SU = byDate(D.surge)
const SW = byDate(D.swing)
const evRank = e => (e.kind === 'split' ? 0 : e.kind === 'buyback' && e.score >= 2 ? 1 : e.kind === 'divup' ? 2 : e.kind === 'buyback' && e.score === 1 ? 3 : 9)

function run(P) {
  let cash = P.capital
  let pos = []
  const trades = []
  const hist = []
  let equityPrev = P.capital
  for (const d of dates.filter(x => (!P.start || x >= P.start) && (!P.end || x < P.end))) {
    const pd = prevOf.get(d)
    const riskOne = equityPrev * P.riskPct / 100
    const maxPos = equityPrev * P.maxPosPct / 100
    const barOf = code => {
      const st = stocks[code]
      const k = st.idx.get(d)
      return k === undefined ? null : { b: st.bars[k], k, st }
    }
    // 持ち越している株の損（今の終値から損切りまで）
    const openRisk = () => pos.reduce((s, p) => s + Math.max(0, (p.last - p.stop)) * p.qty, 0)
    let buys = 0
    const todayCodes = new Set(pos.map(p => p.code))
    const close = (p, price, reason) => {
      cash += p.qty * price
      trades.push({ track: p.track, code: p.code, entryDate: p.entryDate, exitDate: d, entry: p.entry, exit: price, qty: p.qty, pnl: (price - p.entry) * p.qty, reason })
    }
    // 1. 朝：企業の行動
    if (P.tracks.events) {
      for (const e of (EV.get(pd) || []).filter(x => P.bbAll || evRank(x) < 9).sort((a, b) => evRank(a) - evRank(b))) {
        if (buys >= P.dayMax || todayCodes.has(e.code)) continue
        const x = barOf(e.code)
        if (!x || x.b.h === x.b.l || x.b.o > e.limit) continue
        const o = x.b.o * (1 + (P.evSlip || 0))
        const qty = Math.floor(Math.min(maxPos, cash) / o / 100) * 100
        if (qty < 100) continue
        buys++
        todayCodes.add(e.code)
        cash -= qty * o
        if (e.kind === 'split') {
          const p = { track: 'split', code: e.code, entryDate: d, entry: o, qty, stop: o * 0.92, target: Infinity, maxDays: 5, held: 0, last: o }
          pos.push(p)
        } else {
          const p = { track: e.kind, code: e.code, entryDate: d, entry: o, qty }
          close(p, x.b.c * (1 - (P.evSlip || 0)), '大引け')
        }
      }
    }
    // 2. 朝：急騰の押し目・スイング（損の合計の上限の中で）
    const addRisky = (track, list, max, rMult, maxDays, gapMax) => {
      let n = 0
      for (const s of list) {
        if (buys >= P.dayMax || n >= max) break
        if (todayCodes.has(s.code)) continue
        const x = barOf(s.code)
        if (!x || x.b.h === x.b.l) continue
        if (gapMax !== null && x.b.o > s.close * (1 + gapMax / 100)) continue
        const entry = x.b.o * (1 + SLIP)
        const rps = entry - s.stop
        if (!(rps > 0)) continue
        const room = riskOne * P.maxOpenRiskMult - openRisk()
        const qty = Math.floor(Math.min(riskOne / rps, maxPos / entry, cash / entry, Math.max(0, room) / rps) / 100) * 100
        if (qty < 100) continue
        buys++
        n++
        todayCodes.add(s.code)
        cash -= qty * entry
        pos.push({ track, code: s.code, entryDate: d, entry, qty, stop: s.stop, target: entry + rMult * rps, maxDays, held: 0, last: entry })
      }
    }
    if (P.tracks.surge) {
      const list = (SU.get(pd) || []).map(s => ({ ...s, close: stocks[s.code].bars[s.i].c, turnover: stocks[s.code].turn[s.i] })).sort((a, b) => b.turnover - a.turnover)
      addRisky('surge', list, P.surgeMax, 3, 10, null)
    }
    if (P.tracks.swing) {
      const list = (SW.get(pd) || []).slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      addRisky('swing', list, 99, 3, 40, 2)
    }
    // 3. 1日の値動きで決着（今日買った株も含む）
    const keep = []
    for (const p of pos) {
      const x = barOf(p.code)
      if (!x) {
        keep.push(p)
        continue
      }
      const b = x.b
      p.held++
      const first = p.entryDate === d
      let done = false
      if (!first && b.o <= p.stop) { close(p, b.o * (1 - SLIP), '損切り（寄り）'); done = true } else if (b.l <= p.stop) { close(p, p.stop * (1 - SLIP), '損切り'); done = true } else if (!first && b.o >= p.target) { close(p, b.o, '目標（寄り）'); done = true } else if (b.h >= p.target) { close(p, p.target, '目標'); done = true } else if (p.held >= p.maxDays) { close(p, b.c * (1 - SLIP), '期間切れ'); done = true }
      if (!done) {
        p.last = b.c
        keep.push(p)
      }
    }
    pos = keep
    const equity = cash + pos.reduce((s, p) => s + p.qty * p.last, 0)
    hist.push({ date: d, equity, cash, invested: equity - cash, n: pos.length })
    equityPrev = equity
  }
  return { hist, trades }
}

function report(name, P) {
  const { hist, trades } = run(P)
  const months = new Map()
  for (const h of hist) months.set(h.date.slice(0, 7), h.equity)
  const ms = [...months.entries()]
  const mret = []
  const myen = []
  let prevE = P.capital
  for (const [, e] of ms) {
    mret.push((e / prevE - 1) * 100)
    myen.push(e - prevE)
    prevE = e
  }
  let peak = P.capital
  let mdd = 0
  for (const h of hist) {
    peak = Math.max(peak, h.equity)
    mdd = Math.min(mdd, (h.equity / peak - 1) * 100)
  }
  const last = hist[hist.length - 1].equity
  const years = (new Date(hist[hist.length - 1].date) - new Date(hist[0].date)) / 365.25 / 864e5
  if (!hist.length) return null
  const cagr = ((last / P.capital) ** (1 / years) - 1) * 100
  const recent = mret.slice(-36)
  console.log(`\n■ ${name}`)
  console.log(`  ${P.capital.toLocaleString()}円 → ${Math.round(last).toLocaleString()}円（年率 ${fmt(cagr, 1)}%）・一番下げたとき ${fmt(mdd, 1)}%・売買 ${trades.length}回`)
  console.log(`  月ごと：平均 ${fmt(mean(mret))}%・中央 ${fmt(median(mret))}%・マイナスの月 ${(mret.filter(x => x < 0).length / mret.length * 100).toFixed(0)}%・一番悪い月 ${fmt(Math.min(...mret), 1)}%・一番良い月 ${fmt(Math.max(...mret), 1)}%`)
  console.log(`  はじめの資金のままで考えた月の増減の目安：平均 ${fmt(mean(mret) / 100 * P.capital / 1e4, 1)}万円・中央 ${fmt(median(mret) / 100 * P.capital / 1e4, 1)}万円（直近3年：平均 ${fmt(mean(recent) / 100 * P.capital / 1e4, 1)}万円・マイナスの月 ${(recent.filter(x => x < 0).length / recent.length * 100).toFixed(0)}%）`)
  const yr = {}
  let ye = P.capital
  for (const [m, e] of ms) {
    if (m.endsWith('-12') || m === ms[ms.length - 1][0]) {
      yr[m.slice(0, 4)] = (e / ye - 1) * 100
      ye = e
    }
  }
  console.log('  年ごと：' + Object.entries(yr).map(([y, v]) => `${y.slice(2)}:${fmt(v, 0)}%`).join(' '))
  const byT = {}
  for (const t of trades) {
    const g = (byT[t.track] ||= { n: 0, pnl: 0, win: 0 })
    g.n++
    g.pnl += t.pnl
    if (t.pnl > 0) g.win++
  }
  console.log('  やり方ごと：' + Object.entries(byT).map(([k, g]) => `${k} ${g.n}回・勝率${(g.win / g.n * 100).toFixed(0)}%・計${fmt(g.pnl / 1e4, 0)}万円`).join(' ／ '))
  console.log(`  株を持っていた割合（資産のうち）：平均 ${(mean(hist.map(h => h.invested / h.equity)) * 100).toFixed(0)}%・保有の数 平均 ${mean(hist.map(h => h.n)).toFixed(1)}`)
  return { mret, last }
}

const BASE = { capital: 1e6, riskPct: 1, maxPosPct: 30, maxOpenRiskMult: 3, dayMax: 5, surgeMax: 2, tracks: { events: true, surge: true, swing: true } }
// 比べる相手：TOPIX 連動ETF を買って持っておく
{
  const b0 = bench.find(b => b.date >= dates[0])
  const bl = bench[bench.length - 1]
  const m = new Map()
  for (const b of bench) if (b.date >= dates[0]) m.set(b.date.slice(0, 7), b.c)
  const v = [...m.values()]
  const r = v.map((x, i) => (i ? x / v[i - 1] - 1 : x / b0.o - 1) * 100)
  console.log(`■ 比べる相手：TOPIX 連動ETF を持っておく  ${fmt((bl.c / b0.o - 1) * 100, 0)}%（月の平均 ${fmt(mean(r))}%・マイナスの月 ${(r.filter(x => x < 0).length / r.length * 100).toFixed(0)}%・100万円なら月平均 ${fmt(mean(r) / 100 * 100, 1)}万円）`)
}
report('今の決まり（全部入り・100万円・1回の損1%）', BASE)
report('企業の行動だけ', { ...BASE, tracks: { events: true } })
report('スイングだけ', { ...BASE, tracks: { swing: true } })
report('急騰の押し目だけ', { ...BASE, tracks: { surge: true } })
report('企業の行動＋急騰の押し目（スイングなし）', { ...BASE, tracks: { events: true, surge: true } })
report('全部入り・1回の損2%', { ...BASE, riskPct: 2 })
report('全部入り・攻め（1回の損5%・1銘柄50%）', { ...BASE, riskPct: 5, maxPosPct: 50 })
report('全部入り・300万円', { ...BASE, capital: 3e6 })

console.log('\n======== 確かめ（甘く出ていないか）')
report('全部入り・企業の行動の売買を毎回0.1%ずつ不利に', { ...BASE, evSlip: 0.001 })
report('全部入り・企業の行動の売買を毎回0.3%ずつ不利に（寄りと引けの値段のぶれ）', { ...BASE, evSlip: 0.003 })
report('全部入り・自社株買いの「良い条件」を使わない（全部買う）', { ...BASE, bbAll: true })
report('全部入り・前半5年だけ（2017-01〜2021-11）', { ...BASE, end: '2021-11-19' })
report('全部入り・後半5年だけ（2021-11〜2026-11）', { ...BASE, start: '2021-11-19' })
report('企業の行動＋急騰の押し目・前半5年だけ', { ...BASE, tracks: { events: true, surge: true }, end: '2021-11-19' })
report('企業の行動＋急騰の押し目・後半5年だけ', { ...BASE, tracks: { events: true, surge: true }, start: '2021-11-19' })
