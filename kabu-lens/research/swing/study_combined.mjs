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
// SMALL=1：売買代金の小さい会社（3,000万〜1億円）の企業の行動も読む。使うかどうかは cfg.smallMin（この売買代金以上）・cfg.smallKinds（['divup'] など）
if (process.env.SMALL) {
  const D2 = loadAll({ withSwing: false, withSmall: true, evMinTurn: 3e7 })
  for (const [c, st] of Object.entries(D2.stocks)) if (!stocks[c]) stocks[c] = st
  for (const e of D2.events) if (D2.stocks[e.code].turn[e.i] < 1e8) D.events.push({ ...e, small: true })
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
// PBR（J-Quants の決算のまとめ。合図の日より前に開示された BPS）
const BPS = (() => {
  if (!process.env.PBR) return null
  const f = JSON.parse(readFileSync(new URL('../jq_fins.json', import.meta.url), 'utf-8'))
  const m = {}
  for (const l of Object.values(f)) for (const r of l) if (r.BPS !== '' && r.BPS !== null && Number.isFinite(+r.BPS)) (m[r.Code.slice(0, 4)] ||= []).push([r.DiscDate, +r.BPS])
  for (const l of Object.values(m)) l.sort((a, b) => a[0].localeCompare(b[0]))
  return m
})()
const pbrOf = s => {
  const l = BPS?.[s.code]
  if (!l) return null
  let b = null
  for (const [d, v] of l) { if (d >= s.date) break; b = v }
  return b > 0 ? stocks[s.code].bars[s.i].c / b : null
}
// VIX：日本の日 d には、d より前の日付（米国時間）の最後の終値を使う
const VIXOF = (() => {
  try {
    const r = JSON.parse(readFileSync(new URL('../world/VIX.json', import.meta.url), 'utf-8')).chart.result[0]
    const q = r.indicators.quote[0]
    const v = r.timestamp.map((t, i) => [new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), q.close[i]]).filter(x => x[1] > 0)
    const m = new Map()
    let j = -1
    for (const b of bench) {
      while (j + 1 < v.length && v[j + 1][0] < b.date) j++
      if (j >= 0) m.set(b.date, v[j][1])
    }
    return m
  } catch { return new Map() }
})()
const EVBY = {}
for (const e of D.events) if (e.kind !== 'split') (EVBY[e.code] ||= []).push(e.i)
const recentEv = s => (EVBY[s.code] || []).some(i => i <= s.i && i >= s.i - 20)
const streakOf = s => STREAK.get(s.code + ':' + s.i) || 1
// 避ける形を外す前の候補（本番の analyze は 11/20 から外しているので、比べるために外さない候補も作る）
const SW_OFF = process.env.PAIRED ? byDate(loadAll({ avoidChase: false }).swing) : SW
// 自社株買いの取得の割合（開示 PDF。research/bb_detail.json。無ければ割合なし）。bbSizeRule：割合2%以上を良い条件の1つに数え、2つ以上だけ買う（11/21 本人と決定）
let BBD = {}
try {
  BBD = JSON.parse(readFileSync(new URL('../bb_detail.json', import.meta.url), 'utf-8'))
} catch {
  BBD = {}
}
const bbScore = e => (e.score ?? 0) + ((BBD[`${e.code}|${e.date}|${e.time}`]?.pct ?? 0) >= 2 ? 1 : 0)
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
// 半導体（SOX）の20日の騰落（前の米国の日まで）。soxCut：これ以下（%）の日は新しいスイングを soxMax 件まで（2026-11-23 本人の希望で試す）
const sx = JSON.parse(readFileSync(new URL('../world/SOX.json', import.meta.url), 'utf-8')).chart.result[0]
const soxS = sx.timestamp.map((t, i) => ({ date: new Date((t - 5 * 3600) * 1000).toISOString().slice(0, 10), c: sx.indicators.quote[0].close[i] })).filter(x => x.c != null)
const sox20 = d => {
  let a = -1
  for (let lo = 0, hi = soxS.length - 1; lo <= hi;) {
    const m = (lo + hi) >> 1
    if (soxS[m].date < d) {
      a = m
      lo = m + 1
    } else hi = m - 1
  }
  return a >= 20 ? (soxS[a].c / soxS[a - 20].c - 1) * 100 : 0
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
// 厳しい条件の試算：slipMult（すべりを何倍にするか）・evMiss／swMiss（企業の行動・スイングの買いを何%の確率で買い損ねるか）
let SL = SLIP
const rnd = str => {
  let h = 2166136261 ^ SEED
  for (let k = 0; k < str.length; k++) h = Math.imul(h ^ str.charCodeAt(k), 16777619)
  return ((h >>> 0) % 100000) / 100000
}
// スイングの最長日数：swingDays（固定）／swingDaysByYear（年ごと。{"2018": 20, ...}）／swingDaysRegime（TOPIX の状態で切り替え {"by": "above75"|"slope25Up"|"ret20pos", "yes": 40, "no": 20}。前の営業日の状態）
function swingDaysFor(P, d) {
  if (P.swingDaysByYear && P.swingDaysByYear[d.slice(0, 4)] !== undefined) return P.swingDaysByYear[d.slice(0, 4)]
  if (P.swingDaysRegime) {
    const g = D.regime.get(prevOf.get(d))
    const R = P.swingDaysRegime
    const ok = !g ? true : R.by === 'ret20pos' ? (g.ret20 ?? 0) > 0 : !!g[R.by]
    return ok ? R.yes : R.no
  }
  return P.swingDays ?? 40
}
function run(P) {
  SL = SLIP * (P.slipMult ?? 1)
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
    const vixHi = P.vixBoost && (VIXOF.get(d) ?? 0) >= (P.vixAt ?? 30)
    const riskOne = equityPrev * P.riskPct / 100 * (inDD ? (P.ddMult ?? 0.5) : 1) * (vixHi ? P.vixBoost : 1)
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
      const o = x.b.o * (1 + SL)
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
      const evList = (EV.get(pd) || []).filter(x => (!x.small || (P.smallMin && stocks[x.code].turn[x.i] >= P.smallMin && (!P.smallKinds || P.smallKinds.includes(x.kind)))) && (P.evAll || evRank(x) < 9))
      if (P.evOrder === 'mom') evList.sort((a, b) => r20(b) - r20(a))
      else if (P.evOrder === 'rev') evList.sort((a, b) => r20(a) - r20(b))
      else if (P.evOrder === 'rankmom') evList.sort((a, b) => evRank(a) - evRank(b) || r20(b) - r20(a))
      // bbsmall：取得の割合2%以上で、ふだんの売買代金が3億円未満の自社株買いを先に（11/21 の検証で3つの期間とも +1.0〜1.5%）。あとは今の種類の順
      else if (P.evOrder === 'bbsmall') {
        const hot = e => e.kind === 'buyback' && (BBD[`${e.code}|${e.date}|${e.time}`]?.pct ?? 0) >= 2 && stocks[e.code].turn[e.i] < 3e8 ? 0 : 1
        evList.sort((a, b) => hot(a) - hot(b) || evRank(a) - evRank(b))
      }
      else evList.sort((a, b) => evRank(a) - evRank(b))
      for (const e of evList) {
        if (buys >= P.dayMax || held.has(e.code)) continue
        if (P.bbSizeRule && e.kind === 'buyback' && bbScore(e) < 2) continue
        if (P.evMiss && rnd(`m|${e.code}|${d}`) < P.evMiss / 100) continue
        const x = barOf(e.code)
        const lim = P.evLimit ? e.close * P.evLimit : e.limit
        if (!x || x.b.h === x.b.l || x.b.o > lim) continue
        if (P.evMinGap !== undefined && e.kind !== 'split' && x.b.o < e.close * (1 + P.evMinGap / 100)) continue
        const o = x.b.o
        // evTurnCap：1銘柄の金額を、前の日までの20日平均の売買代金の evTurnCap% までにする（寄りで値段を押し上げないため）
        const cap = P.evTurnCap ? stocks[e.code].turn[e.i] * P.evTurnCap / 100 : Infinity
        // swSellForEv：企業の行動を買う現金が足りない日は、スイングの株を寄りで売って現金を作る（'weak'＝含み益の小さい順／'old'＝長く持っている順）。swSellOnlyZero なら100株も買えないときだけ。swSellMaxGain なら含み益がその%未満のスイングだけ売る
        const evHot = e.kind === 'buyback' && (BBD[`${e.code}|${e.date}|${e.time}`]?.pct ?? 0) >= 2 && stocks[e.code].turn[e.i] < 3e8
        // swSellFor：'hot'＝小さめの会社の大きい自社株買いのときだけ／'buyback'＝自社株買いのときだけ。swSellMinHeld：その日数以上持ったスイングだけ売る
        if (P.swSellForEv && (!P.swSellFor || (P.swSellFor === 'hot' ? evHot : e.kind === P.swSellFor))) {
          const want = Math.min(P.evPosPct ? equityPrev * P.evPosPct / 100 : maxPos, cap)
          if (cash < want && (!P.swSellOnlyZero || Math.floor(Math.min(want, cash) / o / 100) < 1)) {
            const sw = pos.filter(q => q.track === 'swing' && q.entryDate !== d && barOf(q.code) && (P.swSellMaxGain === undefined || (q.last / q.entry - 1) * 100 < P.swSellMaxGain) && (!P.swSellMinHeld || q.held >= P.swSellMinHeld))
            sw.sort((a, b) => P.swSellForEv === 'old' ? b.held - a.held : (a.last / a.entry) - (b.last / b.entry))
            for (const q of sw) {
              if (cash >= want) break
              const xb = barOf(q.code).b
              close(q, xb.o * (1 - SL), '企業の行動のために売る')
              pos = pos.filter(z => z !== q)
            }
          }
        }
        const qty = Math.floor(Math.min(P.evPosPct ? equityPrev * P.evPosPct / 100 : maxPos, cash, cap) / o / 100) * 100
        if (qty < 100) continue
        buys++
        held.add(e.code)
        cash -= qty * o
        if (e.kind === 'split') pos.push({ track: 'split', code: e.code, entryDate: d, entry: o, qty, stop: o * 0.92, target: Infinity, maxDays: 5, held: 0, last: o })
        else if (P.evStop && x.b.l <= o * (1 - P.evStop / 100)) close({ track: e.kind, code: e.code, entry: o, qty }, o * (1 - P.evStop / 100) * (1 - SL), '損切り')
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
        if (P.swMiss && track === 'swing' && rnd(`w|${s.code}|${d}`) < P.swMiss / 100) continue
        const entry = x.b.o * (1 + SL)
        const rps = entry - s.stop
        if (!(rps > 0)) continue
        const room = riskOne * P.maxOpenRiskMult - openRisk()
        // swReserve：スイングなどは、現金が資金の swReserve% を下回るところまでは使わない（企業の行動のために残す）
        const usable = P.swReserve ? Math.max(0, cash - equityPrev * P.swReserve / 100) : cash
        const qty = Math.floor(Math.min(riskOne / rps, maxPos / entry, usable / entry, Math.max(0, room) / rps) / 100) * 100
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
      if (P.maxPBR) list = list.filter(s => { const v = pbrOf(s); return v !== null && v < P.maxPBR })
      if (P.pbrFirst) list.sort((a, b) => (pbrOf(a) ?? 99) - (pbrOf(b) ?? 99))
      if (P.evFirst) list.sort((a, b) => recentEv(b) - recentEv(a))
      if (P.streakFirst) list.sort((a, b) => streakOf(b) - streakOf(a))
      if (P.streakMin) list = list.filter(s => streakOf(s) >= P.streakMin)
      if (P.avoid) list = list.filter(s => !avoid(stocks[s.code], s.i))
      if (P.maxPrice) list = list.filter(s => stocks[s.code].bars[s.i].c < P.maxPrice)
      // swKinds：スイングの形をしぼる（['GAP','PULLBACK','BREAKOUT','MOMENTUM'] の一部）
      if (P.swKinds) list = list.filter(s => P.swKinds.includes(s.kind))
      if (P.lowFirst) list.sort((a, b) => (stocks[a.code].bars[a.i].c < P.lowFirst ? 0 : 1) - (stocks[b.code].bars[b.i].c < P.lowFirst ? 0 : 1))
      // 損切りを遠くする（2×ATR → 2×ATR×stopWiden。終値からの距離を広げる）
      if (P.stopWiden) list = list.map(s => ({ ...s, stop: s.close - (s.close - s.stop) * P.stopWiden }))
      const max = P.usBear && usBearOn(d) ? 1 : P.soxCut !== undefined && sox20(d) <= P.soxCut ? (P.soxMax ?? 0) : 99
      addRisky('swing', list, max, P.swingR ?? 3, swingDaysFor(P, d), 2)
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
      if (p.stop && !first && b.o <= p.stop) { close(p, b.o * (1 - SL), '損切り（寄り）'); done = true } else if (p.stop && b.l <= p.stop) { close(p, p.stop * (1 - SL), '損切り'); done = true } else if (!first && b.o >= p.target) { close(p, b.o, '目標（寄り）'); done = true } else if (b.h >= p.target) { close(p, p.target, '目標'); done = true } else if (p.held >= p.maxDays) { close(p, b.c * (1 - SL), '期間切れ'); done = true }
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
if (process.env.MONTHLY) {
  // 月ごとの増減（%）を、でたらめな順番20回ぶん出す（運の幅の試算用）：MONTHLY=<cfg の JSON ファイル>
  const cfg = JSON.parse(readFileSync(process.env.MONTHLY, 'utf-8'))
  const out = []
  for (let k = 1; k <= 20; k++) {
    SEED = k
    const { hist } = run({ ...BASE, ...cfg, tracks: cfg.tracks || BASE.tracks, order: 'random' })
    const me = new Map()
    for (const h of hist) me.set(h.date.slice(0, 7), h.equity)
    let pe = cfg.capital ?? BASE.capital
    out.push([...me.entries()].map(([m, e]) => { const r = (e / pe - 1) * 100; pe = e; return [m, Math.round(r * 1000) / 1000] }))
  }
  console.log(JSON.stringify(out))
  process.exit(0)
}
if (process.env.GRID) {
  // 組み合わせの探索（過去に合わせすぎないよう、前半だけで選び、後半・最後の確認で確かめる）：GRID=<{base, grid: {key: [値...]}, seeds, top, ddMin}> の JSON ファイル
  const G = JSON.parse(readFileSync(process.env.GRID, 'utf-8'))
  const keys = Object.keys(G.grid)
  let combos = [{}]
  for (const k of keys) combos = combos.flatMap(c => G.grid[k].map(v => ({ ...c, [k]: v })))
  const md = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const evalP = (cfg, po, seeds) => {
    const c = [], d = []
    for (let k = 1; k <= seeds; k++) {
      SEED = k
      const P = { ...BASE, ...G.base, ...cfg, tracks: { ...BASE.tracks, ...(G.base.tracks || {}), ...(cfg.tracks || {}) }, ...po, order: 'random' }
      const r = stats(P)
      c.push(r.cagr)
      d.push(r.mdd)
    }
    return { cagr: md(c), mdd: md(d) }
  }
  const sel = []
  let n = 0
  for (const cfg of combos) {
    const r = evalP(cfg, PER[1][1], G.seeds || 5)
    sel.push({ cfg, sel: r })
    if (++n % 50 === 0) console.error(`${n}/${combos.length}`)
  }
  const ok2 = sel.filter(x => x.sel.mdd >= (G.ddMin ?? -30)).sort((a, b) => b.sel.cagr - a.sel.cagr)
  const top = ok2.slice(0, G.top || 15)
  const out = []
  for (const t of [{ cfg: {}, sel: evalP({}, PER[1][1], G.seeds || 5), base: true }, ...top]) {
    const res = {}
    PER.forEach(([pn, po]) => { res[pn] = evalP(t.cfg, po, 20) })
    out.push({ cfg: t.cfg, base: !!t.base, select: t.sel, ...res })
  }
  console.log(JSON.stringify({ combos: combos.length, keys, out }, null, 1))
  process.exit(0)
}
if (process.env.WHATIF) {
  // もしもの試算（記録帳の whatif 用）：WHATIF=<[{id, name, cfg}] の JSON ファイル>。でたらめな順番20回の真ん中。10年の最後の資産・年率・一番下げ・期間ごとの年率・やり方ごとの回数
  const list = JSON.parse(readFileSync(process.env.WHATIF, 'utf-8'))
  const md = a => [...a].sort((x, y) => x - y)[10]
  const out = []
  for (const w of list) {
    const P0 = { ...BASE, ...w.cfg, tracks: { ...BASE.tracks, ...(w.cfg.tracks || {}) } }
    if (w.cfg.tracks) P0.tracks = w.cfg.tracks
    const per = PER.map(() => ({ c: [], d: [] }))
    const eq = []
    const mon = []
    const yr = {}
    const byT = {}
    let first = null
    let lastD = null
    for (let k = 1; k <= 20; k++) {
      SEED = k
      PER.forEach(([, po], j) => {
        const P = { ...P0, ...po, order: 'random' }
        if (j === 0) {
          const { hist, trades } = run(P)
          eq.push(hist[hist.length - 1].equity)
          // 月ごとの増減（%）
          const me = new Map()
          for (const h of hist) me.set(h.date.slice(0, 7), h.equity)
          let pe = P.capital
          const mr = [...me.values()].map(e => { const r = (e / pe - 1) * 100; pe = e; return r })
          const ms = [...mr].sort((x, y) => x - y)
          mon.push({ med: ms[Math.floor(ms.length / 2)], neg: mr.filter(x => x < 0).length / mr.length * 100, worst: ms[0], best: ms[ms.length - 1], p10: ms[Math.floor(ms.length * 0.1)], p90: ms[Math.floor(ms.length * 0.9)], first12: mr.slice(0, 12) })
          // 年ごとの増減（%）
          let py = P.capital
          const ye = new Map()
          for (const h of hist) ye.set(h.date.slice(0, 4), h.equity)
          for (const [y, e] of ye) { (yr[y] ||= []).push((e / py - 1) * 100); py = e }
          first = hist[0].date
          lastD = hist[hist.length - 1].date
          const cnt = {}
          for (const t of trades) {
            const g = (cnt[t.track] ||= { n: 0, w: 0 })
            g.n++
            if (t.pnl > 0) g.w++
          }
          for (const [tk, g] of Object.entries(cnt)) {
            const b = (byT[tk] ||= { n: [], win: [] })
            b.n.push(g.n)
            b.win.push(g.w)
          }
        }
        const r = stats(P)
        per[j].c.push(r.cagr)
        per[j].d.push(r.mdd)
      })
    }
    const tracks = Object.fromEntries(Object.entries(byT).map(([k, g]) => { const n = [...g.n].sort((x, y) => x - y)[Math.floor(g.n.length / 2)]; const w = [...g.win].sort((x, y) => x - y)[Math.floor(g.win.length / 2)]; return [k, { trades: n, win_rate_pct: n ? Math.round(w / n * 100) : 0 }] }))
    out.push({ id: w.id, name: w.name, cfg: w.cfg, summary: { start: first, end: lastD, capital: P0.capital, equity: Math.round(md(eq)), return_pct: Math.round((md(eq) / P0.capital - 1) * 1000) / 10, cagr_pct: Math.round(md(per[0].c) * 10) / 10, max_drawdown_pct: Math.round(md(per[0].d) * 10) / 10, monthly: Object.fromEntries(['med', 'neg', 'worst', 'best', 'p10', 'p90'].map(k => [k + '_pct', Math.round(md(mon.map(m => m[k])) * 10) / 10])), periods: Object.fromEntries(PER.map(([pn], j) => [pn, { cagr_pct: Math.round(md(per[j].c) * 10) / 10, max_drawdown_pct: Math.round(md(per[j].d) * 10) / 10 }])), yearly_pct: Object.fromEntries(Object.entries(yr).map(([y, a]) => [y, Math.round(md(a) * 10) / 10])), tracks } })
  }
  console.log(JSON.stringify(out, null, 1))
  process.exit(0)
}
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
    ['案B＋1日2回まで', { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60, dayMax: 2 }],
    // 前半だけで選んだ形：前半の比べ方で20組中12組以上良くなった変え方を全部（後で崩れたものも含める）。ぶつかるもの（目標なし↔5R・60日、70%↔50%）は前半の差が大きいほう
    ['前半だけで選んだ形（企業の行動70%・20日の順・200日線・5R・60日・寄指×1.03・続けて出た候補を先に）', { avoid: true, evPosPct: 70, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60, evLimit: 1.03, streakFirst: true }]
  ]
  for (const [nm, cfg0] of (process.env.PKG === 'wf' ? PK.filter(([n]) => n.startsWith('今（') || n.startsWith('案B：') || n.startsWith('前半だけ')) : PK)) {
    const cfg = process.env.PKG === '3m' ? { ...cfg0, capital: 3e6 } : cfg0
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
if (process.env.PBR) {
  const PP = [['2024-09〜2025-08', { start: '2024-09-02', end: '2025-08-28' }], ['2025-08〜', { start: '2025-08-28' }]]
  for (const [nm, on] of [['PBR 2倍以上の候補を外す', { avoid: true, maxPBR: 2 }], ['PBR の低い順に買う', { avoid: true, pbrFirst: true }]]) {
    const diffs = PP.map(() => [])
    for (let k = 1; k <= 20; k++) {
      SEED = k
      PP.forEach(([, po], j) => diffs[j].push(stats({ ...BASE, ...on, ...po, order: 'random' }).cagr - stats({ ...BASE, avoid: true, ...po, order: 'random' }).cagr))
    }
    console.log(`■ ${nm}：` + PP.map(([pn], j) => { const a = diffs[j].sort((x, y) => x - y); return `${pn} 差の真ん中 ${fmt(a[10], 1)}pt（${a.filter(x => x > 0).length}/20）` }).join(' ｜ '))
  }
  process.exit(0)
}
const PB = { avoid: true, evPosPct: 50, evOrder: 'mom', ma200Cut: true, swingR: 5, swingDays: 60 }
const PC = { ...PB, evPosPct: 70 }
if (process.env.PAIRED) {
  // 同じでたらめな順番（同じ SEED）で、変更あり・なしを比べる。差の分布で、偶然ではないかを見る
  const CRV = { tracks: { ...BASE.tracks, crash: true } }
  const variants = process.env.PAIRED === 'turncap' ? [
    ['500万円・案C＋現金70%：売買代金の0.6%まで', { ...PC, swReserve: 70, capital: 5e6, evTurnCap: 0.6 }, { ...PC, swReserve: 70, capital: 5e6 }],
    ['500万円・案C＋現金70%：売買代金の1.5%まで', { ...PC, swReserve: 70, capital: 5e6, evTurnCap: 1.5 }, { ...PC, swReserve: 70, capital: 5e6 }],
    ['100万円・案B：売買代金の0.6%まで', { ...PB, evTurnCap: 0.6 }, PB]
  ] : process.env.PAIRED === 'vix' ? [
    ['案B＋VIX30以上の日はスイングを1.5倍', { ...PB, vixBoost: 1.5 }, PB],
    ['案B＋VIX30以上の日はスイングを2倍', { ...PB, vixBoost: 2 }, PB],
    ['案B＋VIX25以上の日はスイングを1.5倍', { ...PB, vixBoost: 1.5, vixAt: 25 }, PB]
  ] : process.env.PAIRED === 'reserve' ? [
    ['案B＋現金を資金の30%残す', { ...PB, swReserve: 30 }, PB],
    ['案B＋現金を資金の50%残す', { ...PB, swReserve: 50 }, PB],
    ['案C（70%）＋現金を資金の70%残す', { ...PC, swReserve: 70 }, PC]
  ] : process.env.PAIRED === 'evfirst' ? [
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
