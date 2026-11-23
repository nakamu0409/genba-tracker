// 3つの検証（地合い・急騰の押し目の条件・全部入りの口座）で共通に使う、データの読み込みと合図と売買の決まり
// ・日足は research/wide.json（Yahoo の10年分・約1,400銘柄。今も上場している銘柄だけ＝生き残りの偏りがある）
// ・比べる相手と地合いは swing/bench1306.json（TOPIX 連動ETF）
import { readFileSync } from 'node:fs'
import { analyze, surgePullback, tickFloor } from '../../../.claude/scripts/kabu-lens.mjs'

export const SLIP = 0.001

export function loadAll({ withSwing = true, avoidChase = true, evMinTurn = 1e8 } = {}) {
  const wide = JSON.parse(readFileSync(new URL('../wide.json', import.meta.url), 'utf-8'))
  // ベンチマークに桁のおかしい日がある（2026-03-30・31 が約1/10）。前の正しい日から±30%を超える日は除く
  const benchRaw = JSON.parse(readFileSync(new URL('./bench1306.json', import.meta.url), 'utf-8'))
  const bench = []
  for (const b of benchRaw) {
    const p = bench[bench.length - 1]
    if (p && (b.c / p.c > 1.3 || b.c / p.c < 0.7)) continue
    bench.push(b)
  }
  const irev = JSON.parse(readFileSync(new URL('../irevents.json', import.meta.url), 'utf-8'))
  const irh = JSON.parse(readFileSync(new URL('../irhist.json', import.meta.url), 'utf-8'))
  const stocks = {}
  for (const [code, w] of Object.entries(wide)) {
    const bars = (w?.d || []).map(([date, o, h, l, c, v]) => ({ date, o, h, l, c, v })).filter(b => b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0)
    if (bars.length < 120) continue
    const turn = new Float64Array(bars.length)
    let s = 0
    for (let i = 0; i < bars.length; i++) {
      s += bars[i].c * bars[i].v
      if (i >= 20) s -= bars[i - 20].c * bars[i - 20].v
      turn[i] = s / Math.min(20, i + 1)
    }
    stocks[code] = { code, name: w.name, bars, turn, idx: new Map(bars.map((b, i) => [b.date, i])) }
  }
  const regime = benchRegime(bench)
  const out = { stocks, bench, regime }
  out.events = eventSignals(stocks, irev, irh, evMinTurn)
  out.surge = surgeSignals(stocks)
  if (withSwing) out.swing = swingSignals(stocks, bench, avoidChase)
  return out
}

/** 地合い（TOPIX ETF）。日付 → {above25, above75, slope25Up, ret5, ret20} */
export function benchRegime(bench) {
  const m = new Map()
  const c = bench.map(b => b.c)
  const ma = (i, n) => {
    if (i < n - 1) return null
    let s = 0
    for (let k = i - n + 1; k <= i; k++) s += c[k]
    return s / n
  }
  for (let i = 0; i < bench.length; i++) {
    const m25 = ma(i, 25)
    const m25p = ma(i - 5, 25)
    const m75 = ma(i, 75)
    m.set(bench[i].date, {
      above25: m25 !== null ? c[i] > m25 : null,
      above75: m75 !== null ? c[i] > m75 : null,
      slope25Up: m25 !== null && m25p !== null ? m25 > m25p : null,
      ret5: i >= 5 ? (c[i] / c[i - 5] - 1) * 100 : null,
      ret20: i >= 20 ? (c[i] / c[i - 20] - 1) * 100 : null
    })
  }
  return m
}

/** スイングの買い候補（analyze の signal_history の pass）。date＝合図の日（翌日の寄りで買う） */
function swingSignals(stocks, bench, avoidChase = true) {
  const out = []
  for (const st of Object.values(stocks)) {
    if (st.bars.length < 300) continue
    let p
    try {
      p = analyze(st.bars, bench, {}, { history: true, avoidChase })
    } catch {
      continue
    }
    for (const sg of p.signal_history) {
      if (!sg.pass || st.turn[sg.i] < 1e8) continue
      out.push({ code: st.code, i: sg.i, date: st.bars[sg.i].date, kind: sg.kind, stop: sg.stop, score: sg.score, close: sg.close })
    }
  }
  return out
}

/** 企業の行動（15:00以降・決算と別の日・売買代金1億円以上）。date＝発表の日（翌日の寄指で買う） */
function eventSignals(stocks, irev, irh, minTurn = 1e8) {
  const isB = t => /自己株式/.test(t) && /取得/.test(t) && /(決定|事項)/.test(t) && !/(取得状況|結果|終了|完了|経過|ToSTNeT|立会外)/.test(t)
  const isDiv = t => /増配/.test(t) && !/(減配|無配|下方)/.test(t)
  const isSplit = t => /株式分割/.test(t) && !/(結果|延期|中止)/.test(t)
  const out = []
  for (const [code, list] of Object.entries(irev)) {
    const st = stocks[code]
    if (!st || !Array.isArray(list)) continue
    const kd = new Set((irh[code] || []).map(r => r.date))
    const allB = list.filter(r => isB(r.title)).map(r => r.date).sort()
    const seen = new Set()
    for (const r of list) {
      if (r.time < '15:00') continue
      const kind = isB(r.title) ? 'buyback' : isDiv(r.title) ? 'divup' : isSplit(r.title) ? 'split' : null
      if (!kind) continue
      if (kd.has(r.date) || list.some(x => x.date === r.date && /決算/.test(x.title))) continue
      const i = st.idx.get(r.date)
      if (i === undefined || i < 60 || st.turn[i] < minTurn) continue
      const key = kind + i
      if (seen.has(key)) continue
      seen.add(key)
      const B = st.bars
      let m25 = 0
      for (let k = i - 24; k <= i; k++) m25 += B[k].c
      m25 /= 25
      const ev = { code, i, date: r.date, kind, time: r.time, close: B[i].c, limit: tickFloor(B[i].c * 1.02) }
      if (kind === 'buyback') {
        const repeat = allB.some(d => d < r.date && d >= String(Number(r.date.slice(0, 4)) - 1) + r.date.slice(4))
        ev.score = (!repeat ? 1 : 0) + (r.time < '15:30' ? 1 : 0) + (B[i].c < m25 ? 1 : 0)
      }
      out.push(ev)
    }
  }
  return out
}

/** 急騰した株の押し目（今の決まり：surgePullback）。date＝合図の日（翌日の寄りで買う） */
function surgeSignals(stocks) {
  const out = []
  for (const st of Object.values(stocks)) {
    const B = st.bars
    for (let L = 40; L < B.length - 1; L++) {
      // surgePullback は最後の足を見る。直近60本だけ渡せば十分
      const s = surgePullback(B.slice(Math.max(0, L - 60), L + 1))
      if (s) out.push({ code: st.code, i: L, date: B[L].date, stop: s.stop, dropPct: s.dropPct, surgeDate: s.surgeDate })
    }
  }
  return out
}

/**
 * 翌日の寄りで買って、損切り・目標（rMult、0 なら目標なし）・maxDays 日目の引けまで。日足で、同じ日に両方届けば損切りとみる。
 * 返り値 {e: 買った日の番号, x: 売った日の番号, entry, exit, r, pct, reason}。買えなければ null
 */
export function simulate(bars, i, stop, { rMult = 3, maxDays = 40, gapMax = null } = {}) {
  const e = i + 1
  if (e >= bars.length) return null
  const b = bars[e]
  if (b.h === b.l) return null
  if (gapMax !== null && b.o > bars[i].c * (1 + gapMax / 100)) return null
  const entry = b.o * (1 + SLIP)
  if (!(entry > stop)) return null
  const risk = entry - stop
  const target = rMult > 0 ? entry + rMult * risk : Infinity
  for (let k = e; k < bars.length && k < e + maxDays; k++) {
    const x = bars[k]
    let exit = null
    let reason = ''
    if (k > e && x.o <= stop) { exit = x.o * (1 - SLIP); reason = 'stop' } else if (x.l <= stop) { exit = stop * (1 - SLIP); reason = 'stop' } else if (k > e && x.o >= target) { exit = x.o; reason = 'target' } else if (x.h >= target) { exit = target; reason = 'target' } else if (k === e + maxDays - 1) { exit = x.c * (1 - SLIP); reason = 'time' }
    if (exit !== null) return { e, x: k, entry, exit, r: (exit - entry) / risk, pct: (exit / entry - 1) * 100, reason }
  }
  return null // まだ終わっていない（データの最後）
}

export const fmt = (v, p = 2) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(p) : '—')
export const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN)
export const median = a => {
  const z = [...a].sort((x, y) => x - y)
  return z.length ? z[Math.floor(z.length / 2)] : NaN
}
export const SPLIT_DATE = '2021-11-19' // 前半・後半の境（10年の真ん中）
