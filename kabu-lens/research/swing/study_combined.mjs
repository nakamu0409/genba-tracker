// 統合版の口座：検証で「使える」となった形を全部、同じ資金で同時に動かす（2026-11-20 本人の希望）
// 使い方: node --max-old-space-size=7000 kabu-lens/research/swing/study_combined.mjs
// study_portfolio.mjs の「全部入りの口座」（企業の行動・急騰の押し目・スイング）に、次を1つずつ足して比べる：
//  ・avoid：スイングの候補から「7日続けて上げた」「25日線から+25%以上」「前の日に+15%以上で高値引け」を外す
//  ・swingR：スイングの目標を 3R → 5R
//  ・usBear：米国の下げ相場（S&P500 が20日で −5% 以下）の日は、新しいスイングを1件まで
//  ・crash：急落の反発（5日で −15% 以下・10日ぶり・300円以上 → 翌日の寄りで買い5日目の引け。−20%の非常用の損切り。資金の10%。1日2件。1,500円以上を先に）
//  ・tsurare：つられ下げ（TOPIX の窓 −2.5% 以下の日に、窓 −5% 以下・300円以上の株をその日の寄りで。5日。同じく10%・2件）
//  ・etf：TOPIX 連動ETF が1日で −3% 以下 → 翌日の寄りで ETF を資金の20%、20日
// 期間：10年・前半（〜2021-11-18）・後半（2021-11-19〜2025-11-13）・最後の確認（2025-11-14〜）
import { readFileSync } from 'node:fs'
import { loadAll, SLIP, mean, fmt } from './lib_signals.mjs'

const D = loadAll()
const { stocks, bench } = D
const dates = bench.map(b => b.date).filter(d => d >= '2017-01-04')
const prevOf = new Map()
for (let i = 1; i < bench.length; i++) prevOf.set(bench[i].date, bench[i - 1].date)
const bi = new Map(bench.map((b, i) => [b.date, i]))
const byDate = arr => {
  const m = new Map()
  for (const x of arr) {
    if (!m.has(x.date)) m.set(x.date, [])
    m.get(x.date).push(x)
  }
  return m
}
const EV = byDate(D.events)
const SU = byDate(D.surge)
const SW = byDate(D.swing)
// 業種（J-Quants の17業種。2024-08 時点の区分を全期間に当てる）
const SEC = (() => {
  try {
    const m = JSON.parse(readFileSync(new URL('../jq_master.json', import.meta.url), 'utf-8'))
    const l = Array.isArray(m) ? m : Object.values(m).flat()
    return new Map(l.filter(x => x?.Code).map(x => [x.Code.slice(0, 4), x.S17]))
  } catch { return new Map() }
})()
// 同じ株に10営業日以内に続いて出た候補の何回目か（study_swing_repeat.mjs と同じ数え方）
const STREAK = new Map()
{
  const bc = {}
  for (const s of D.swing) (bc[s.code] ||= []).push(s)
  for (const l of Object.values(bc)) {
    l.sort((a, b) => a.i - b.i)
    let k = 0
    let pv = null
    for (const s of l) {
      k = pv && s.i - pv.i <= 10 ? k + 1 : 1
      STREAK.set(s.code + ':' + s.i, k)
      pv = s
    }
  }
}
const MAS = {}
for (const n of [75, 100, 200]) {
  const m = (MAS[n] = new Map())
  let sm = 0
  for (let i = 0; i < bench.length; i++) {
    sm += bench[i].c
    if (i >= n) sm -= bench[i - n].c
    if (i >= n - 1) m.set(bench[i].date, sm / n)
  }
}
const belowMA = (d, n = 200) => { const k = bi.get(d); return k !== undefined && MAS[n].has(d) && bench[k].c < MAS[n].get(d) }
const EVBY = {}
for (const e of D.events) if (e.kind !== 'split') (EVBY[e.code] ||= []).push(e.i)
const recentEv = s => (EVBY[s.code] || []).some(i => i <= s.i && i >= s.i - 20)
const streakOf = s => STREAK.get(s.code + ':' + s.i) || 1
// 避ける形を外す前の候補（本番の analyze は 11/20 から外しているので、比べるために外さない候補も作る）
const SW_OFF = process.env.PAIRED ? byDate(loadAll({ avoidChase: false }).swing) : SW
const evRank = e => (e.kind === 'split' ? 0 : e.kind === 'buyback' && e.score >= 2 ? 1 : e.kind === 'divup' ? 2 : e.kind === 'buyback' && e.score === 1 ? 3 : 9)
// 米国の下げ相場
const gs = JSON.parse(readFileSync(new URL('../world/GSPC.json', import.meta.url), 'utf-8')).chart.result[0]
const spx = gs.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: gs.indicators.quote[0].close[i] })).filter(x => x.c != null)
const usBearOn = d => {
  let a = -1
  for (let lo = 0, hi = spx.length - 1; lo <= hi;) {
    const m = (lo + hi) >> 1
    if (spx[m].date < d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a >= 20 && spx[a].c / spx[a - 20].c - 1 <= -0.05
}
// 避ける形（スイングの候補の合図の日 i で判定）
function avoid(st, i) {
  const B = st.bars
  if (i < 30) return false
  let up7 = true
  for (let k = 0; k < 7; k++) if (!(B[i - k].c > B[i - k - 1].c)) up7 = false
  let s = 0
  for (let k = i - 24; k <= i; k++) s += B[k].c
  const dev = B[i].c / (s / 25) - 1
  const r1 = B[i].c / B[i - 1].c - 1
  const rng = B[i].h - B[i].l
  const hiClose = r1 >= 0.15 && rng > 0 && (B[i].c - B[i].l) / rng >= 0.9
  return up7 || dev >= 0.25 || hiClose
}
// 急落の反発・つられ下げの合図（日付ごと）
const CR = new Map()
const TS = new Map()
for (const st of Object.values(stocks)) {
  const B = st.bars
  let last = -99
  for (let i = 30; i < B.length; i++) {
    if (st.turn[i] < 1e8) continue
    if (B[i].c / B[i - 5].c <= 0.85 && B[i].c >= 300) {
      if (i - last > 10) {
        if (!CR.has(B[i].date)) CR.set(B[i].date, [])
        const k5 = bi.get(B[i].date)
        CR.get(B[i].date).push({ code: st.code, i, big: B[i].c >= 1500, turn: st.turn[i], mkt: k5 >= 5 && bench[k5].c / bench[k5 - 5].c - 1 <= -0.04 })
      }
      last = i
    }
    const k = bi.get(B[i].date)
    if (k > 0 && B[i - 1].c >= 300 && B[i].o / B[i - 1].c <= 0.95 && bench[k].o / bench[k - 1].c <= 0.975) {
      if (!TS.has(B[i].date)) TS.set(B[i].date, [])
      TS.get(B[i].date).push({ code: st.code, i, turn: st.turn[i - 1] })
    }
  }
}
let SEED = 1
const rnd = str => {
  let h = 2166136261 ^ SEED
  for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619)
  return ((h >>> 0) % 100000) / 100000
}
function run(P) {
  let cash = P.capital
  let pos = []
  const trades = []
  const hist = []
  let equityPrev = P.capital
  let peakEq = P.capital
  for (const d of dates.filter(x => (!P.start || x >= P.start) && (!P.end || x < P.end))) {
    const pd = prevOf.get(d)
    // ddCut：口座が最高値から ddCut% 以上下がっている間は、スイングなどの1回の損の上限を ddMult 倍にする
    const inDD = (P.ddCut && equityPrev < peakEq * (1 - P.ddCut / 100)) || (P.ma200Cut && belowMA(pd, P.maDays ?? 200))
    const riskOne = equityPrev * P.riskPct / 100 * (inDD ? (P.ddMult ?? 0.5) : 1)
    const maxPos = equityPrev * P.maxPosPct / 100
    const barOf = code => {
      if (code === 'ETF') {
        const k = bi.get(d)
        return k === undefined ? null : { b: bench[k] }
      }
      const st = stocks[code]
      const k = st.idx.get(d)
      return k === undefined ? null : { b: st.bars[k], k, st }
    }
    const openRisk = () => pos.filter(p => p.track === 'swing' || p.track === 'surge').reduce((s, p) => s + Math.max(0, p.last - p.stop) * p.qty, 0)
    let buys = 0
    const held = new Set(pos.map(p => p.code))
    const close = (p, price, reason) => {
      cash += p.qty * price
      trades.push({ track: p.track, pnl: (price - p.entry) * p.qty, reason, exitDate: d })
    }
    const fixed = (track, code, pct, holdDays, sl) => {
      const x = barOf(code)
      if (!x || x.b.h === x.b.l) return false
      const o = x.b.o * (1 + SLIP)
      const unit = code === 'ETF' ? 1 : 100
      const qty = Math.floor(Math.min(equityPrev * pct / 100, cash) / o / unit) * unit
      if (qty < unit) return false
      cash -= qty * o
      held.add(code)
      pos.push({ track, code, entryDate: d, entry: o, qty, stop: sl ? o * (1 - sl / 100) : 0, target: Infinity, maxDays: holdDays, held: 0, last: o })
      return true
    }
    // 1. 企業の行動
    if (P.tracks.events) {
      const LB = P.evLook ?? 20
      const r20 = e => { const B = stocks[e.code].bars; return e.i >= LB ? B[e.i].c / B[e.i - LB].c : 1 }
      const evList = (EV.get(pd) || []).filter(x => P.evAll || evRank(x) < 9)
      if (P.evOrder === 'mom') evList.sort((a, b) => r20(b) - r20(a))
      else if (P.evOrder === 'rev') evList.sort((a, b) => r20(a) - r20(b))
      else if (P.evOrder === 'rankmom') evList.sort((a, b) => evRank(a) - evRank(b) || r20(b) - r20(a))
      else evList.sort((a, b) => evRank(a) - evRank(b))
      for (const e of evList) {
        if (buys >= P.dayMax || held.has(e.code)) continue
        const x = barOf(e.code)
        const lim = P.evLimit ? e.close * P.evLimit : e.limit
        if (!x || x.b.h === x.b.l || x.b.o > lim) continue
        if (P.evMinGap !== undefined && e.kind !== 'split' && x.b.o < e.close * (1 + P.evMinGap / 100)) continue
        const o = x.b.o
        const qty = Math.floor(Math.min(P.evPosPct ? equityPrev * P.evPosPct / 100 : maxPos, cash) / o / 100) * 100
        if (qty < 100) continue
        buys++
        held.add(e.code)
        cash -= qty * o
        if (e.kind === 'split') pos.push({ track: 'split', code: e.code, entryDate: d, entry: o, qty, stop: o * 0.92, target: Infinity, maxDays: 5, held: 0, last: o })
        else if (P.evStop && x.b.l <= o * (1 - P.evStop / 100)) close({ track: e.kind, code: e.code, entry: o, qty }, o * (1 - P.evStop / 100) * (1 - SLIP), '損切り')
        else close({ track: e.kind, code: e.code, entry: o, qty }, x.b.c, '大引け')
      }
    }
    // 2. 相場全体の急落の翌日の ETF
    if (P.tracks.etf && !held.has('ETF')) {
      const k = bi.get(pd)
      if (k > 0 && bench[k].c / bench[k - 1].c - 1 <= -0.03) fixed('etf', 'ETF', 20, 20, 15)
    }
    // 3. 急落の反発
    if (P.tracks.crash) {
      let n = 0
      for (const c of (CR.get(pd) || []).slice().sort((a, b) => (b.big - a.big) || (b.turn - a.turn))) {
        if (n >= 2 || held.has(c.code)) continue
        if ((P.crashBigOnly && !c.big) || (P.crashMktOnly && !c.mkt) || (P.crashIdioOnly && c.mkt)) continue
        if (P.crashOpenMax && pos.filter(p => p.track === 'crash').length >= P.crashOpenMax) break
        if (fixed('crash', c.code, P.crashPct ?? 10, 5, 20)) n++
      }
    }
    // 4. つられ下げ（今日の寄り）
    if (P.tracks.tsurare) {
      let n = 0
      for (const c of (TS.get(d) || []).slice().sort((a, b) => b.turn - a.turn)) {
        if (n >= 2 || held.has(c.code)) continue
        if (fixed('tsurare', c.code, 10, 5, 20)) n++
      }
    }
    // 5. 急騰の押し目・スイング
    const addRisky = (track, list, max, rMult, maxDays, gapMax) => {
      let n = 0
      for (const s of list) {
        if (buys >= P.dayMax || n >= max) break
        if (held.has(s.code)) continue
        if (P.secMax && track === 'swing' && pos.filter(p => p.track === 'swing' && SEC.get(p.code) === SEC.get(s.code)).length >= P.secMax) continue
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
        held.add(s.code)
        cash -= qty * entry
        pos.push({ track, code: s.code, entryDate: d, entry, qty, stop: s.stop, target: rMult ? entry + rMult * rps : Infinity, maxDays, held: 0, last: entry })
      }
    }
    if (P.tracks.surge) {
      const list = (SU.get(pd) || []).map(s => ({ ...s, close: stocks[s.code].bars[s.i].c, turnover: stocks[s.code].turn[s.i] })).sort((a, b) => b.turnover - a.turnover)
      addRisky('surge', list, 2, 3, 10, null)
    }
    if (P.tracks.swing) {
      let list = ((P.noAvoid ? SW_OFF : SW).get(pd) || []).slice()
      // 並べ方：score（今の決まり）・random（偶然の幅を測る）・turnover（売買代金）・calm（高値づかみ危険度の低い順）・dip（25日線に近い順）
      const st0 = s => stocks[s.code]
      const keyOf = {
        score: s => -(s.score ?? 0),
        random: s => rnd(s.code + d),
        turnover: s => -st0(s).turn[s.i],
        dip: s => {
          const B = st0(s).bars
          let m = 0
          for (let k = Math.max(0, s.i - 24); k <= s.i; k++) m += B[k].c
          return Math.abs(B[s.i].c / (m / Math.min(25, s.i + 1)) - 1)
        },
        lowvol: s => {
          const B = st0(s).bars
          let a = 0
          for (let k = Math.max(0, s.i - 13); k <= s.i; k++) a += (B[k].h - B[k].l) / B[k].c
          return a
        }
      }[P.order || 'score']
      list.sort((a, b) => keyOf(a) - keyOf(b))
      if (P.evFirst) list.sort((a, b) => recentEv(b) - recentEv(a))
      if (P.streakFirst) list.sort((a, b) => streakOf(b) - streakOf(a))
      if (P.streakMin) list = list.filter(s => streakOf(s) >= P.streakMin)
      if (P.avoid) list = list.filter(s => !avoid(stocks[s.code], s.i))
      if (P.maxPrice) list = list.filter(s => stocks[s.code].bars[s.i].c < P.maxPrice)
      if (P.lowFirst) list.sort((a, b) => (stocks[a.code].bars[a.i].c < P.lowFirst ? 0 : 1) - (stocks[b.code].bars[b.i].c < P.lowFirst ? 0 : 1))
      // 損切りを遠くする（2×ATR → 2×ATR×stopWiden。終値からの距離を広げる）
      if (P.stopWiden) list = list.map(s => ({ ...s, stop: s.close - (s.close - s.stop) * P.stopWiden }))
      const max = P.usBear && usBearOn(d) ? 1 : 99
      addRisky('swing', list, max, P.swingR ?? 3, P.swingDays ?? 40, 2)
    }
    // 6. 値動きで決着
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
      if (p.stop && !first && b.o <= p.stop) { close(p, b.o * (1 - SLIP), '損切り（寄り）'); done = true } else if (p.stop && b.l <= p.stop) { close(p, p.stop * (1 - SLIP), '損切り'); done = true } else if (!first && b.o >= p.target) { close(p, b.o, '目標（寄り）'); done = true } else if (b.h >= p.target) { close(p, p.target, '目標'); done = true } else if (p.held >= p.maxDays) { close(p, b.c * (1 - SLIP), '期間切れ'); done = true }
      if (!done) {
        p.last = b.c
        keep.push(p)
      }
    }
    pos = keep
    const equity = cash + pos.reduce((s, p) => s + p.qty * p.last, 0)
    hist.push({ date: d, equity })
    equityPrev = equity
    peakEq = Math.max(peakEq, equity)
  }
  return { hist, trades }
}
function stats(P) {
  const { hist, trades } = run(P)
  if (!hist.length) return null
  const last = hist[hist.length - 1].equity
  const years = (new Date(hist[hist.length - 1].date) - new Date(hist[0].date)) / 365.25 / 864e5
  const cagr = ((last / P.capital) ** (1 / years) - 1) * 100
  let peak = P.capital
  let mdd = 0
  for (const h of hist) {
    peak = Math.max(peak, h.equity)
    mdd = Math.min(mdd, (h.equity / peak - 1) * 100)
  }
  const months = new Map()
  for (const h of hist) months.set(h.date.slice(0, 7), h.equity)
  let pe = P.capital
  const mret = [...months.values()].map(e => {
    const r = (e / pe - 1) * 100
    pe = e
    return r
  })
  const byT = {}
  for (const t of trades) {
    const g = (byT[t.track] ||= { n: 0, pnl: 0 })
    g.n++
    g.pnl += t.pnl
  }
  return { cagr, mdd, neg: mret.filter(x => x < 0).length / mret.length * 100, byT, n: trades.length }
}
const BASE = { capital: 1e6, riskPct: 1, maxPosPct: 30, maxOpenRiskMult: 3, dayMax: 5, tracks: { events: true, surge: true, swing: true } }
const steps = [
  ['今の全部入り（企業の行動・急騰の押し目・スイング3R）', {}],
  ['＋避ける形をスイングから外す', { avoid: true }],
  ['＋スイングの目標を5R', { avoid: true, swingR: 5 }],
  ['＋米国の下げ相場はスイング1件まで', { avoid: true, swingR: 5, usBear: true }],
  ['＋急落の反発', { avoid: true, swingR: 5, usBear: true, tracks: { ...BASE.tracks, crash: true } }],
  ['＋つられ下げ', { avoid: true, swingR: 5, usBear: true, tracks: { ...BASE.tracks, crash: true, tsurare: true } }],
  ['＋相場全体の急落の翌日の ETF（統合版）', { avoid: true, swingR: 5, usBear: true, tracks: { ...BASE.tracks, crash: true, tsurare: true, etf: true } }]
]
const PER = [['10年', {}], ['前半', { end: '2021-11-19' }], ['後半', { start: '2021-11-19', end: '2025-11-14' }], ['最後の確認', { start: '2025-11-14' }]]
if (process.env.PKGY) {
  // 年ごとの騰落（でたらめな順番20回の真ん中）：今 と 案B
  const cfgs = [['今', { avoid: true }], ['案B', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60 }], ['案A', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true }], ['企業の行動50%だけ', { avoid: true, evPosPct: 50 }], ['50%＋20日の順', { avoid: true, evPosPct: 50, evOrder: 'mom' }], ['50%＋200日線', { avoid: true, evPosPct: 50, ma200Cut: true }]]
  const res = {}
  for (const [nm, cfg] of cfgs) {
    for (let k = 1; k <= 20; k++) {
      SEED = k
      const { hist } = run({ ...BASE, ...cfg, order: 'random' })
      const ye = {}
      for (const h of hist) ye[h.date.slice(0, 4)] = h.equity
      let prev = BASE.capital
      for (const y of Object.keys(ye).sort()) {
        ;((res[nm] ||= {})[y] ||= []).push((ye[y] / prev - 1) * 100)
        prev = ye[y]
      }
    }
  }
  const md = a => a.sort((x, y) => x - y)[10]
  for (const y of Object.keys(res['今']).sort()) console.log(`  ${y}  ` + cfgs.map(([nm]) => `${nm} ${fmt(md(res[nm][y]), 1)}%`).join('  '))
  process.exit(0)
}
if (process.env.PKG) {
  // 案ごとの年率・一番下げ・マイナスの月（でたらめな順番20回の真ん中）
  const PK = [
    ['今（本番に近い：企業の行動30%・3R・40日・1日5回）', { avoid: true }],
    ['今＋1日2回まで（本番の回数）', { avoid: true, dayMax: 2 }],
    ['案A：企業の行動50%・20日の順・200日線より下は半分', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true }],
    ['案B：案A＋5R・60日', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60 }],
    ['案C：案B の企業の行動を70%', { avoid: true, evPosPct: 70, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60 }],
    ['案B＋1日2回まで', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60, dayMax: 2 }]
  ]
  for (const [nm, cfg] of PK) {
    const out = PER.map(() => ({ c: [], d: [] }))
    for (let k = 1; k <= 20; k++) {
      SEED = k
      PER.forEach(([, po], j) => { const r = stats({ ...BASE, ...cfg, ...po, order: 'random' }); out[j].c.push(r.cagr); out[j].d.push(r.mdd) })
    }
    const md = a => a.sort((x, y) => x - y)[10]
    console.log(`■ ${nm}：` + PER.map(([pn], j) => `${pn} ${fmt(md(out[j].c), 1)}%／${fmt(md(out[j].d), 1)}%`).join(' ｜ '))
  }
  process.exit(0)
}
if (process.env.EVDD) {
  // 企業の行動の1銘柄の上限ごとに、でたらめな順番20回の「年率」と「一番下げたとき」と「月がマイナスの割合」の真ん中
  for (const [pct, stp] of (process.env.EVDD === 'stop' ? [[50, 0], [50, 5], [70, 0], [70, 5]] : [[30, 0], [50, 0], [70, 0], [100, 0]])) {
    const out = PER.map(() => ({ c: [], d: [], n: [] }))
    for (let k = 1; k <= 20; k++) {
      SEED = k
      PER.forEach(([, po], j) => {
        const r = stats({ ...BASE, avoid: true, evPosPct: pct, evStop: stp || undefined, ...po, order: 'random' })
        out[j].c.push(r.cagr); out[j].d.push(r.mdd); out[j].n.push(r.neg)
      })
    }
    const md = a => a.sort((x, y) => x - y)[10]
    console.log(`■ 1銘柄 ${pct}%${stp ? '・損切り−' + stp + '%' : ''}：` + PER.map(([pn], j) => `${pn} 年率 ${fmt(md(out[j].c), 1)}%・一番下げ ${fmt(md(out[j].d), 1)}%・マイナスの月 ${md(out[j].n).toFixed(0)}%`).join(' ｜ '))
  }
  process.exit(0)
}
if (process.env.PAIRED) {
  // 同じでたらめな順番（同じ SEED）で、変更あり・なしを比べる。差の分布で、偶然ではないかを見る
  const CRV = { tracks: { ...BASE.tracks, crash: true } }
  const variants = process.env.PAIRED === 'evfirst' ? [
    ['スイング：20日以内に自社株買い・増配の株を先に', { avoid: true, evFirst: true }, { avoid: true }]
  ] : process.env.PAIRED === 'evlook' ? [
    ['企業の行動50%・5日で上げていた順', { avoid: true, evPosPct: 50, evOrder: 'mom', evLook: 5 }, { avoid: true, evPosPct: 50 }],
    ['企業の行動50%・60日で上げていた順', { avoid: true, evPosPct: 50, evOrder: 'mom', evLook: 60 }, { avoid: true, evPosPct: 50 }],
    ['企業の行動50%・20日で下げていた順（逆）', { avoid: true, evPosPct: 50, evOrder: 'rev' }, { avoid: true, evPosPct: 50 }]
  ] : process.env.PAIRED === 'evorder' ? [
    ['企業の行動50%・20日で上げていた順', { avoid: true, evPosPct: 50, evOrder: 'mom' }, { avoid: true, evPosPct: 50 }],
    ['企業の行動50%・今の種類の順の中で20日の騰落順', { avoid: true, evPosPct: 50, evOrder: 'rankmom' }, { avoid: true, evPosPct: 50 }]
  ] : process.env.PAIRED === 'ma2' ? [
    ['75日線より下の間は半分に', { avoid: true, ma200Cut: true, maDays: 75 }, { avoid: true }],
    ['100日線より下の間は半分に', { avoid: true, ma200Cut: true, maDays: 100 }, { avoid: true }],
    ['全部重ねる（企業の行動50%・5R・60日・200日線より下は半分）', { avoid: true, evPosPct: 50, swingR: 5, swingDays: 60, ma200Cut: true }, { avoid: true }]
  ] : process.env.PAIRED === 'ma200' ? [
    ['TOPIX が200日線より下の間はスイングを半分に', { avoid: true, ma200Cut: true }, { avoid: true }],
    ['200日線より下の間は止める', { avoid: true, ma200Cut: true, ddMult: 0 }, { avoid: true }]
  ] : process.env.PAIRED === 'sector' ? [
    ['同じ業種のスイングは同時に2つまで', { avoid: true, secMax: 2 }, { avoid: true }],
    ['同じ業種のスイングは同時に1つまで', { avoid: true, secMax: 1 }, { avoid: true }]
  ] : process.env.PAIRED === 'ddcut' ? [
    ['最高値から−10%の間はスイングの損の上限を半分に', { avoid: true, ddCut: 10 }, { avoid: true }],
    ['最高値から−15%の間は半分に', { avoid: true, ddCut: 15 }, { avoid: true }],
    ['最高値から−10%の間はスイングを止める', { avoid: true, ddCut: 10, ddMult: 0 }, { avoid: true }]
  ] : process.env.PAIRED === 'evstop' ? [
    ['企業の行動70%・寄値−5%の損切り（70%だけと比べて）', { avoid: true, evPosPct: 70, evStop: 5 }, { avoid: true, evPosPct: 70 }],
    ['企業の行動50%・寄値−5%の損切り（50%だけと比べて）', { avoid: true, evPosPct: 50, evStop: 5 }, { avoid: true, evPosPct: 50 }]
  ] : process.env.PAIRED === 'daymax' ? [
    ['1日の買いを2回まで（今の比べ方は5回）', { avoid: true, dayMax: 2 }, { avoid: true }],
    ['1日の買いを3回まで', { avoid: true, dayMax: 3 }, { avoid: true }],
    ['1日2回まで・企業の行動50%', { avoid: true, dayMax: 2, evPosPct: 50 }, { avoid: true, dayMax: 2 }]
  ] : process.env.PAIRED === 'evsize' ? [
    ['企業の行動は1銘柄70%まで', { avoid: true, evPosPct: 70 }, { avoid: true }],
    ['企業の行動は1銘柄100%まで', { avoid: true, evPosPct: 100 }, { avoid: true }]
  ] : process.env.PAIRED === 'events2' ? [
    ['自社株買い・増配は、下げて始まったら買わない', { avoid: true, evMinGap: 0 }, { avoid: true }]
  ] : process.env.PAIRED === 'events' ? [
    ['寄指の上限を終値×1.03に', { avoid: true, evLimit: 1.03 }, { avoid: true }],
    ['寄指の上限を終値×1.05に', { avoid: true, evLimit: 1.05 }, { avoid: true }],
    ['企業の行動は1銘柄50%まで', { avoid: true, evPosPct: 50 }, { avoid: true }],
    ['良い条件の無い自社株買いも買う', { avoid: true, evAll: true }, { avoid: true }]
  ] : process.env.PAIRED === 'tracks' ? [
    ['急騰の押し目を外す', { avoid: true, tracks: { ...BASE.tracks, surge: false } }, { avoid: true }],
    ['企業の行動を外す', { avoid: true, tracks: { ...BASE.tracks, events: false } }, { avoid: true }],
    ['スイングだけにする', { avoid: true, tracks: { events: false, surge: false, swing: true } }, { avoid: true }]
  ] : process.env.PAIRED === 'best' ? [
    ['5R・60日 ＋ 1,500円未満だけ', { avoid: true, swingR: 5, swingDays: 60, maxPrice: 1500 }, { avoid: true }],
    ['5R・60日 ＋ 1,500円未満を先に（外さない）', { avoid: true, swingR: 5, swingDays: 60, lowFirst: 1500 }, { avoid: true }]
  ] : process.env.PAIRED === 'size' ? [
    ['1回0.5%・合計は同じ（×6）・1銘柄15%', { avoid: true, riskPct: 0.5, maxOpenRiskMult: 6, maxPosPct: 15 }, { avoid: true }],
    ['1回1%・合計を2倍（×6）', { avoid: true, maxOpenRiskMult: 6 }, { avoid: true }],
    ['1回1.5%・合計は同じ（×2）', { avoid: true, riskPct: 1.5, maxOpenRiskMult: 2 }, { avoid: true }]
  ] : process.env.PAIRED === 'exits2' ? [
    ['目標5R・60日', { avoid: true, swingR: 5, swingDays: 60 }, { avoid: true }],
    ['目標3R・60日', { avoid: true, swingDays: 60 }, { avoid: true }]
  ] : process.env.PAIRED === 'exits' ? [
    ['目標なし（40日・損切りだけ）', { avoid: true, swingR: 0 }, { avoid: true }],
    ['損切り 3×ATR・目標3R', { avoid: true, stopWiden: 1.5 }, { avoid: true }],
    ['損切り 3×ATR・目標5R', { avoid: true, stopWiden: 1.5, swingR: 5 }, { avoid: true }]
  ] : process.env.PAIRED === 'repeat' ? [
    ['続いた回数の多い候補を先に買う', { avoid: true, streakFirst: true }, { avoid: true }],
    ['3回目以上の候補だけ買う', { avoid: true, streakMin: 3 }, { avoid: true }],
    ['2回目以上の候補だけ買う', { avoid: true, streakMin: 2 }, { avoid: true }]
  ] : process.env.PAIRED === 'crash' ? [
    ['急落の反発（今：1日2件・10%）', { avoid: true, ...CRV }, { avoid: true }],
    ['急落の反発（同時に2つまで・5%）', { avoid: true, crashOpenMax: 2, crashPct: 5, ...CRV }, { avoid: true }],
    ['急落の反発（1,500円以上だけ・同時に2つ・5%）', { avoid: true, crashBigOnly: true, crashOpenMax: 2, crashPct: 5, ...CRV }, { avoid: true }],
    ['急落の反発（相場全体の急落のときだけ・同時に2つ・5%）', { avoid: true, crashMktOnly: true, crashOpenMax: 2, crashPct: 5, ...CRV }, { avoid: true }],
    ['急落の反発（その株だけの急落のときだけ・同時に2つ・5%）', { avoid: true, crashIdioOnly: true, crashOpenMax: 2, crashPct: 5, ...CRV }, { avoid: true }]
  ] : process.env.PAIRED === 'price' ? [['株価3,000円以上の候補を外す', { avoid: true, maxPrice: 3000 }, { avoid: true }], ['株価1,500円以上の候補を外す', { avoid: true, maxPrice: 1500 }, { avoid: true }]] : [['避ける形を外す', { avoid: true }, { noAvoid: true }], ['目標5R', { avoid: true, swingR: 5 }, { avoid: true }], ['米国の下げ相場はスイング1件まで', { avoid: true, usBear: true }, { avoid: true }], ['つられ下げ＋ETF', { avoid: true, tracks: { ...BASE.tracks, tsurare: true, etf: true } }, { avoid: true }]]
  for (const [nm, on, off] of variants) {
    const diffs = PER.map(() => [])
    const ddd = []
    for (let k = 1; k <= 20; k++) {
      SEED = k
      PER.forEach(([, po], j) => {
        const x = stats({ ...BASE, ...on, ...po, order: 'random' })
        const y = stats({ ...BASE, ...off, ...po, order: 'random' })
        diffs[j].push(x.cagr - y.cagr)
        ;(ddd[j] ||= []).push(x.mdd - y.mdd)
      })
    }
    console.log(`■ ${nm}（同じ順番で20組。年率の差）`)
    PER.forEach(([pn], j) => {
      const a = diffs[j].sort((x, y) => x - y)
      const dd = ddd[j].sort((x, y) => x - y)
      console.log(`  ${pn}：差の真ん中 ${fmt(a[10], 1)}pt・良くなった組 ${a.filter(x => x > 0).length}/20（${fmt(a[0], 1)}〜${fmt(a[19], 1)}）・一番下げの差の真ん中 ${fmt(dd[10], 1)}pt`)
    })
  }
  process.exit(0)
}
if (process.env.ORDER) {
  const base = { ...BASE, avoid: true }
  console.log('■ 偶然の幅：スイングの候補を毎日でたらめな順に並べて20回（避ける形は外した口座）')
  const per = PER.map(() => [])
  for (let k = 1; k <= 20; k++) {
    SEED = k
    PER.forEach(([, po], j) => per[j].push(stats({ ...base, ...po, order: 'random' }).cagr))
  }
  PER.forEach(([pn], j) => {
    const a = per[j].sort((x, y) => x - y)
    console.log(`  ${pn}：年率 ${fmt(a[0], 1)}〜${fmt(a[a.length - 1], 1)}%（真ん中 ${fmt(a[10], 1)}%）`)
  })
  for (const [nm, ord] of [['買いスコアの高い順（今）', 'score'], ['売買代金の大きい順', 'turnover'], ['25日線に近い順（伸びすぎていない）', 'dip'], ['値動きの小さい順', 'lowvol']]) {
    console.log(`■ ${nm}：` + PER.map(([pn, po]) => `${pn} ${fmt(stats({ ...base, ...po, order: ord }).cagr, 1)}%`).join('  '))
  }
  process.exit(0)
}
if (process.env.CRASH) {
  steps.length = 0
  steps.push(
    ['＋避ける形を外す（比べる相手）', { avoid: true }],
    ['＋急落の反発（同時に2つまで・10%）', { avoid: true, crashOpenMax: 2, tracks: { ...BASE.tracks, crash: true } }],
    ['＋急落の反発（同時に2つまで・5%）', { avoid: true, crashOpenMax: 2, crashPct: 5, tracks: { ...BASE.tracks, crash: true } }],
    ['＋急落の反発（同時に4つまで・5%）', { avoid: true, crashOpenMax: 4, crashPct: 5, tracks: { ...BASE.tracks, crash: true } }],
    ['＋つられ下げ＋ETF＋急落の反発（同時に2つ・5%）', { avoid: true, crashOpenMax: 2, crashPct: 5, tracks: { ...BASE.tracks, crash: true, tsurare: true, etf: true } }]
  )
}
if (process.env.MORE) {
  steps.length = 0
  steps.push(
    ['今の全部入り', {}],
    ['＋避ける形を外す', { avoid: true }],
    ['＋避ける形を外す＋急落の反発', { avoid: true, tracks: { ...BASE.tracks, crash: true } }],
    ['＋避ける形を外す＋つられ下げ', { avoid: true, tracks: { ...BASE.tracks, tsurare: true } }],
    ['＋避ける形を外す＋ETF', { avoid: true, tracks: { ...BASE.tracks, etf: true } }],
    ['＋避ける形を外す＋つられ下げ＋ETF', { avoid: true, tracks: { ...BASE.tracks, tsurare: true, etf: true } }],
    ['＋避ける形を外す・急騰の押し目をやめる', { avoid: true, tracks: { events: true, swing: true } }],
    ['＋避ける形を外す・急騰の押し目をやめる＋つられ下げ＋ETF', { avoid: true, tracks: { events: true, swing: true, tsurare: true, etf: true } }]
  )
}
console.log('100万円・1回の損1%。年率（%）／一番下げたとき（%）／マイナスの月の割合\n')
for (const [name, o] of steps) {
  const P = { ...BASE, ...o }
  const cells = PER.map(([pn, po]) => {
    const r = stats({ ...P, ...po })
    return `${pn} ${fmt(r.cagr, 1)}%／${fmt(r.mdd, 0)}%／${r.neg.toFixed(0)}%`
  })
  console.log(`■ ${name}`)
  console.log('  ' + cells.join('   '))
  const r10 = stats(P)
  console.log('  やり方ごと（10年）：' + Object.entries(r10.byT).map(([k, g]) => `${k} ${g.n}回 ${fmt(g.pnl / 1e4, 0)}万円`).join('・'))
}
