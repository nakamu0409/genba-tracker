#!/usr/bin/env node
// 株レンズ（スクリプト版）: TradingView なしで、日足データから「買いスコア」と
// 「高値づかみ危険度」を計算し、AIが読める JSON パケット（schema: kabu-lens/v1）を作る。
// 計算ルールは kabu-lens/kabu-lens.pine と同じ（/chart から呼ぶ）。
//
// 使い方:
//   node .claude/scripts/kabu-lens.mjs 7203            # 東証の銘柄コード
//   node .claude/scripts/kabu-lens.mjs 7203 6758 285A  # 複数まとめて
//   node .claude/scripts/kabu-lens.mjs 7203 --no-save  # ファイルに保存せず表示だけ
//   node .claude/scripts/kabu-lens.mjs --pts 7203 6758 # PTS（夜間・朝の時間外取引）の値段とランキング（株探）
//   node .claude/scripts/kabu-lens.mjs --now 7203 6758 # 取引時間中の今の株価と、上げ下げの大きい銘柄
//   node .claude/scripts/kabu-lens.mjs --chase          # 今日の値上がり率ランキング上位の「飛びつく危険度」
//   node .claude/scripts/kabu-lens.mjs --chase 3624 7522 # 指定した銘柄の危険度
//   node .claude/scripts/kabu-lens.mjs --dip            # 今日の値下がり率ランキング上位を「いま買う危険度」
//   node .claude/scripts/kabu-lens.mjs --movers         # 値上がり・値下がりの両方（材料ニュースつき）
//   node .claude/scripts/kabu-lens.mjs --movers --open  # 同じ。朝（寄り付き後）用で、過去の結果を朝の検証の数字にする
//   node .claude/scripts/kabu-lens.mjs --movers-result <記録.json> [--stats <累計.json>]  # 昼に出した危険度の答え合わせ（後場の結果）
//
// 株価は Yahoo Finance の日足（株式分割は調整済み、配当は未調整）。取引時間中の未確定の足は使わない。
// 結果は kabu-lens/packets/latest/TSE_<コード>_D.json に保存する（コミットされない）。
// 決算日はこのデータに含まれないので earnings は null。/catalysts の日付を使うこと。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const DEFAULTS = {
  scoreThreshold: 70,
  pullbackMin: 55,
  blockHighVol: true,
  htfMaLen: 26,
  overheatBlock: 60,
  devWarn: 10,
  devHeavy: 20,
  runUpWarn: 50,
  runUpHeavy: 100,
  maType: 'SMA',
  maFastLen: 25,
  maMidLen: 75,
  maSlowLen: 200,
  slopeLen: 10,
  rsiLen: 14,
  rsiOB: 75,
  adxLen: 14,
  adxTrend: 20,
  volLen: 20,
  atrLen: 14,
  atrPctLen: 250,
  highVolPct: 90,
  swingLen: 5,
  rsLen: 60,
  stopAtr: 2.0,
  t1R: 2.0,
  t2R: 4.0,
  beAfterT1: true,
  exitOnTrend: true,
  recentCount: 5,
  // 買い候補の判定と、買っていた場合の追跡に使う設定
  // 「買いの形は出ていないが、スコアが基準以上」の日も候補にするか。
  // 過去約3年・60銘柄の検証で平均 −0.11R（179回）と成績が悪かったので、既定では候補にしない
  candAllowState: false,
  candMaxDevPct: 8, // 25日線からの乖離がこれ以下
  trackGapPct: 2, // 翌日の始値が終値よりこれ以上高ければ買わない
  // 目標と保有期限。約160銘柄・10年の検証で、「2倍・20営業日」より「3倍・40営業日」のほうが
  // 前半（2017〜2021年）も後半（2022〜2026年）も1回あたりの成績が良かった（kabu-lens/research/README.md）
  trackRR: 3, // 目標 = 買値 + 損切り幅 × これ（0 なら目標なし）
  trackMaxBars: 40, // これだけ持って決着しなければ終値で手じまい
  // 好材料の窓開け（GAP）: 前日終値より gapMinPct% 以上高く始まり、陽線で高値圏で引け、出来高が直前20日平均の gapVolRatio 倍以上。
  // 約170銘柄・10年の検証で、窓の大きさ（2〜5%）や出来高（1.5〜4倍）を変えても、前半・後半とも
  // 「いつでも買う」より1回あたり約1%良かった。目標は置かず、gapHoldBars 営業日持つ
  gapMinPct: 2,
  gapVolRatio: 2,
  gapClosePos: 0.6,
  gapHoldBars: 40
}

/** 買いの形ごとの売り方（追跡と検証で使う） */
export function exitFor(kind, options = {}) {
  const o = { ...DEFAULTS, ...options }
  return kind === 'GAP' ? { ...options, trackRR: 0, trackMaxBars: o.gapHoldBars } : options
}

// ─── 指標の計算（値が出せない位置は null。Pine の na と同じ扱い） ───────────────

const ok = x => x !== null && x !== undefined && Number.isFinite(x)

/** 単純移動平均 */
export function sma(src, len) {
  const out = new Array(src.length).fill(null)
  let sum = 0
  let run = 0
  for (let i = 0; i < src.length; i++) {
    if (!ok(src[i])) {
      sum = 0
      run = 0
      continue
    }
    sum += src[i]
    run++
    if (run > len) sum -= src[i - len]
    if (run >= len) out[i] = sum / len
  }
  return out
}

// 最初の len 本の単純平均から始める指数平滑（Pine の ta.ema / ta.rma と同じ）
function smooth(src, len, alpha) {
  const out = new Array(src.length).fill(null)
  let start = src.findIndex(ok)
  if (start < 0) return out
  let sum = 0
  let prev = null
  for (let i = start; i < src.length; i++) {
    if (!ok(src[i])) return out
    if (prev === null) {
      sum += src[i]
      if (i - start + 1 === len) {
        prev = sum / len
        out[i] = prev
      }
    } else {
      prev = alpha * src[i] + (1 - alpha) * prev
      out[i] = prev
    }
  }
  return out
}

/** 指数移動平均 */
export const ema = (src, len) => smooth(src, len, 2 / (len + 1))
/** ワイルダーの平滑（RSI・ATR・ADX 用） */
export const rma = (src, len) => smooth(src, len, 1 / len)

/** RSI */
export function rsi(close, len) {
  const up = close.map((c, i) => (i === 0 ? null : Math.max(c - close[i - 1], 0)))
  const dn = close.map((c, i) => (i === 0 ? null : Math.max(close[i - 1] - c, 0)))
  const u = rma(up, len)
  const d = rma(dn, len)
  return u.map((x, i) => (!ok(x) ? null : d[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / d[i])))
}

/** ATR */
export function atr(bars, len) {
  const tr = bars.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c))))
  return rma(tr, len)
}

/** DMI / ADX */
export function dmi(bars, len) {
  const plusDM = [null]
  const minusDM = [null]
  const tr = [null]
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h
    const down = bars[i - 1].l - bars[i].l
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)))
  }
  const trS = rma(tr, len)
  const pS = rma(plusDM, len)
  const mS = rma(minusDM, len)
  const plus = trS.map((t, i) => (ok(t) && t > 0 ? (100 * pS[i]) / t : null))
  const minus = trS.map((t, i) => (ok(t) && t > 0 ? (100 * mS[i]) / t : null))
  const dx = plus.map((p, i) => (ok(p) && ok(minus[i]) ? (100 * Math.abs(p - minus[i])) / (p + minus[i] === 0 ? 1 : p + minus[i]) : null))
  return { plus, minus, adx: rma(dx, len) }
}

/** 直前 len 本のうち、今の値以下だった割合（%）。Pine の ta.percentrank と同じ */
export function percentRank(src, len) {
  return src.map((x, i) => {
    if (!ok(x) || i < len || !ok(src[i - len])) return null
    let n = 0
    for (let k = 1; k <= len; k++) if (src[i - k] <= x) n++
    return (n / len) * 100
  })
}

/**
 * シグナルの翌営業日の始値で買っていたらどうなったかを、日足でたどる。
 * 損切りを先に判定する（同じ日に損切りと目標の両方に届いたら損切り扱い）。
 * @param {{date:string,o:number,h:number,l:number,c:number}[]} bars 日足（古い順）
 * @param {number} i シグナルが出た足の位置
 * @param {number} stop 損切りの値段
 * @param {object} [options] trackGapPct / trackRR / trackMaxBars
 */
export function evaluateSignal(bars, i, stop, options = {}) {
  const o = { ...DEFAULTS, ...options }
  const sig = bars[i]
  const base = { signalDate: sig.date, signalClose: sig.c, stop }
  const e = i + 1
  if (e >= bars.length) return { ...base, status: 'PENDING', exitIdx: null }
  const entry = bars[e].o
  if (entry > sig.c * (1 + o.trackGapPct / 100)) return { ...base, status: 'SKIPPED_GAP', entryDate: bars[e].date, entry, exitIdx: e }
  if (!(entry > stop)) return { ...base, status: 'SKIPPED_BELOW_STOP', entryDate: bars[e].date, entry, exitIdx: e }
  const risk = entry - stop
  const target = o.trackRR > 0 ? entry + o.trackRR * risk : Infinity
  const targetOut = Number.isFinite(target) ? round(target, 1) : null
  let mfe = 0
  let mae = 0
  const done = (status, k, exit) => ({
    ...base, status, entryDate: bars[e].date, entry, target: targetOut, exitDate: bars[k].date, exit: round(exit, 1),
    r: round((exit - entry) / risk), bars: k - e + 1, maxUpR: round(mfe), maxDownR: round(mae), exitIdx: k
  })
  for (let k = e; k < bars.length; k++) {
    const b = bars[k]
    mfe = Math.max(mfe, (b.h - entry) / risk)
    mae = Math.min(mae, (b.l - entry) / risk)
    if (b.l <= stop) return done('STOPPED', k, Math.min(stop, b.o))
    if (b.h >= target) return done('TARGET', k, Math.max(target, b.o))
    if (k - e + 1 >= o.trackMaxBars) return done('TIME_EXIT', k, b.c)
  }
  const lastBar = bars[bars.length - 1]
  return {
    ...base, status: 'OPEN', entryDate: bars[e].date, entry, target: targetOut, lastDate: lastBar.date, last: lastBar.c,
    r: round((lastBar.c - entry) / risk), bars: bars.length - e, maxUpR: round(mfe), maxDownR: round(mae), exitIdx: null
  }
}

/** 追跡結果の集計（勝率・平均R など）。決着したものだけを数える */
export function summarize(results) {
  const closed = results.filter(r => ['STOPPED', 'TARGET', 'TIME_EXIT'].includes(r.status))
  const wins = closed.filter(r => r.r > 0)
  const sum = closed.reduce((a, r) => a + r.r, 0)
  return {
    signals: results.length,
    skipped: results.filter(r => r.status.startsWith('SKIPPED')).length,
    open: results.filter(r => r.status === 'OPEN' || r.status === 'PENDING').length,
    closed: closed.length,
    wins: wins.length,
    win_rate_pct: closed.length ? round((wins.length / closed.length) * 100, 1) : null,
    avg_r: closed.length ? round(sum / closed.length) : null,
    total_r: round(sum),
    target: closed.filter(r => r.status === 'TARGET').length,
    stopped: closed.filter(r => r.status === 'STOPPED').length,
    time_exit: closed.filter(r => r.status === 'TIME_EXIT').length,
    avg_bars: closed.length ? round(closed.reduce((a, r) => a + r.bars, 0) / closed.length, 1) : null
  }
}

/**
 * 過去の足で「買い候補」が出た日をすべて拾い、買っていた場合の結果を出す。
 * 通過した候補（passed）と、ルールで見送った候補（blocked）を分けて集計する。
 * 同じ銘柄で追跡中の間に出た候補は数えない。
 */
export function backtest(bars, bench = [], options = {}) {
  const p = analyze(bars, bench, {}, { ...options, history: true })
  const out = { passed: [], blocked: [] }
  for (const key of ['passed', 'blocked']) {
    let free = -1
    for (const sg of p.signal_history.filter(x => (key === 'passed' ? x.pass : !x.pass && x.kind !== 'STATE'))) {
      if (sg.i <= free) continue
      const r = evaluateSignal(bars, sg.i, sg.stop, exitFor(sg.kind, options))
      out[key].push({ kind: sg.kind, reason: sg.reason, score: sg.score, overheat: sg.overheat, regime: sg.regime, ...r })
      free = r.exitIdx === null ? bars.length : r.exitIdx
    }
  }
  return out
}

// 月曜の日付をその週のキーにする
function weekKey(date) {
  const d = new Date(date + 'T00:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function pattern(b, p, a) {
  const rng = b.h - b.l
  const body = Math.abs(b.c - b.o)
  const up = b.h - Math.max(b.o, b.c)
  const dn = Math.min(b.o, b.c) - b.l
  if (rng <= 0) return 'FLAT'
  if (p) {
    if (b.c > b.o && p.c < p.o && b.c >= p.o && b.o <= p.c) return 'BULLISH_ENGULFING'
    if (b.c < b.o && p.c > p.o && b.o >= p.c && b.c <= p.o) return 'BEARISH_ENGULFING'
  }
  if (body / rng <= 0.1) return 'DOJI'
  if (dn >= 2 * body && up <= 0.15 * rng) return 'HAMMER'
  if (up >= 2 * body && dn <= 0.15 * rng) return 'SHOOTING_STAR'
  if (body / rng >= 0.9) return b.c > b.o ? 'BULLISH_MARUBOZU' : 'BEARISH_MARUBOZU'
  if (p && b.h < p.h && b.l > p.l) return 'INSIDE_BAR'
  if (p && b.h > p.h && b.l < p.l) return 'OUTSIDE_BAR'
  if (ok(a) && a > 0 && rng >= 1.8 * a) return b.c > b.o ? 'WIDE_RANGE_BULL' : 'WIDE_RANGE_BEAR'
  return 'NONE'
}

const round = (x, d = 2) => (ok(x) ? Math.round(x * 10 ** d) / 10 ** d : null)

/**
 * 日足からパケットを作る。
 * @param {{date:string,o:number,h:number,l:number,c:number,v:number}[]} bars 確定した日足（古い順）
 * @param {{date:string,c:number}[]} bench 比較する指数の日足（古い順。無ければ []）
 * @param {object} [info] { symbol, name, currency, benchmark }
 * @param {object} [options] DEFAULTS を上書きする設定
 */
export function analyze(bars, bench = [], info = {}, options = {}) {
  const o = { ...DEFAULTS, ...options }
  const n = bars.length
  if (n < 30) throw new Error(`日足が ${n} 本しかありません（30本以上必要）`)
  const close = bars.map(b => b.c)
  const vol = bars.map(b => b.v)
  const ma = o.maType === 'EMA' ? ema : sma

  const maF = ma(close, o.maFastLen)
  const maM = ma(close, o.maMidLen)
  const maS = ma(close, o.maSlowLen)
  const rsiV = rsi(close, o.rsiLen)
  const e12 = ema(close, 12)
  const e26 = ema(close, 26)
  const macd = e12.map((x, i) => (ok(x) && ok(e26[i]) ? x - e26[i] : null))
  const sig = ema(macd, 9)
  const hist = macd.map((x, i) => (ok(x) && ok(sig[i]) ? x - sig[i] : null))
  const { plus, minus, adx } = dmi(bars, o.adxLen)
  const atrV = atr(bars, o.atrLen)
  const atrPct = percentRank(atrV, o.atrPctLen)
  const volAvg = sma(vol, o.volLen)
  const turnover = bars.map(b => b.c * b.v)
  const turnAvg = sma(turnover, o.volLen)

  // 週足（確定した週だけ使う）
  const weeks = []
  const weekOf = []
  for (const b of bars) {
    const k = weekKey(b.date)
    if (!weeks.length || weeks[weeks.length - 1].key !== k) weeks.push({ key: k, h: b.h, l: b.l, c: b.c })
    const w = weeks[weeks.length - 1]
    w.h = Math.max(w.h, b.h)
    w.l = Math.min(w.l, b.l)
    w.c = b.c
    weekOf.push(weeks.length - 1)
  }
  const wClose = weeks.map(w => w.c)
  const wMa = sma(wClose, o.htfMaLen)
  const wRsi = rsi(wClose, 14)

  // 指数の騰落率（日付で突き合わせる）
  const benchIdx = new Map(bench.map((b, i) => [b.date, i]))
  const benchRetAt = (date) => {
    const j = benchIdx.get(date)
    if (j === undefined || j < o.rsLen || !(bench[j - o.rsLen].c > 0)) return null
    return (bench[j].c / bench[j - o.rsLen].c - 1) * 100
  }

  // 1本ずつ進めて、シグナルと保有を追跡する
  let swingH1 = null, swingH2 = null, swingL1 = null, swingL2 = null
  let upStreak = 0
  let prevScore = null
  const t = { side: 'NONE', open: false, kind: 'NONE', status: 'NONE', entry: null, stop: null, stop0: null, t1: null, t2: null, bar: null }
  let lastSigBar = null
  let lastSigKind = 'NONE'
  const patterns = []
  const signalHistory = []
  let last = null

  for (let i = 0; i < n; i++) {
    const b = bars[i]
    const p = i > 0 ? bars[i - 1] : null

    // 確定したスイング（左右 swingLen 本）
    const c0 = i - o.swingLen
    if (c0 - o.swingLen >= 0) {
      let isH = true
      let isL = true
      for (let k = c0 - o.swingLen; k <= i; k++) {
        if (k === c0) continue
        if (bars[k].h >= bars[c0].h) isH = false
        if (bars[k].l <= bars[c0].l) isL = false
      }
      if (isH) {
        swingH2 = swingH1
        swingH1 = bars[c0].h
      }
      if (isL) {
        swingL2 = swingL1
        swingL1 = bars[c0].l
      }
    }

    upStreak = p && b.c > p.c ? upStreak + 1 : 0
    const bull = b.c > b.o
    const bear = b.c < b.o
    const rng = b.h - b.l
    const relVol = ok(volAvg[i]) && volAvg[i] > 0 ? b.v / volAvg[i] : null
    const devF = ok(maF[i]) && maF[i] > 0 ? ((b.c - maF[i]) / maF[i]) * 100 : null
    const devM = ok(maM[i]) && maM[i] > 0 ? ((b.c - maM[i]) / maM[i]) * 100 : null

    // 52週高値・安値（前日までの250本 + 今日）
    let dHi = null
    let dLo = null
    if (i >= 250) {
      dHi = -Infinity
      dLo = Infinity
      for (let k = i - 250; k < i; k++) {
        dHi = Math.max(dHi, bars[k].h)
        dLo = Math.min(dLo, bars[k].l)
      }
    }
    const hi52 = dHi === null ? b.h : Math.max(dHi, b.h)
    const lo52 = dLo === null ? b.l : Math.min(dLo, b.l)
    const fromHi52 = hi52 > 0 ? (b.c / hi52 - 1) * 100 : null
    const fromLo52 = lo52 > 0 ? (b.c / lo52 - 1) * 100 : null
    const newHigh52 = dHi !== null && b.c > dHi

    // 週足（前の週まで）
    const w = weekOf[i] - 1
    const htfValid = w >= 0 && ok(wMa[w])
    const htfBias = !htfValid ? 0 : wClose[w] > wMa[w] ? 1 : wClose[w] < wMa[w] ? -1 : 0
    const htfBiasStr = !htfValid ? 'N/A' : htfBias === 1 ? 'UP' : htfBias === -1 ? 'DOWN' : 'FLAT'
    const htfRsi = w >= 0 ? wRsi[w] : null

    // 相対強度
    const stockRet = i >= o.rsLen && bars[i - o.rsLen].c > 0 ? (b.c / bars[i - o.rsLen].c - 1) * 100 : null
    const benchRet = benchRetAt(b.date)
    const rsDiff = ok(stockRet) && ok(benchRet) ? stockRet - benchRet : null

    // 地合い
    const sPrev = i >= o.slopeLen ? maS[i - o.slopeLen] : null
    const slopeUp = ok(maS[i]) && ok(sPrev) && maS[i] > sPrev
    const slopeDn = ok(maS[i]) && ok(sPrev) && maS[i] < sPrev
    const trendUp = ok(maS[i]) && b.c > maS[i] && slopeUp && ok(adx[i]) && adx[i] >= o.adxTrend
    const trendDown = ok(maS[i]) && b.c < maS[i] && slopeDn && ok(adx[i]) && adx[i] >= o.adxTrend
    const highVol = ok(atrPct[i]) && atrPct[i] >= o.highVolPct
    const regime = highVol ? 'HIGH_VOLATILITY' : trendUp ? 'TREND_UP' : trendDown ? 'TREND_DOWN' : 'RANGE'

    // 買いスコア
    const gt = (a, c) => ok(a) && ok(c) && a > c
    const fTrend = (gt(maF[i], maM[i]) ? 7 : 0) + (gt(maM[i], maS[i]) ? 7 : 0) + (gt(b.c, maF[i]) ? 6 : 0)
    const histUp = i > 0 && gt(hist[i], hist[i - 1])
    const fMom = (gt(rsiV[i], 50) ? (rsiV[i] >= o.rsiOB ? 4 : 10) : 0) + (gt(hist[i], 0) ? 5 : 0) + (histUp ? 5 : 0)
    const fVol = bull && ok(relVol) && relVol >= 1.5 ? 20 : bull && ok(relVol) && relVol >= 1.0 ? 12 : bull ? 6 : 0
    const fHtf = htfBias === 1 ? 20 : htfBias === 0 ? 10 : 0
    const fRs = !ok(rsDiff) ? 10 : rsDiff >= 10 ? 20 : rsDiff >= 0 ? 12 : rsDiff >= -5 ? 6 : 0
    const longScore = fTrend + fMom + fVol + fHtf + fRs

    // 高値づかみ危険度
    const upPct = rng > 0 ? ((b.h - Math.max(b.o, b.c)) / rng) * 100 : 0
    const hDev = !ok(devF) ? 0 : devF >= o.devHeavy ? 30 : devF >= o.devWarn ? 18 : devF >= o.devWarn / 2 ? 8 : 0
    const hRsi = !ok(rsiV[i]) ? 0 : rsiV[i] >= 80 ? 20 : rsiV[i] >= 70 ? 12 : 0
    const hWkRsi = !ok(htfRsi) ? 0 : htfRsi >= 75 ? 15 : htfRsi >= 65 ? 8 : 0
    const hRun = !ok(fromLo52) ? 0 : fromLo52 >= o.runUpHeavy ? 15 : fromLo52 >= o.runUpWarn ? 8 : 0
    const hStreak = upStreak >= 6 ? 10 : upStreak >= 4 ? 5 : 0
    const hBlow = ok(relVol) && relVol >= 2.5 && upPct >= 40 ? 10 : 0
    const overheat = hDev + hRsi + hWkRsi + hRun + hStreak + hBlow
    const heatLevel = overheat >= o.overheatBlock ? 'HIGH' : overheat >= o.overheatBlock - 25 ? 'ELEVATED' : 'NORMAL'

    // 構造
    const structBias = gt(swingH1, swingH2) && gt(swingL1, swingL2) ? 'BULLISH' : gt(swingH2, swingH1) && gt(swingL2, swingL1) ? 'BEARISH' : 'MIXED'
    const breakUp = ok(swingH1) && p !== null && b.c > swingH1 && p.c <= swingH1
    const breakDown = ok(swingL1) && p !== null && b.c < swingL1 && p.c >= swingL1

    // 買い候補
    const pullbackNow = gt(maM[i], maS[i]) && slopeUp && gt(b.c, maM[i]) && ok(atrV[i]) && b.l <= maF[i] + 0.5 * atrV[i] && b.c > maF[i] && ok(rsiV[i]) && rsiV[i] >= 40 && rsiV[i] <= 60 && bull
    const scoreCross = longScore >= o.scoreThreshold && prevScore !== null && prevScore < o.scoreThreshold
    const candKind = pullbackNow && longScore >= o.pullbackMin ? 'PULLBACK' : scoreCross ? (breakUp || newHigh52 ? 'BREAKOUT' : 'MOMENTUM') : 'NONE'
    const blockReason = regime === 'TREND_DOWN' ? 'TREND_DOWN' : overheat >= o.overheatBlock ? 'OVERHEAT' : o.blockHighVol && regime === 'HIGH_VOLATILITY' ? 'HIGH_VOLATILITY' : 'NONE'

    // 保有の更新（損切りを先に判定）
    const statusBefore = t.status
    let opened = false
    let blockedNow = false
    if (t.open && i > t.bar) {
      if (b.l <= t.stop) {
        t.status = t.status === 'TARGET_1_HIT' ? 'STOPPED_AFTER_T1' : 'STOPPED'
        t.open = false
      } else if (b.h >= t.t2) {
        t.status = 'TARGET_2_HIT'
        t.open = false
      } else if (o.exitOnTrend && ok(maM[i]) && b.c < maM[i]) {
        t.status = 'EXIT_TREND_BREAK'
        t.open = false
      } else if (b.h >= t.t1 && t.status === 'ACTIVE') {
        t.status = 'TARGET_1_HIT'
        if (o.beAfterT1) t.stop = t.entry
      }
    }
    if (!t.open && candKind !== 'NONE' && ok(atrV[i])) {
      if (blockReason === 'NONE') {
        opened = true
        t.open = true
        t.side = 'LONG'
        t.kind = candKind
        t.entry = b.c
        t.stop = b.c - o.stopAtr * atrV[i]
        t.stop0 = t.stop
        t.t1 = t.entry + o.t1R * (t.entry - t.stop)
        t.t2 = t.entry + o.t2R * (t.entry - t.stop)
        t.bar = i
        t.status = 'ACTIVE'
        lastSigBar = i
        lastSigKind = candKind
      } else {
        blockedNow = true
      }
    }
    const tradeUpdate = t.status !== statusBefore && !opened

    // 好材料の窓開け（決算などで窓を開けて上げ、大商いで高く引けた日）
    const volPrev = i > 0 && ok(volAvg[i - 1]) && volAvg[i - 1] > 0 ? b.v / volAvg[i - 1] : null
    const gapPct = p && p.c > 0 ? (b.o / p.c - 1) * 100 : null
    const gapUp = ok(gapPct) && gapPct >= o.gapMinPct && bull && ok(volPrev) && volPrev >= o.gapVolRatio && rng > 0 && (b.c - b.l) / rng >= o.gapClosePos

    // 買い候補の判定（通知が使う。A: 今日の足で買いの形が出た / B: スコアが基準以上で落ち着いた上昇・レンジ）
    const candA = candKind !== 'NONE' && blockReason === 'NONE'
    const candB = o.candAllowState && longScore >= o.scoreThreshold && (regime === 'TREND_UP' || regime === 'RANGE') && overheat < o.overheatBlock && ok(devF) && devF <= o.candMaxDevPct
    const candWhyNot = regime === 'TREND_DOWN' ? 'TREND_DOWN' : regime === 'HIGH_VOLATILITY' ? 'HIGH_VOLATILITY' : htfBias === -1 ? 'WEEKLY_DOWN' : overheat >= o.overheatBlock ? 'OVERHEAT' : !(candA || candB) ? 'NO_SETUP' : 'NONE'
    // 窓開けは、地合いの条件に関係なく候補にする（検証でも条件を付けていない）
    const candPass = (gapUp || candWhyNot === 'NONE') && ok(atrV[i])
    const sigKind = gapUp ? 'GAP' : candKind !== 'NONE' ? candKind : 'STATE'
    const candStop = ok(atrV[i]) ? b.c - o.stopAtr * atrV[i] : null
    if (o.history && ok(atrV[i]) && (candPass || candKind !== 'NONE')) {
      signalHistory.push({
        i, date: b.date, pass: candPass, kind: sigKind, reason: candPass ? 'NONE' : candWhyNot, close: b.c, stop: round(candStop, 1), score: longScore, overheat, regime,
        atr: atrV[i], htf: htfBias, rs: rsDiff, dev: devF, relVol, fromHi: fromHi52, aboveSlow: ok(maS[i]) && b.c > maS[i], slopeUp
      })
    }
    patterns.push(pattern(b, p, atrV[i]))
    prevScore = longScore

    if (i === n - 1) {
      last = {
        b, p, rng, bull, bear, relVol, devF, devM, hi52, lo52, fromHi52, fromLo52, newHigh52, htfBiasStr, htfRsi,
        stockRet, benchRet, rsDiff, slopeUp, slopeDn, regime, fTrend, fMom, fVol, fHtf, fRs, longScore, upPct,
        hDev, hRsi, hWkRsi, hRun, hStreak, hBlow, overheat, heatLevel, structBias, breakUp, breakDown, pullbackNow,
        candKind, blockReason, opened, blockedNow, tradeUpdate, w, candPass, candWhyNot, candStop, gapUp, gapPct, volPrev, sigKind
      }
    }
  }

  const i = n - 1
  const L = last
  const b = L.b
  const event = L.opened ? 'BUY_SETUP' : L.tradeUpdate ? 'TRADE_UPDATE' : L.blockedNow ? 'BUY_BLOCKED' : 'BAR_CLOSE'
  const code = (info.symbol || 'UNKNOWN').split(':').pop()
  const candle = (k) => {
    const x = bars[k]
    const r = x.h - x.l
    return {
      bars_ago: i - k, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v,
      dir: x.c > x.o ? 'bull' : x.c < x.o ? 'bear' : 'flat',
      body_pct: round(r > 0 ? (Math.abs(x.c - x.o) / r) * 100 : 0, 1),
      range_atr: round(ok(atrV[k]) && atrV[k] > 0 ? r / atrV[k] : null),
      pattern: patterns[k]
    }
  }
  const recent = []
  for (let k = Math.max(0, i - o.recentCount + 1); k <= i; k++) recent.push(candle(k))

  return {
    schema: 'kabu-lens/v1',
    source: 'script',
    event,
    symbol: info.symbol || 'UNKNOWN',
    name: info.name || '',
    currency: info.currency || 'JPY',
    timeframe: 'D',
    date_jst: b.date,
    state_code: `KABU|${code}|D|${L.regime}|L${L.longScore}|H${L.overheat}|${t.side}:${t.status}`,
    bars_used: n,
    candle: {
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      direction: L.bull ? 'bull' : L.bear ? 'bear' : 'flat',
      body_pct: round(L.rng > 0 ? (Math.abs(b.c - b.o) / L.rng) * 100 : 0, 1),
      upper_wick_pct: round(L.upPct, 1),
      lower_wick_pct: round(L.rng > 0 ? ((Math.min(b.o, b.c) - b.l) / L.rng) * 100 : 0, 1),
      range_atr: round(ok(atrV[i]) && atrV[i] > 0 ? L.rng / atrV[i] : null),
      close_position_pct: round(L.rng > 0 ? ((b.c - b.l) / L.rng) * 100 : 50, 1),
      gap_pct: round(L.p && L.p.c > 0 ? ((b.o - L.p.c) / L.p.c) * 100 : null),
      closed_above_prev_high: !!L.p && b.c > L.p.h,
      closed_below_prev_low: !!L.p && b.c < L.p.l,
      pattern: patterns[i]
    },
    recent_candles: recent,
    regime: L.regime,
    trend: {
      ma_type: o.maType, ma_fast_len: o.maFastLen, ma_mid_len: o.maMidLen, ma_slow_len: o.maSlowLen,
      ma_fast: round(maF[i], 1), ma_mid: round(maM[i], 1), ma_slow: round(maS[i], 1),
      dev_fast_pct: round(L.devF), dev_mid_pct: round(L.devM),
      stack: ok(maS[i]) && maF[i] > maM[i] && maM[i] > maS[i] ? 'BULLISH' : ok(maS[i]) && maF[i] < maM[i] && maM[i] < maS[i] ? 'BEARISH' : 'MIXED',
      slow_slope: L.slopeUp ? 'RISING' : L.slopeDn ? 'FALLING' : 'FLAT',
      htf: 'W', htf_bias: L.htfBiasStr, htf_rsi: round(L.htfRsi, 1)
    },
    momentum: { rsi: round(rsiV[i]), macd_hist: round(hist[i], 4), macd_hist_rising: i > 0 && ok(hist[i]) && ok(hist[i - 1]) && hist[i] > hist[i - 1] },
    strength: { adx: round(adx[i]), di_plus: round(plus[i]), di_minus: round(minus[i]) },
    volatility: { atr: round(atrV[i], 1), atr_pct_of_price: round(ok(atrV[i]) ? (atrV[i] / b.c) * 100 : null), atr_percentile: round(atrPct[i], 1) },
    volume: { relative: round(L.relVol), turnover: Math.round(turnover[i]), turnover_avg: ok(turnAvg[i]) ? Math.round(turnAvg[i]) : null },
    relative_strength: { benchmark: info.benchmark || null, lookback_bars: o.rsLen, stock_return_pct: round(L.stockRet), bench_return_pct: round(L.benchRet), diff_pct: round(L.rsDiff) },
    range_52w: { high: L.hi52, low: L.lo52, from_high_pct: round(L.fromHi52), from_low_pct: round(L.fromLo52), new_high_close: L.newHigh52 },
    structure: { bias: L.structBias, event: L.breakUp ? 'BREAK_UP' : L.breakDown ? 'BREAK_DOWN' : 'NONE', last_swing_high: swingH1, last_swing_low: swingL1 },
    levels: { prev_week_high: L.w >= 0 ? weeks[L.w].h : null, prev_week_low: L.w >= 0 ? weeks[L.w].l : null },
    earnings: { next_date: null, days_to: null, within_block_window: false },
    overheat: {
      score: L.overheat, level: L.heatLevel, block_at: o.overheatBlock, up_streak: upStreak,
      factors: { deviation: L.hDev, rsi: L.hRsi, weekly_rsi: L.hWkRsi, run_up: L.hRun, streak: L.hStreak, blowoff: L.hBlow }
    },
    scores: {
      long: L.longScore, threshold: o.scoreThreshold, pullback_min: o.pullbackMin,
      factors: { trend: L.fTrend, momentum: L.fMom, volume: L.fVol, htf: L.fHtf, relative_strength: L.fRs }
    },
    buy_candidate: {
      pass: L.candPass, kind: L.candPass ? L.sigKind : 'NONE', why_not: L.candPass ? 'NONE' : L.candWhyNot,
      entry_ref: b.c, stop: round(L.candStop, 1),
      target: ok(L.candStop) && !L.gapUp ? round(b.c + o.trackRR * (b.c - L.candStop), 1) : null,
      hold_days: L.gapUp ? o.gapHoldBars : o.trackMaxBars,
      exit_rule: L.gapUp
        ? `目標は置かない。損切りは動かさず、${o.gapHoldBars}営業日持って終値で手じまい`
        : `目標は損切り幅の${o.trackRR}倍。${o.trackMaxBars}営業日で決着しなければ終値で手じまい`
    },
    gap_up: { is_gap_up: L.gapUp, gap_pct: round(L.gapPct), volume_vs_prev_avg: round(L.volPrev) },
    setup: { candidate: L.candKind, blocked_reason: L.candKind === 'NONE' ? 'NONE' : L.blockReason, pullback_now: L.pullbackNow },
    trade: {
      side: t.side, kind: t.kind, status: t.status,
      entry: round(t.entry, 1), stop: round(t.stop, 1), initial_stop: round(t.stop0, 1),
      target_1: round(t.t1, 1), target_2: round(t.t2, 1), bars_since_entry: t.bar === null ? null : i - t.bar
    },
    last_setup: { kind: lastSigKind, bars_ago: lastSigBar === null ? null : i - lastSigBar },
    ...(o.history ? { signal_history: signalHistory } : {})
  }
}

// ─── データ取得（Yahoo Finance） ─────────────────────────────────────────────

/** 東証の銘柄コード（例: 7203, 285A）かどうか */
export function isTseCode(s) {
  return /^[0-9][0-9A-Z]{3}$/.test(s)
}

const tick = x => (ok(x) ? Math.round(x * 10) / 10 : null)

/** Yahoo Finance のチャートJSONを日足の配列にする。取引時間中の未確定の足は捨てる */
export function parseYahoo(json, nowSec = Date.now() / 1000) {
  const r = json?.chart?.result?.[0]
  if (!r || !r.timestamp) throw new Error(json?.chart?.error?.description || '株価データが空です')
  const q = r.indicators.quote[0]
  const off = r.meta.gmtoffset ?? 32400
  let bars = r.timestamp.map((ts, i) => ({
    ts,
    date: new Date((ts + off) * 1000).toISOString().slice(0, 10),
    // Yahoo の値は 265.79998... のような端数つきで来るので、呼値の最小単位（0.1円）に丸める
    o: tick(q.open[i]), h: tick(q.high[i]), l: tick(q.low[i]), c: tick(q.close[i]), v: q.volume[i] ?? 0
  })).filter(b => ok(b.o) && ok(b.h) && ok(b.l) && ok(b.c))
  // 今日の取引が終わっていなければ（終了後30分までは余裕を見る）、最後の足は未確定として外す
  const reg = r.meta.currentTradingPeriod?.regular
  const lastBar = bars[bars.length - 1]
  let droppedUnconfirmed = false
  if (reg && lastBar && lastBar.ts >= reg.start && nowSec < reg.end + 1800) {
    bars = bars.slice(0, -1)
    droppedUnconfirmed = true
  }
  return { bars, name: r.meta.longName || r.meta.shortName || '', currency: r.meta.currency || 'JPY', droppedUnconfirmed }
}

/**
 * 前場に急騰した株に昼から飛びつく場合の「危険度」（0〜100）。
 * 約1,400銘柄・3年分（前場+5%以上の約23,000回）の検証で、後場に−3%以上下げる割合が
 * 前半・後半の両方で高かった特徴にだけ点を付けている（kabu-lens/research/day/）。
 * 点数が低くても、後場の平均はほぼ0%で、勝率は半分に届かない。「安全」を意味しない。
 * @param {object} f gainPct（前場の上げ%）, price（株価）, volSurge（前場の出来高が普段の何倍か）,
 *   offHighPct（今日の高値からの下げ%。負の数）, run5Pct（直前5日の上げ%）, range20Pct（普段の1日の値幅%）
 */
export function chaseRisk(f) {
  const reasons = []
  let score = 0
  const add = (pts, why) => {
    score += pts
    reasons.push(why)
  }
  if (ok(f.gainPct)) {
    if (f.gainPct >= 20) add(25, '前場で+20%以上の急騰')
    else if (f.gainPct >= 15) add(15, '前場で+15%以上の急騰')
    else if (f.gainPct >= 10) add(8, '前場で+10%以上の上げ')
  }
  if (ok(f.price)) {
    if (f.price < 100) add(25, '株価100円未満')
    else if (f.price < 300) add(12, '株価300円未満')
  }
  if (ok(f.volSurge)) {
    if (f.volSurge >= 30) add(20, '出来高が普段の30倍以上')
    else if (f.volSurge >= 10) add(6, '出来高が普段の10倍以上')
  }
  if (ok(f.offHighPct)) {
    if (f.offHighPct <= -8) add(25, '高値から8%以上下げている')
    else if (f.offHighPct <= -5) add(12, '高値から5%以上下げている')
    else if (f.offHighPct <= -3) add(5, '高値から3%以上下げている')
  }
  if (ok(f.run5Pct)) {
    if (f.run5Pct >= 30) add(25, '直前5日で+30%以上上げている')
    else if (f.run5Pct >= 15) add(12, '直前5日で+15%以上上げている')
  }
  if (ok(f.range20Pct)) {
    if (f.range20Pct >= 8) add(20, '普段から1日8%以上動く')
    else if (f.range20Pct >= 5) add(8, '普段から1日5%以上動く')
  }
  score = Math.min(100, score)
  return { score, level: score >= 35 ? 'HIGH' : score >= 15 ? 'MID' : 'LOW', reasons }
}

/**
 * 前場に急落した株を「いま買う」危険度（0〜100）。高いほど、後場にさらに大きく下げた割合が高かった。
 * 約1,400銘柄・3年分で、前場−5%以下の株を後場の寄り付きで買って引けで売った約19,000回から、
 * 「その株だけ下げた日」の前半・後半の両方で、さらに3%以上下げる割合が高かった特徴にだけ点を付けている。
 * 反発しやすい特徴は見つからなかった。点数が低くても平均はほぼ0%で、「安全」を意味しない。
 * @param {object} f gainPct（今日の騰落%。負の数）, price, offLowPct（今日の安値からの戻り%）, run5Pct, range20Pct
 */
export function dipRisk(f) {
  const reasons = []
  let score = 0
  const add = (pts, why) => {
    score += pts
    reasons.push(why)
  }
  if (ok(f.gainPct) && f.gainPct <= -10) add(8, '前場で10%以上の急落')
  if (ok(f.price) && f.price < 100) add(25, '株価100円未満')
  if (ok(f.offLowPct)) {
    if (f.offLowPct >= 5) add(20, '安値から5%以上戻している（値動きが荒い）')
    else if (f.offLowPct >= 3) add(5, '安値から3%以上戻している')
  }
  if (ok(f.run5Pct)) {
    if (f.run5Pct >= 30) add(25, '直前5日で+30%以上上げていた')
    else if (f.run5Pct >= 15) add(8, '直前5日で+15%以上上げていた')
    else if (f.run5Pct <= -15) add(12, '直前5日で15%以上下げている')
  }
  if (ok(f.range20Pct)) {
    if (f.range20Pct >= 8) add(20, '普段から1日8%以上動く')
    else if (f.range20Pct >= 5) add(8, '普段から1日5%以上動く')
  }
  score = Math.min(100, score)
  return { score, level: score >= 35 ? 'HIGH' : score >= 15 ? 'MID' : 'LOW', reasons }
}

/** Yahoo Finance のチャートJSONから、取引時間中の今の株価を読む（約15〜20分遅れ） */
export function parseYahooNow(json, nowSec = Date.now() / 1000) {
  const r = json?.chart?.result?.[0]
  if (!r || !r.timestamp) throw new Error(json?.chart?.error?.description || '株価データが空です')
  const q = r.indicators.quote[0]
  const off = r.meta.gmtoffset ?? 32400
  const day = ts => new Date((ts + off) * 1000).toISOString().slice(0, 10)
  const rows = r.timestamp.map((ts, i) => ({ date: day(ts), o: tick(q.open[i]), h: tick(q.high[i]), l: tick(q.low[i]), c: tick(q.close[i]), v: q.volume[i] ?? 0 })).filter(b => ok(b.c))
  const last = rows[rows.length - 1]
  const prev = rows[rows.length - 2]
  if (!last) throw new Error('株価データが空です')
  const price = tick(r.meta.regularMarketPrice) ?? last.c
  const t = r.meta.regularMarketTime
  const isToday = last.date === day(nowSec)
  // 今日の足がまだ無い（寄り付き前・休場日）ときは、最後の足が「前の営業日」
  const prevClose = isToday ? prev?.c ?? null : last.c
  return {
    name: r.meta.longName || r.meta.shortName || '',
    price,
    time: t ? new Date((t + off) * 1000).toISOString().slice(0, 16).replace('T', ' ') : null,
    is_today: isToday,
    prev_close: prevClose,
    change_pct: ok(prevClose) && prevClose > 0 ? round((price / prevClose - 1) * 100) : null,
    open: isToday ? last.o : null,
    high: isToday ? last.h : null,
    low: isToday ? last.l : null,
    volume: isToday ? last.v : null,
    from_open_pct: isToday && ok(last.o) && last.o > 0 ? round((price / last.o - 1) * 100) : null
  }
}

/** 指定した銘柄の「今の株価」をまとめて取る。上げ下げの大きい順の一覧も付ける */
export async function fetchNow(codes, { top = 8, parallel = 8 } = {}) {
  const one = async ticker => parseYahooNow(await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`))
  const stocks = new Array(codes.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(parallel, codes.length) }, async () => {
    while (next < codes.length) {
      const k = next++
      try {
        stocks[k] = { code: codes[k], ...(await one(`${codes[k]}.T`)) }
      } catch (e) {
        stocks[k] = { code: codes[k], error: e.message }
      }
    }
  }))
  const market = {}
  for (const [key, ticker] of [['nikkei225', '^N225'], ['topix_etf_1306', '1306.T']]) {
    try {
      market[key] = await one(ticker)
    } catch (e) {
      market[key] = { error: e.message }
    }
  }
  const live = stocks.filter(x => !x.error && x.is_today && ok(x.change_pct))
  const brief = x => ({ code: x.code, name: x.name, price: x.price, change_pct: x.change_pct, from_open_pct: x.from_open_pct, volume: x.volume })
  return {
    source: 'Yahoo Finance（約15〜20分遅れ）',
    fetched_at: new Date().toISOString().slice(0, 19) + 'Z',
    market,
    stocks,
    movers: {
      up: live.filter(x => x.change_pct > 0).sort((a, b) => b.change_pct - a.change_pct).slice(0, top).map(brief),
      down: live.filter(x => x.change_pct < 0).sort((a, b) => a.change_pct - b.change_pct).slice(0, top).map(brief),
      counted: live.length,
      rising: live.filter(x => x.change_pct > 0).length,
      falling: live.filter(x => x.change_pct < 0).length
    }
  }
}

// まず Node の fetch で取り、失敗したら curl で取り直す。
// （プロキシ経由の環境では fetch が通らず curl だけ通ることがある）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
async function fetchText(url) {
  let firstError
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, signal: AbortSignal.timeout(20000) })
    if (res.ok) return await res.text()
    firstError = new Error(`HTTP ${res.status}`)
    if (res.status === 404) throw firstError
  } catch (e) {
    if (e === firstError && /404/.test(e.message)) throw e
    firstError = e
  }
  const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '25', '-A', UA, '-H', 'Accept-Language: ja', url], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
  if (r.status !== 0 || !r.stdout) {
    const why = (r.stderr || r.error?.message || '').trim().split('\n').pop() || firstError?.message || '不明'
    throw new Error(/404/.test(why) ? 'HTTP 404' : `接続に失敗（fetch: ${firstError?.message || '-'} / curl: ${why}）`)
  }
  return r.stdout
}
const fetchJson = async url => JSON.parse(await fetchText(url))

// ─── PTS（夜間取引・朝の時間外取引）の値段。株探のページから読む ─────────────

const num = (t) => {
  const x = Number(String(t ?? '').replace(/[,，円%％\s+＋]/g, '').replace('－', '-').replace('−', '-'))
  return String(t ?? '').trim() !== '' && Number.isFinite(x) ? x : null
}
const strip = t => String(t ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()

/** 株探の個別銘柄ページ（kabutan.jp/stock/?code=…）から、通常取引の株価と PTS の値段を読む */
export function parseKabutanStock(html) {
  const name = strip(html.match(/<div class="si_i1_1">\s*<h2>([\s\S]*?)<\/h2>/)?.[1]).replace(/^[0-9A-Z]{4}\s*/, '') || null
  const price = num(html.match(/<span class="kabuka">([^<]*)<\/span>/)?.[1])
  const priceTime = html.match(/<div class="si_i1_1_rbox">[\s\S]*?<time datetime="([^"]+)"/)?.[1] || null
  const dl = html.match(/<dl class="si_i1_dl1">([\s\S]*?)<\/dl>/)?.[1] || ''
  const dds = [...dl.matchAll(/<dd>([\s\S]*?)<\/dd>/g)].map(m => num(strip(m[1])))
  const pts = html.match(/<div class="kabuka1">PTS<\/div>\s*<div class="kabuka2">([^<]*)<\/div>\s*<div class="kabuka3">([^<]*)<\/div>/)
  const ptsPrice = pts ? num(pts[1]) : null
  return {
    name,
    price,
    price_time: priceTime,
    change: dds[0] ?? null,
    change_pct: dds[1] ?? null,
    pts_price: ptsPrice,
    pts_time: pts && ptsPrice !== null ? pts[2].replace(/\s+/g, ' ').trim() : null,
    pts_vs_price_pct: ptsPrice !== null && price ? round((ptsPrice / price - 1) * 100) : null
  }
}

/** 株探の PTS ランキング（上昇率・下落率）の表を読む */
export function parseKabutanRanking(html) {
  const info = [...(html.match(/<div class="meigara_count">([\s\S]*?)<\/div>/)?.[1] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => strip(m[1]))
  const body = html.match(/<table class="stock_table[^"]*">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] || ''
  const rows = []
  for (const tr of body.split(/<tr>/).slice(1)) {
    const code = tr.match(/\/stock\/\?code=([0-9A-Z]{4})"/)?.[1]
    if (!code) continue
    const name = strip(tr.match(/<th scope="row"[^>]*>([\s\S]*?)<\/th>/)?.[1])
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))
    // コード, 市場, (概要), (チャート), 終値, PTS株価, 終値比, 終値比%, 出来高, …
    rows.push({ code, name, market: tds[1] || null, close: num(tds[4]), pts_price: num(tds[5]), change: num(tds[6]), change_pct: num(tds[7]), volume: num(tds[8]) })
  }
  return { date: info[0] || null, as_of: info[1] || null, base: strip(html.match(/通常取引<br>\s*([0-9]+日終値)/)?.[1]) || null, rows }
}

/** 株探の「今日の株価上昇率ランキング」「ストップ高銘柄」の表を読む */
export function parseKabutanMovers(html) {
  const info = [...(html.match(/<div class="meigara_count">([\s\S]*?)<\/div>/)?.[1] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => strip(m[1]))
  const body = html.match(/<table class="stock_table[^"]*">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] || ''
  const rows = []
  for (const tr of body.split(/<tr>/).slice(1)) {
    const code = tr.match(/\/stock\/\?code=([0-9A-Z]{4})"/)?.[1]
    if (!code) continue
    const name = strip(tr.match(/<th scope="row"[^>]*>([\s\S]*?)<\/th>/)?.[1])
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))
    // コード, 市場, (概要), (チャート), 株価, 印（S=ストップ高、ｹ=気配）, 前日比, 前日比%, 出来高, …
    rows.push({ code, name, market: tds[1] || null, price: num(tds[4]), mark: tds[5] || '', change: num(tds[6]), change_pct: num(tds[7]), volume: num(tds[8]) })
  }
  return { date: info[0] || null, as_of: info[1] || null, rows }
}

// 危険度ごとの、過去の結果（kabu-lens/research/day/。後場の寄り付きで買って引けで売った場合）
const CHASE_HISTORY = {
  LOW: { share_pct: 75, avg_pct: 0.02, win_rate_pct: 49, drop3_pct: 4, drop5_pct: 1, bad_decile_pct: -1.9, avg_worst_dip_pct: -1.4 },
  MID: { share_pct: 17, avg_pct: -0.1, win_rate_pct: 44, drop3_pct: 13, drop5_pct: 4, bad_decile_pct: -3.5, avg_worst_dip_pct: -2.3 },
  HIGH: { share_pct: 8, avg_pct: -0.86, win_rate_pct: 39, drop3_pct: 27, drop5_pct: 17, bad_decile_pct: -7.1, avg_worst_dip_pct: -4.5 }
}

// 急落株の危険度ごとの、過去の結果（「その株だけ下げた日」。相場全体が崩れた日は、日によって結果が大きく違う）
const DIP_HISTORY = {
  LOW: { share_pct: 71, avg_pct: -0.05, win_rate_pct: 46, drop3_pct: 4, drop5_pct: 1, bad_decile_pct: -2.1, avg_worst_dip_pct: -1.3 },
  MID: { share_pct: 21, avg_pct: -0.02, win_rate_pct: 42, drop3_pct: 12, drop5_pct: 4, bad_decile_pct: -3.2, avg_worst_dip_pct: -2.1 },
  HIGH: { share_pct: 8, avg_pct: -0.27, win_rate_pct: 36, drop3_pct: 23, drop5_pct: 10, bad_decile_pct: -5.0, avg_worst_dip_pct: -3.3 }
}

// 朝（寄り付き後15分・9:15ごろ）に同じ点数を当てはめた場合の、過去の結果（直近60日・約2,400回。そこで買って引けで売った場合）。
// 点数の向きは朝でも同じだったが、引けまで長く持つぶん、どの危険度でも大きく下げる割合が昼より高い。
// 期間が短く、前半・後半に分けた確認はできていない（kabu-lens/research/day/README.md）
const OPEN_HISTORY = {
  up: {
    LOW: { share_pct: 77, avg_pct: -0.07, win_rate_pct: 50, drop3_pct: 13, drop5_pct: 5, bad_decile_pct: -3.5 },
    MID: { share_pct: 17, avg_pct: -0.77, win_rate_pct: 41, drop3_pct: 34, drop5_pct: 22, bad_decile_pct: -8.1 },
    HIGH: { share_pct: 6, avg_pct: -0.24, win_rate_pct: 42, drop3_pct: 38, drop5_pct: 32, bad_decile_pct: -12.1 }
  },
  down: {
    LOW: { share_pct: 81, avg_pct: 0.08, win_rate_pct: 50, drop3_pct: 17, drop5_pct: 8, bad_decile_pct: -4.3 },
    MID: { share_pct: 15, avg_pct: 0.18, win_rate_pct: 47, drop3_pct: 27, drop5_pct: 17, bad_decile_pct: -6.9 },
    HIGH: { share_pct: 4, avg_pct: -1.28, win_rate_pct: 32, drop3_pct: 40, drop5_pct: 28, bad_decile_pct: -10.4 }
  }
}

/**
 * 株探の銘柄ニュース一覧から、指定した時刻以降の「材料になりうる」見出しを取る。
 * テクニカルの自動記事（テク）と、まとめ記事（注目・特集）は材料として扱わない。
 * @param {string} sinceIso この時刻以降（例: 前営業日の15:00）
 */
export function parseKabutanNews(html, sinceIso, max = 3) {
  const table = html.match(/<table class="s_news_list[^"]*">([\s\S]*?)<\/table>/)?.[1] || ''
  const out = []
  for (const tr of table.split(/<tr>/).slice(1)) {
    const time = tr.match(/<time datetime="([^"]+)"/)?.[1]
    const category = strip(tr.match(/<div class="newslist_ctg[^"]*">([\s\S]*?)<\/div>/)?.[1])
    const title = strip(tr.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1])
    if (!time || !title || ['テク', '注目', '特集'].includes(category)) continue
    if (/前日に動いた銘柄|話題株|ランキング|本日の【|本日の注目個別銘柄|ダイジェスト|個人投資家の予想|動意株|^[\x20-\x7e]+$/.test(title)) continue
    if (sinceIso && new Date(time) < new Date(sinceIso)) continue
    out.push({ time: time.slice(0, 16), category: category || '決算', title })
  }
  // 記事（材料・決算・修正）を、会社の開示より先に出す
  out.sort((a, b) => (a.category === '開示') - (b.category === '開示'))
  return out.slice(0, max)
}

/** 1時間ごとの株価（Yahoo）から、ある日の後場の結果（後場の始値→終値）を出す。答え合わせ用 */
export function afternoonResult(json, date) {
  const r = json?.chart?.result?.[0]
  if (!r || !r.timestamp) throw new Error(json?.chart?.error?.description || '株価データが空です')
  const q = r.indicators.quote[0]
  const off = r.meta.gmtoffset ?? 32400
  let o = null, c = null, l = Infinity, h = -Infinity, mc = null
  r.timestamp.forEach((ts, i) => {
    if (!ok(q.open[i]) || !ok(q.close[i])) return
    const d = new Date((ts + off) * 1000)
    if (d.toISOString().slice(0, 10) !== date) return
    if (d.getUTCHours() < 12) {
      mc = q.close[i]
      return
    }
    if (o === null) o = q.open[i]
    c = q.close[i]
    l = Math.min(l, q.low[i])
    h = Math.max(h, q.high[i])
  })
  if (o === null) return null
  return { morning_close: tick(mc), afternoon_open: tick(o), close: tick(c), afternoon_pct: round((c / o - 1) * 100), worst_dip_pct: round((l / o - 1) * 100), best_pop_pct: round((h / o - 1) * 100) }
}

/**
 * 昼に記録した危険度の答え合わせ。records は [{code, date, dir('up'|'down'), risk_level, risk_score, has_news, afternoon_pct?}]。
 * afternoon_pct がまだ無いものだけ株価を取りに行き、全体を 向き×危険度 で集計する。
 */
export async function moversResult(records, prevStats = null) {
  const out = []
  for (let k = 0; k < records.length; k += 6) {
    out.push(...await Promise.all(records.slice(k, k + 6).map(async (rec) => {
      if (ok(rec.afternoon_pct)) return rec
      try {
        const res = afternoonResult(await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(rec.code)}.T?range=1mo&interval=60m`), rec.date)
        if (!res) return { ...rec, pending: '後場の値がまだありません' }
        // 朝（寄り付き直後）の記録は「記録したときの株価 → 終値」で見る。昼の記録は「後場の始値 → 終値」
        if (rec.slot === 'open') return ok(rec.price) && rec.price > 0 ? { ...rec, close: res.close, afternoon_pct: round((res.close / rec.price - 1) * 100), basis: '朝の株価→終値', updated: true } : { ...rec, pending: '朝の株価の記録がありません' }
        return { ...rec, ...res, updated: true }
      } catch (e) {
        return { ...rec, pending: e.message }
      }
    })))
  }
  const done = out.filter(x => ok(x.afternoon_pct))
  const noon = done.filter(x => x.slot !== 'open')
  const open = done.filter(x => x.slot === 'open')
  const stats = mergeMoverStats(prevStats, noon)
  stats.open = mergeMoverStats(prevStats?.open, open)
  const today = summarizeMoverStats(mergeMoverStats(null, noon))
  const total = summarizeMoverStats(stats)
  today.morning_slot = summarizeMoverStats(mergeMoverStats(null, open))
  total.morning_slot = summarizeMoverStats(stats.open)
  return {
    note: '昼の記録は「後場の寄り付きで買って引けで売った場合」。morning_slot は朝（寄り付き直後）の記録で、「記録したときの株価で買って引けで売った場合」。朝の点数は昼の検証をそのまま当てはめた参考値なので、昼とは分けて報告する。件数が少ないうちは偶然の影響が大きい（目安は各30件以上）',
    today, total, stats, records: out
  }
}

const MOVER_KEYS = ['LOW', 'MID', 'HIGH', 'with_news', 'no_news']

/** 答え合わせの累計（件数・合計・勝ち・3%以上の下げ）に、新しい日の結果を足す。同じ日は二重に足さない */
export function mergeMoverStats(prev, done) {
  const stats = prev && prev.up ? JSON.parse(JSON.stringify({ ...prev, open: undefined })) : { dates: [], up: {}, down: {} }
  if (prev && prev.open) stats.open = JSON.parse(JSON.stringify(prev.open))
  for (const dir of ['up', 'down']) for (const k of MOVER_KEYS) stats[dir][k] ||= { n: 0, sum: 0, win: 0, drop3: 0 }
  for (const date of [...new Set(done.map(x => x.date))].sort()) {
    if (stats.dates.includes(date)) continue
    stats.dates.push(date)
    for (const x of done.filter(y => y.date === date)) {
      if (!stats[x.dir]) continue
      const keys = [x.risk_level, x.has_news === true ? 'with_news' : x.has_news === false ? 'no_news' : null].filter(k => MOVER_KEYS.includes(k))
      for (const k of keys) {
        const c = stats[x.dir][k]
        c.n++
        c.sum = round(c.sum + x.afternoon_pct)
        if (x.afternoon_pct > 0) c.win++
        if (x.afternoon_pct <= -3) c.drop3++
      }
    }
  }
  return stats
}

export function summarizeMoverStats(stats) {
  const out = { days: stats.dates.length }
  for (const dir of ['up', 'down']) {
    out[dir] = {}
    for (const k of MOVER_KEYS) {
      const c = stats[dir][k]
      out[dir][k] = c.n ? { count: c.n, avg_pct: round(c.sum / c.n), win_rate_pct: round(c.win / c.n * 100, 0), drop3_count: c.drop3, drop3_pct: round(c.drop3 / c.n * 100, 0) } : { count: 0 }
    }
  }
  return out
}

/** 1時間ごとの株価（Yahoo）から、危険度の計算に使う特徴を出す。検証（research/day）と同じ計算 */
export function chaseFeatures(json, nowSec = Date.now() / 1000) {
  const r = json?.chart?.result?.[0]
  if (!r || !r.timestamp) throw new Error(json?.chart?.error?.description || '株価データが空です')
  const q = r.indicators.quote[0]
  const off = r.meta.gmtoffset ?? 32400
  const days = new Map()
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i]
    const c = q.close[i]
    if (!ok(o) || !ok(c)) return
    const d = new Date((ts + off) * 1000)
    const date = d.toISOString().slice(0, 10)
    const x = days.get(date) || { date, h: -Infinity, l: Infinity, o, c, mv: 0 }
    x.h = Math.max(x.h, q.high[i])
    x.l = Math.min(x.l, q.low[i])
    x.c = c
    if (d.getUTCHours() < 12) x.mv += q.volume[i] ?? 0
    days.set(date, x)
  })
  const list = [...days.values()]
  const today = new Date((nowSec + off) * 1000).toISOString().slice(0, 10)
  const t = list[list.length - 1]
  if (!t || t.date !== today) return { is_today: false }
  const past = list.slice(0, -1)
  if (past.length < 6) return { is_today: true, short_history: true }
  const prev = past[past.length - 1]
  const last20 = past.slice(-20)
  const price = tick(r.meta.regularMarketPrice) ?? tick(t.c)
  const mvAvg = last20.reduce((a, x) => a + x.mv, 0) / last20.length
  return {
    is_today: true,
    name: r.meta.longName || r.meta.shortName || '',
    price,
    prev_close: tick(prev.c),
    gainPct: round((price / prev.c - 1) * 100),
    open: tick(t.o),
    high: tick(t.h),
    low: tick(t.l),
    offHighPct: round((price / t.h - 1) * 100),
    offLowPct: round((price / t.l - 1) * 100),
    volSurge: mvAvg > 0 ? round(t.mv / mvAvg, 1) : null,
    run5Pct: round((prev.c / past[past.length - 5].c - 1) * 100),
    range20Pct: round(last20.reduce((a, x) => a + (x.h / x.l - 1) * 100, 0) / last20.length)
  }
}

/**
 * 伸びている株の危険度をまとめて出す。
 * codes を渡せばその銘柄、渡さなければ株探の「今日の株価上昇率ランキング」の上位を対象にする。
 */
export async function fetchChase(codes = [], { pages = 4, minTurnover = 1e8, max = 20, dir = 'up', news = true, open = false } = {}) {
  const down = dir === 'down'
  const out = { dir, source: 'ランキング・ニュース=株探（15分以上遅れ）、株価の履歴=Yahoo Finance（約15〜20分遅れ）', fetched_at: new Date().toISOString().slice(0, 19) + 'Z', history: open ? OPEN_HISTORY[dir] : down ? DIP_HISTORY : CHASE_HISTORY }
  if (open) out.slot = 'open'
  // 材料は「前営業日の15時以降」に出たものを見る（引け後の発表を含めるため）
  const since = new Date(Date.now() + 9 * 3600e3)
  do {
    since.setUTCDate(since.getUTCDate() - 1)
  } while ([0, 6].includes(since.getUTCDay()))
  const sinceIso = since.toISOString().slice(0, 10) + 'T15:00:00+09:00'
  let targets = codes.map(code => ({ code }))
  if (!codes.length) {
    const rows = []
    for (let pg = 1; pg <= pages; pg++) {
      const r = parseKabutanMovers(await fetchText(`https://kabutan.jp/warning/?mode=${down ? '2_2' : '2_1'}&market=0&capitalization=-1&stc=&stm=0&page=${pg}`))
      Object.assign(out, { ranking_date: r.date, ranking_as_of: r.as_of })
      rows.push(...r.rows)
      await sleep(400)
    }
    // 株だけ（ETFなどを除く）。売買代金が少なすぎるものは、買っても売れないので外す
    const stocksOnly = rows.filter(x => ['東Ｐ', '東Ｓ', '東Ｇ'].includes(x.market))
    out.skipped_thin = stocksOnly.filter(x => !(x.price * x.volume >= minTurnover)).length
    targets = stocksOnly.filter(x => x.price * x.volume >= minTurnover).slice(0, max)
  }
  const one = async (tg) => {
    try {
      const f = chaseFeatures(await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tg.code)}.T?range=2mo&interval=60m`))
      if (!f.is_today) return { ...tg, error: '今日の取引がまだありません' }
      if (f.short_history) return { ...tg, error: '上場して間もないため計算できません' }
      const risk = down ? dipRisk(f) : chaseRisk(f)
      let newsList = null
      if (news) {
        try {
          newsList = parseKabutanNews(await fetchText(`https://kabutan.jp/stock/news?code=${tg.code}`), sinceIso)
        } catch {
          newsList = null
        }
      }
      return {
        code: tg.code, name: tg.name || f.name, market: tg.market || null, [down ? 'stop_low' : 'stop_high']: /[SＳ]/.test(tg.mark || ''), bid_only: /ｹ|ケ/.test(tg.mark || ''),
        price: f.price, gain_pct: f.gainPct, open: f.open, high: f.high, low: f.low, off_high_pct: f.offHighPct, off_low_pct: f.offLowPct,
        volume_vs_usual: f.volSurge, run_5d_pct: f.run5Pct, usual_daily_range_pct: f.range20Pct,
        turnover_today: tg.volume && tg.price ? Math.round(tg.price * tg.volume) : null,
        risk_score: risk.score, risk_level: risk.level, reasons: risk.reasons,
        has_news: newsList ? newsList.length > 0 : null, news: newsList
      }
    } catch (e) {
      return { ...tg, error: e.message }
    }
  }
  out.stocks = []
  for (let k = 0; k < targets.length; k += 4) {
    out.stocks.push(...await Promise.all(targets.slice(k, k + 4).map(one)))
    if (news) await sleep(300)
  }
  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 指定した銘柄の PTS と、PTS ランキング（上昇・下落の上位）を取る */
export async function fetchPts(codes, { ranking = true, pages = 2 } = {}) {
  const stocks = []
  for (const code of codes) {
    try {
      stocks.push({ code, ...parseKabutanStock(await fetchText(`https://kabutan.jp/stock/?code=${encodeURIComponent(code)}`)) })
    } catch (e) {
      stocks.push({ code, error: e.message })
    }
    await sleep(400)
  }
  const out = { source: '株探（株価は15分以上遅れ）', fetched_at: new Date().toISOString().slice(0, 19) + 'Z', stocks }
  if (ranking) {
    out.ranking = {}
    for (const [key, path] of [['up', 'pts_night_price_increase'], ['down', 'pts_night_price_decrease']]) {
      const all = { rows: [] }
      try {
        for (let pg = 1; pg <= pages; pg++) {
          const r = parseKabutanRanking(await fetchText(`https://kabutan.jp/warning/${path}?market=0&capitalization=-1&dispmode=normal&stc=&stm=0&page=${pg}`))
          Object.assign(all, { date: r.date, as_of: r.as_of, base: r.base })
          all.rows.push(...r.rows)
          await sleep(400)
        }
      } catch (e) {
        all.error = e.message
      }
      out.ranking[key] = all
    }
  }
  return out
}

/** Yahoo Finance から日足を取る。range は 3y（既定）や 10y など */
export async function fetchYahoo(ticker, range = '3y') {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`
  try {
    return parseYahoo(await fetchJson(url))
  } catch (e) {
    throw new Error(`${ticker}: 株価を取得できませんでした（${e.message}）`)
  }
}

async function main() {
  // プロキシ経由の環境（Claude Code のクラウド環境など）では、Node の fetch は
  // NODE_USE_ENV_PROXY=1 がないとプロキシを使わない。設定して自分を起動し直す。
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' } })
    process.exit(r.status ?? 1)
  }
  const args = process.argv.slice(2)
  const save = !args.includes('--no-save')
  const evalAt = args.indexOf('--evaluate')
  if (evalAt >= 0) return evaluateFile(args[evalAt + 1])
  if (args.includes('--movers-result')) {
    const file = args[args.indexOf('--movers-result') + 1]
    const si = args.indexOf('--stats')
    let prev = null
    if (si >= 0) {
      try {
        prev = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
      } catch {
        prev = null
      }
    }
    console.log(JSON.stringify(await moversResult(JSON.parse(readFileSync(file, 'utf-8')), prev), null, 2))
    return
  }
  if (args.includes('--movers')) {
    const openSlot = args.includes('--open')
    const up = await fetchChase([], { dir: 'up', open: openSlot })
    const dn = await fetchChase([], { dir: 'down', open: openSlot })
    let nikkei = null
    try {
      nikkei = parseYahooNow(await fetchJson('https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?range=5d&interval=1d')).change_pct
    } catch {
      nikkei = null
    }
    console.log(JSON.stringify({
      nikkei_change_pct: nikkei,
      slot: openSlot ? 'open' : 'noon',
      history_note: openSlot ? 'history は朝（9:15ごろ）に買って引けで売った場合の、直近60日の結果。昼より大きく下げる割合が高い' : 'history は昼（後場の寄り付き）に買って引けで売った場合の、過去3年の結果',
      market_wide_selloff: ok(nikkei) ? nikkei <= -2 : null,
      selloff_note: '日経平均が−2%以下の日は相場全体の崩れ。その日は値下がり株の点数があてにならない（過去は、日によって後場の結果が大きく違った）',
      up, down: dn
    }, null, 2))
    return
  }
  if (args.includes('--chase') || args.includes('--dip')) {
    const dipMode = args.includes('--dip')
    const chaseCodes = args.filter(a => !a.startsWith('--')).map(a => a.toUpperCase())
    const badChase = chaseCodes.filter(c => !isTseCode(c))
    if (badChase.length) {
      console.error(`銘柄コードの形が違います: ${badChase.join(', ')}（例: 7203, 285A）`)
      process.exit(1)
    }
    console.log(JSON.stringify(await fetchChase(chaseCodes, { dir: dipMode ? 'down' : 'up' }), null, 2))
    return
  }
  if (args.includes('--now')) {
    const nowCodes = args.filter(a => !a.startsWith('--')).map(a => a.toUpperCase())
    const badNow = nowCodes.filter(c => !isTseCode(c))
    if (badNow.length) {
      console.error(`銘柄コードの形が違います: ${badNow.join(', ')}（例: 7203, 285A）`)
      process.exit(1)
    }
    console.log(JSON.stringify(await fetchNow(nowCodes), null, 2))
    return
  }
  if (args.includes('--pts')) {
    const ptsCodes = args.filter(a => !a.startsWith('--')).map(a => a.toUpperCase())
    const badPts = ptsCodes.filter(c => !isTseCode(c))
    if (badPts.length) {
      console.error(`銘柄コードの形が違います: ${badPts.join(', ')}（例: 7203, 285A）`)
      process.exit(1)
    }
    console.log(JSON.stringify(await fetchPts(ptsCodes, { ranking: !args.includes('--no-ranking') }), null, 2))
    return
  }
  const codes = args.filter(a => !a.startsWith('--')).map(a => a.toUpperCase())
  if (!codes.length) {
    console.error('使い方: node .claude/scripts/kabu-lens.mjs <銘柄コード...> [--no-save] [--backtest]\n        node .claude/scripts/kabu-lens.mjs --evaluate <signals.json>\n        node .claude/scripts/kabu-lens.mjs --pts <銘柄コード...> [--no-ranking]\n        node .claude/scripts/kabu-lens.mjs --now <銘柄コード...>\n        node .claude/scripts/kabu-lens.mjs --chase [銘柄コード...]')
    process.exit(1)
  }
  const bad = codes.filter(c => !isTseCode(c))
  if (bad.length) {
    console.error(`銘柄コードの形が違います: ${bad.join(', ')}（例: 7203, 285A）`)
    process.exit(1)
  }
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T')).bars
  } catch (e) {
    console.error(`注意: 指数(1306)を取得できず、相対強度は null になります: ${e.message}`)
  }
  if (args.includes('--backtest')) return runBacktest(codes, bench, args.includes('--trades'))
  const out = []
  for (const code of codes) {
    try {
      const d = await fetchYahoo(`${code}.T`)
      const packet = analyze(d.bars, bench, { symbol: `TSE:${code}`, name: d.name, currency: d.currency, benchmark: 'TSE:1306' })
      packet.generated_at = new Date().toISOString().slice(0, 19) + 'Z'
      packet.unconfirmed_bar_dropped = d.droppedUnconfirmed
      if (save) {
        mkdirSync('kabu-lens/packets/latest', { recursive: true })
        writeFileSync(`kabu-lens/packets/latest/TSE_${code}_D.json`, JSON.stringify(packet, null, 2), 'utf-8')
      }
      out.push(packet)
    } catch (e) {
      out.push({ symbol: `TSE:${code}`, error: e.message })
    }
  }
  console.log(JSON.stringify(out.length === 1 ? out[0] : out, null, 2))
  if (out.some(p => p.error)) process.exitCode = 1
}

// 過去約3年の足で、買い候補のルールの成績を出す
async function runBacktest(codes, bench, withTrades) {
  const all = { passed: [], blocked: [] }
  const errors = []
  for (const code of codes) {
    try {
      const d = await fetchYahoo(`${code}.T`)
      const r = backtest(d.bars, bench)
      for (const k of ['passed', 'blocked']) all[k].push(...r[k].map(x => ({ code, ...x })))
    } catch (e) {
      errors.push(e.message)
    }
  }
  const by = (list, f) => Object.fromEntries([...new Set(list.map(f))].sort().map(k => [k, summarize(list.filter(x => f(x) === k))]))
  const out = {
    codes: codes.length,
    errors,
    assumptions: `翌営業日の始値で買う（終値より+${DEFAULTS.trackGapPct}%超なら見送り）。損切り=終値−${DEFAULTS.stopAtr}×ATR、目標=買値+損切り幅×${DEFAULTS.trackRR}、${DEFAULTS.trackMaxBars}営業日で決着しなければ終値で手じまい。手数料・税は含まない`,
    passed: summarize(all.passed),
    passed_by_kind: by(all.passed, x => x.kind),
    passed_by_kind_first_half: by(all.passed.filter(x => x.signalDate < '2022'), x => x.kind),
    passed_by_kind_second_half: by(all.passed.filter(x => x.signalDate >= '2022'), x => x.kind),
    passed_by_year: by(all.passed, x => x.signalDate.slice(0, 4)),
    blocked: summarize(all.blocked),
    blocked_by_reason: by(all.blocked, x => x.reason)
  }
  if (withTrades) out.trades = all
  console.log(JSON.stringify(out, null, 2))
}

// 記録した買い候補（[{id, code, date, stop, kind}]）が、その後どうなったかを出す
async function evaluateFile(file) {
  if (!file) {
    console.error('使い方: node .claude/scripts/kabu-lens.mjs --evaluate <signals.json>')
    process.exit(1)
  }
  const sigs = JSON.parse(readFileSync(file, 'utf-8'))
  const cache = new Map()
  const out = []
  for (const sg of sigs) {
    const code = String(sg.code || '').toUpperCase()
    try {
      if (!isTseCode(code)) throw new Error(`銘柄コードの形が違います: ${code}`)
      if (!cache.has(code)) cache.set(code, (await fetchYahoo(`${code}.T`)).bars)
      const bars = cache.get(code)
      const i = bars.findIndex(b => b.date === sg.date)
      if (i < 0) throw new Error(`${sg.date} の足が見つかりません`)
      if (!(sg.stop > 0)) throw new Error('stop がありません')
      const r = evaluateSignal(bars, i, Number(sg.stop), exitFor(sg.kind))
      delete r.exitIdx
      out.push({ id: sg.id, code, ...r })
    } catch (e) {
      out.push({ id: sg.id, code, error: e.message })
    }
  }
  console.log(JSON.stringify(out, null, 2))
}

// CLI として直接実行されたときだけ動く（テストから import されたときは動かない）
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => {
    console.error(e.message)
    process.exit(1)
  })
}
