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
//   node .claude/scripts/kabu-lens.mjs --kessan [YYYYMMDD]  # その日の決算・業績修正の見出し（上方修正・下方修正などに分類）
//   node .claude/scripts/kabu-lens.mjs --next-earnings 7716 5010  # 次の決算発表日（株探の予定日、無ければ去年の発表日からの見込み）
//   node .claude/scripts/kabu-lens.mjs --matsui [day-trading-morning|rise|tick]  # 松井証券のランキング
//   node .claude/scripts/kabu-lens.mjs --tdnet [YYYYMMDD] [コード...]  # 適時開示（TDnet）。増資・業績修正・特別損失などに印を付ける
//   node .claude/scripts/kabu-lens.mjs --kessan-react <YYYYMMDD>  # その日の決算・修正のうち、最初の反応が+7%以上のもの（と上方修正）
//   node .claude/scripts/kabu-lens.mjs --scan-wide <銘柄一覧.json>  # たくさんの銘柄の、その日の買い候補（通過・見送り）だけを出す
//   node .claude/scripts/kabu-lens.mjs --signals-report <候補.json>  # 決着した買い候補を、形・スコア・過熱度・地合い・株価帯などで集計
//   node .claude/scripts/kabu-lens.mjs --considered-result <記録.json> [--stats <累計.json>]  # 買おうとした銘柄のその後
//   node .claude/scripts/kabu-lens.mjs --kessan-result <記録.json> [--stats <累計.json>]  # 上方修正の記録の、その後（1・5・20日）
//   node .claude/scripts/kabu-lens.mjs --check 7203 3100 --state state.json  # 買う前チェック（株数・損切り・止める理由）
//   node .claude/scripts/kabu-lens.mjs --intraday 7203 6758:452     # 場中の判定（5分足・VWAP・支えと壁・合図。約15〜20分遅れ。「:値段」で今の値段をつなぐ）
//   node .claude/scripts/kabu-lens.mjs --scan-now universe-wide.json  # 今、場中の買い場・目印が出ている銘柄を全銘柄から探す（約1分）
//   node .claude/scripts/kabu-lens.mjs --mite 7203[:今の値段] --state st.json --stats-dir dir  # デイトレ・スイング・少し長期の判定と成績・買う前チェックをまとめて
//   node .claude/scripts/kabu-lens.mjs --intraday-replay 7203 2026-11-18  # ある日の場中の判定を30分ごとに再現
//   node .claude/scripts/kabu-lens.mjs --intraday-wide universe-wide.json [--stats st.json] [--five-out f.json]  # 前の営業日の場中の判定を全銘柄で再現して数える（毎晩の自動記録）。--five-out でその日の5分足も保存
//     [--paper 練習口座.json --paper-cands 候補.json --paper-out 新しい練習口座.json]  # 練習口座（仮の資金で合図どおりに売買）を今日の分すすめる
//   node .claude/scripts/kabu-lens.mjs --intraday-result recs.json [--stats st.json]  # 場中の判定の答え合わせ
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
// 途中のキャッシュが古いページ（IR BANK で1時間以上前）を返すことがあるので no-cache を付ける
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
async function fetchText(url) {
  let firstError
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(20000) })
    if (res.ok) return await res.text()
    firstError = new Error(`HTTP ${res.status}`)
    if (res.status === 404) throw firstError
  } catch (e) {
    if (e === firstError && /404/.test(e.message)) throw e
    firstError = e
  }
  const r = spawnSync('curl', ['-sSL', '--fail', '--max-time', '25', '-A', UA, '-H', 'Accept-Language: ja', '-H', 'Cache-Control: no-cache', url], { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 })
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
        has_news: newsList ? newsList.length > 0 : null, news: newsList,
        earnings_news: newsList ? newsList.some(n => ['決算', '修正'].includes(n.category) || /決算|上方修正|下方修正|業績予想/.test(n.title)) : null
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

/** 決算・業績修正の見出しを分類する（株探の決算速報の言い回しに合わせている） */
export function classifyKessan(title) {
  const t = String(title)
  let kind = 'OTHER'
  if (/上方修正/.test(t)) kind = 'REVISE_UP'
  else if (/下方修正/.test(t)) kind = 'REVISE_DOWN'
  else if (/最高益|増益|黒字浮上|黒字転換|赤字縮小/.test(t) && !/減益|赤字転落|赤字拡大/.test(t)) kind = 'GOOD'
  else if (/減益|赤字/.test(t)) kind = 'BAD'
  const m = t.match(/([\d.]+)[％%](?:上方|下方)修正/)
  return { kind, revise_pct: m ? Number(m[1]) : null }
}

/** 株探の「決算速報」の一覧（1ページ分）を読む */
export function parseKabutanKessanList(html) {
  const table = String(html).match(/<table class="s_news_list[^"]*">([\s\S]*?)<\/table>/)?.[1] || ''
  const rows = []
  for (const tr of table.split(/<tr>/).slice(1)) {
    const time = tr.match(/<time datetime="([^"]+)"/)?.[1]
    const code = tr.match(/data-code="([0-9A-Z]{4})"/)?.[1]
    const category = strip(tr.match(/<div class="newslist_ctg[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1])
    const title = strip(tr.match(/<a [^>]*>([\s\S]*?)<\/a>/)?.[1])
    if (!time || !code || !title || /…$/.test(title)) continue
    rows.push({ code, time: time.slice(0, 16), category, title, ...classifyKessan(title) })
  }
  const pages = [...String(html).matchAll(/[?&]page=(\d+)/g)].map(m => Number(m[1]))
  return { rows, last_page: pages.length ? Math.max(...pages) : 1 }
}

/** ある日の決算・業績修正の見出しをまとめて取る（date は YYYYMMDD。省略で今日） */
export async function fetchKessan(date, { maxPages = 100 } = {}) {
  const ymd = date || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '')
  const out = { date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`, source: '株探 決算速報', rows: [] }
  let last = 1
  for (let pg = 1; pg <= Math.min(last, maxPages); pg++) {
    const r = parseKabutanKessanList(await fetchText(`https://kabutan.jp/news/?category=3&date=${ymd}&page=${pg}`))
    if (pg === 1) last = r.last_page
    // 日付を指定しても、件数が少ない日は前日の見出しが混ざるので、その日のものだけ残す
    const mine = r.rows.filter(x => x.time.slice(0, 10) === out.date)
    out.rows.push(...mine)
    if (!mine.length) break
    await sleep(300)
  }
  out.count = out.rows.length
  out.by_kind = out.rows.reduce((a, x) => ({ ...a, [x.kind]: (a[x.kind] || 0) + 1 }), {})
  return out
}

/**
 * 上方修正などの記録1件について、その後の株価を出す。
 * 買うのは「発表の次の営業日の始値」。react は発表への最初の反応（引け後の発表なら翌営業日の始値÷発表日の終値、場中なら発表日の終値÷前日の終値）。
 * ex は、同じ期間の TOPIX連動ETF（1306）との差。
 * @param {object} rec {date: 'YYYY-MM-DD'（発表日）, time: 'HH:MM'}
 * @param {Array} bars 日足 [{date, o, h, l, c}]（古い順）
 * @param {Array} bench 1306 の日足
 */
export function kessanOutcome(rec, bars, bench = []) {
  let i = -1
  for (let k = 0; k < bars.length; k++) if (bars[k].date <= rec.date) i = k
  if (i < 1) return { pending: '発表日より前の株価がありません' }
  const sameDay = bars[i].date === rec.date
  const after = !sameDay || String(rec.time || '15:30') >= '15:00'
  const e = i + 1
  if (e >= bars.length) return { pending: '次の営業日の株価がまだありません' }
  const entry = bars[e].o
  const bi = bench.findIndex(x => x.date === bars[e].date)
  const out = {
    entryDate: bars[e].date,
    entry: tick(entry),
    // 買えなかった可能性：1日じゅう値幅が無い（ストップ高などに張り付き）／始値がその日の高値（ストップ高で寄った）
    stuck: bars[e].h - bars[e].l <= bars[e].h * 0.002,
    openAtHigh: bars[e].o >= bars[e].h * 0.999,
    react: round(after ? (entry / bars[i].c - 1) * 100 : (bars[i].c / bars[i - 1].c - 1) * 100),
    last: tick(bars[bars.length - 1].c),
    lastDate: bars[bars.length - 1].date
  }
  for (const n of [1, 5, 20]) {
    const k = e + n - 1
    if (k >= bars.length) continue
    out['r' + n] = round((bars[k].c / entry - 1) * 100)
    const bk = bi >= 0 ? bench.findIndex(x => x.date === bars[k].date) : -1
    if (bi >= 0 && bk >= 0) out['ex' + n] = round(out['r' + n] - (bench[bk].c / bench[bi].o - 1) * 100)
  }
  out.final = out.r20 !== undefined
  return out
}

const KESSAN_KEYS = ['all', 'react12', 'react7_12', 'react_under12']

/** 5日後の結果が出た記録を、累計に1回だけ足す（足した記録には counted: true が付く） */
export function mergeKessanStats(prev, records) {
  const stats = prev && prev.all ? JSON.parse(JSON.stringify(prev)) : {}
  for (const k of KESSAN_KEYS) stats[k] ||= { n: 0, sum5: 0, sumEx5: 0, nEx: 0, win5: 0, beat5: 0 }
  const out = records.map((r) => {
    if (r.counted || !ok(r.r5)) return r
    const up = !r.kind || r.kind === 'REVISE_UP'
    // 1日じゅう張り付いた日は買えないので、反応の大きさの欄には数えない（始値＝高値の日は、高く始まって下げただけで買えることが多いので数える）
    const buyable = !r.stuck
    const big = !buyable ? null : ok(r.react) && r.react >= 12 ? 'react12' : ok(r.react) && r.react >= 7 ? 'react7_12' : null
    const keys = [up ? 'all' : null, big, up && !(ok(r.react) && r.react >= 12) ? 'react_under12' : null].filter(Boolean)
    for (const k of keys) {
      const c = stats[k]
      c.n++
      c.sum5 = round(c.sum5 + r.r5)
      if (r.r5 > 0) c.win5++
      if (ok(r.ex5)) {
        c.nEx++
        c.sumEx5 = round(c.sumEx5 + r.ex5)
        if (r.ex5 > 0) c.beat5++
      }
    }
    return { ...r, counted: true }
  })
  return { stats, records: out }
}

export function summarizeKessanStats(stats) {
  const out = {}
  for (const k of KESSAN_KEYS) {
    const c = stats[k]
    out[k] = c && c.n ? { count: c.n, avg_5d_pct: round(c.sum5 / c.n), win_rate_pct: round(c.win5 / c.n * 100, 0), avg_vs_topix_5d_pct: c.nEx ? round(c.sumEx5 / c.nEx) : null, beat_topix_pct: c.nEx ? round(c.beat5 / c.nEx * 100, 0) : null } : { count: 0 }
  }
  return out
}

/** 記録（[{id, code, date, time, ...}]）のその後を取りに行き、累計を更新する。final（20日後まで出た）の記録は取りに行かない */
export async function kessanResult(records, prevStats = null) {
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T', '1y')).bars
  } catch {
    bench = []
  }
  const done = []
  for (let k = 0; k < records.length; k += 6) {
    done.push(...await Promise.all(records.slice(k, k + 6).map(async (rec) => {
      if (rec.final) return rec
      try {
        const res = kessanOutcome(rec, (await fetchYahoo(`${rec.code}.T`, '1y')).bars, bench)
        if (res.pending) return { ...rec, pending: res.pending }
        // 上方修正以外は、最初の反応が+7%未満なら追うのをやめる（数えない）
        if (rec.kind && rec.kind !== 'REVISE_UP' && ok(res.react) && res.react < 7) return { ...rec, ...res, final: true, counted: true, dropped: true, updated: true }
        return { ...rec, ...res, updated: true }
      } catch (e) {
        return { ...rec, pending: e.message }
      }
    })))
  }
  const m = mergeKessanStats(prevStats, done)
  return {
    note: 'all と react_under12 は上方修正だけ。react12・react7_12 は決算・修正のすべてで、最初の反応が+12%以上・+7〜12%のもののうち、1日じゅう張り付いた日を除いたもの（約10年の検証で、張り付きを除くと超過5日は +12%以上で約+0.4%、手数料・値段のずれを引くとほぼ残らない）。発表の次の営業日の始値で買った場合。過去約2年の検証では、5日後の平均は 全体+1.1%（TOPIX連動ETFではなく「いつでも買う」基準が+0.45%）、最初の反応が+12%以上は+4.3%（270回、勝率は約3割）。件数が少ないうちは偶然の影響が大きい（目安は各30件以上）',
    total: summarizeKessanStats(m.stats), stats: m.stats, records: m.records
  }
}

// 適時開示の表題から、注意が要る種類を見分ける（表題の言葉だけで判定する。中身は読まない）
const TDNET_TAGS = [
  ['DILUTION', /第三者割当|新株予約権|新株式発行|募集株式|公募|売出し|行使価額修正|ＭＳワラント|株式の発行/],
  ['DANGER', /継続企業の前提|上場廃止|監理銘柄|整理銘柄|特設注意|債務超過|不適正|意見不表明|破産|民事再生|会社更生|上場契約違約金/],
  ['LOSS', /特別損失|評価損|減損/],
  ['REVISION', /業績予想.*修正|配当予想.*修正|業績予想と実績.*差異|予想値と実績値との差異/],
  ['EARNINGS', /決算短信/],
  ['BUYBACK', /自己株式の取得|自己株式取得|自社株買い/],
  ['TOB', /公開買付|ＴＯＢ|TOB|株式交換|完全子会社化|ＭＢＯ|MBO/],
  ['DELAY', /提出期限延長|延期|遅延/]
]
export function tagTdnet(title) {
  const t = String(title)
  // 役員向けのストック・オプションや、新株予約権の消却・期間満了は、株が増える話ではないので外す
  const notDilution = /ストック・?オプション|消却|行使期間満了|譲渡制限付株式|取得条項/.test(t)
  return TDNET_TAGS.filter(([tag, re]) => re.test(t) && !(tag === 'DILUTION' && notDilution)).map(([tag]) => tag)
}

/** TDnet（適時開示情報閲覧サービス）の一覧ページ1枚を読む */
export function parseTdnetList(html) {
  const rows = []
  for (const tr of String(html).split(/<tr>/).slice(1)) {
    const cell = cls => strip(tr.match(new RegExp(`<td[^>]*class="[^"]*${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/td>`))?.[1])
    const time = cell('kjTime')
    const code5 = cell('kjCode')
    const titleHtml = tr.match(/<td[^>]*class="[^"]*kjTitle[^"]*"[^>]*>([\s\S]*?)<\/td>/)?.[1] || ''
    const title = strip(titleHtml)
    if (!/^\d{1,2}:\d{2}$/.test(time) || !code5 || !title) continue
    const pdf = titleHtml.match(/href="([^"]+\.pdf)"/)?.[1] || null
    rows.push({ time, code: code5.slice(0, 4), name: cell('kjName'), title, place: cell('kjPlace'), pdf: pdf ? `https://www.release.tdnet.info/inbs/${pdf}` : null, tags: tagTdnet(title) })
  }
  const pages = [...String(html).matchAll(/I_list_(\d{3})_\d{8}\.html/g)].map(m => Number(m[1]))
  return { rows, last_page: pages.length ? Math.max(...pages) : 1 }
}

/** ある日の適時開示をまとめて取る（date は YYYYMMDD、省略で今日。codes を渡すとその銘柄だけ残す） */
export async function fetchTdnet(date, { codes = [], maxPages = 40 } = {}) {
  const ymd = date || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, '')
  const out = { date: `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`, source: 'TDnet 適時開示情報閲覧サービス（過去約1か月まで）', rows: [] }
  let last = 1
  for (let pg = 1; pg <= Math.min(last, maxPages); pg++) {
    let html
    try {
      html = await fetchText(`https://www.release.tdnet.info/inbs/I_list_${String(pg).padStart(3, '0')}_${ymd}.html`)
    } catch (e) {
      if (pg === 1) out.error = `一覧を取得できませんでした（${e.message}）`
      break
    }
    const r = parseTdnetList(html)
    if (pg === 1) last = r.last_page
    out.rows.push(...r.rows)
    if (!r.rows.length) break
    await sleep(300)
  }
  out.total = out.rows.length
  if (codes.length) out.rows = out.rows.filter(x => codes.includes(x.code))
  out.flagged = out.rows.filter(x => x.tags.some(t => ['DILUTION', 'DANGER', 'LOSS', 'REVISION', 'TOB', 'DELAY'].includes(t)))
  return out
}

/** 松井証券のランキング（デイトレ適性など）の表を読む */
export function parseMatsuiRanking(html) {
  const tables = String(html).match(/<table class="m-table"[\s\S]*?<\/table>/g) || []
  const table = tables.find(t => /<tbody>/.test(t)) || ''
  const rows = []
  for (const tr of (table.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '').split(/<tr>/).slice(1)) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1])
    const m = strip(tds[1]).match(/^(.*?)\s+([0-9A-Z]{4})\s+(\S+)$/s)
    if (!m) continue
    const ch = strip(tds[3]).match(/([-+]?[\d,.]+)\(([-+]?[\d.]+)%\)/)
    const val = t => num(strip(t).replace(/^[^：]*：/, ''))
    rows.push({
      rank: num(strip(tds[0])), name: m[1].replace(/\s+/g, ''), code: m[2], market: m[3],
      price: num(strip(tds[2])), change_pct: ch ? Number(ch[2]) : null,
      volume: val(tds[4]), turnover: val(tds[5]), range_pct: num(strip(tds[6]).replace(/^[^：]*：/, '').replace('%', ''))
    })
  }
  const asOf = String(html).match(/(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2})/)?.[1] || null
  return { as_of: asOf, rows }
}

/** 松井証券のランキングを取る。kind は 'day-trading-morning'（デイトレ適性）・'rise'（値上がり）・'tick'（約定回数） */
export async function fetchMatsuiRanking(kind = 'day-trading-morning') {
  const r = parseMatsuiRanking(await fetchText(`https://finance.matsui.co.jp/ranking-${kind}/index`))
  return { source: `松井証券 ランキング（${kind}）`, ...r }
}

/** IR BANK の銘柄ページの「決算発表資料」の表（提出日・時間・区分・表題）を読む。2013年ごろからある */
export function parseIrbankHistory(html) {
  const t = (String(html).match(/<table[\s\S]*?<\/table>/g) || []).find(x => x.includes('提出日') && x.includes('区分')) || ''
  const rows = []
  for (const tr of t.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const td = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => strip(m[1]))
    if (td.length >= 4 && /^\d{4}\/\d{2}\/\d{2}$/.test(td[0])) rows.push({ date: td[0].replace(/\//g, '-'), time: td[1], kind: td[2], title: td[3] })
  }
  return rows
}

/**
 * 過去の決算発表日から、次の決算発表日を見積もる（去年の同じ時期の発表日 ＋ 364日。曜日がそろう）。
 * 同じ区分（1Q・2Q・3Q・通期）をすでに今年発表していれば、その分は除く。
 */
export function estimateNextEarnings(rows, today) {
  const add = (d, n) => {
    const x = new Date(d + 'T00:00:00Z')
    x.setUTCDate(x.getUTCDate() + n)
    return x.toISOString().slice(0, 10)
  }
  const kessan = rows.filter(r => ['1Q', '2Q', '3Q', '通期'].includes(r.kind) && r.date <= today)
  const cands = []
  for (const r of kessan) {
    const next = add(r.date, 364)
    if (next < today || next > add(today, 200)) continue
    const done = kessan.some(x => x.kind === r.kind && x.date > add(r.date, 300))
    if (!done) cands.push({ date: next, kind: r.kind, last_year: r.date, time: r.time })
  }
  cands.sort((a, b) => a.date.localeCompare(b.date))
  return cands[0] || null
}

/**
 * IR BANK の適時開示一覧（/<code>/ir）から、株が増える資金調達（MSワラント＝行使価額修正条項付の新株予約権、
 * 転換社債、第三者割当の新株）の開示を拾う。リンクの title「… | 表題（YYYY/MM/DD HH:MM提出）」を読む。
 * ストック・オプションは除く。
 */
export function parseDilution(html) {
  const out = []
  const seen = new Set()
  for (const m of String(html).matchAll(/title="[^"|]*\| ([^"]*?)（(\d{4})\/(\d{2})\/(\d{2}) (\d{2}:\d{2})提出）"/g)) {
    const title = m[1].replace(/&amp;/g, '&')
    if (/ストック・オプション|ストックオプション/.test(title)) continue
    const ms = /行使価額修正|修正条項付|MSワラント/.test(title)
    const cb = /転換社債/.test(title)
    const third = /第三者割当/.test(title) && /新株式|募集株式|新規株式/.test(title)
    if (!ms && !cb && !third && !/新株予約権.*行使/.test(title)) continue
    const date = `${m[2]}-${m[3]}-${m[4]}`
    const key = date + title
    if (seen.has(key)) continue
    seen.add(key)
    const series = (title.match(/第(\d+)回/) || [])[1]
    let kind = 'other'
    if (/新株予約権行使/.test(title)) kind = 'other' // 他社の転換社債を行使した（買収など）。自社の株は増えない
    else if (/取得及び消却|消却/.test(title)) kind = 'cancel'
    else if (/行使の?完了|転換の?完了/.test(title)) kind = 'done'
    else if (/大量行使/.test(title)) kind = 'heavy'
    else if (/月間行使/.test(title)) kind = 'monthly'
    else if (/発行|募集/.test(title.replace(/発行された/g, ''))) kind = 'issue' // 「発行された第◯回の…」は発行の開示ではない
    const other = /新株予約権行使/.test(title)
    out.push({ date, time: m[5], title, kind, ms: ms && !other, cb: cb && !other, third, series: series ? Number(series) : null, corrected: /^\(訂正\)|^\(再訂正\)|^（訂正）/.test(title) })
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

/**
 * parseDilution の結果を、買う前チェック用にまとめる。
 * active: 直近1年に MSワラント・転換社債の発行か行使の開示があり、その後に行使完了・消却が出ていない（まだ株が出てくる）。
 * recent_heavy / recent_done: 直近30日の大量行使・行使完了（急騰の天井で株が売られた形）。
 * series_5y: 5年でいくつの MSワラント・転換社債を出したか（2つ以上はくり返し使う会社）。
 */
export function summarizeDilution(rows, today) {
  const add = (d, n) => {
    const x = new Date(d + 'T00:00:00Z')
    x.setUTCDate(x.getUTCDate() + n)
    return x.toISOString().slice(0, 10)
  }
  const rs = (rows || []).filter(r => !r.corrected && r.date <= today)
  const y1 = rs.filter(r => r.date >= add(today, -365))
  const msY1 = y1.filter(r => r.ms || r.cb)
  const latest = msY1[0] || null
  const lastIssue = msY1.find(r => r.kind === 'issue')
  const closedAfter = lastIssue ? msY1.some(r => (r.kind === 'done' || r.kind === 'cancel') && r.date >= lastIssue.date && (r.series == null || r.series === lastIssue.series)) : msY1.some(r => r.kind === 'done' || r.kind === 'cancel')
  const d30 = add(today, -30)
  // 回号（第◯回）で数える。回号の無い開示しか無い会社は、発行の開示の数で数える
  const r5 = rs.filter(r => (r.ms || r.cb) && r.date >= add(today, -365 * 5))
  const numbered = new Set(r5.filter(r => r.series != null).map(r => r.series))
  const s5 = numbered.size ? numbered : new Set(r5.filter(r => r.kind === 'issue').map(r => r.date))
  return {
    has_ms_1y: msY1.length > 0,
    active: msY1.length > 0 && !closedAfter,
    heavy_1y: msY1.filter(r => r.kind === 'heavy').length,
    recent_heavy: msY1.filter(r => r.kind === 'heavy' && r.date >= d30).map(r => r.date),
    recent_done: msY1.filter(r => r.kind === 'done' && r.date >= d30).map(r => r.date),
    third_party_1y: y1.filter(r => r.third && r.kind === 'issue').map(r => r.date),
    series_5y: s5.size,
    latest: latest ? { date: latest.date, title: latest.title } : null
  }
}

/** 株が増える資金調達の開示（IR BANK）。取れなければ null */
export async function fetchDilution(code, today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) {
  try {
    // 途中のキャッシュが古いページを返すことがあるので、毎回ちがう URL にする
    const rows = parseDilution(await fetchText(`https://irbank.net/${code}/ir?_=${Date.now()}`))
    return { ...summarizeDilution(rows, today), source: 'IR BANK の適時開示一覧' }
  } catch {
    return null
  }
}

/**
 * 株探の決算ページ（/stock/finance?code=）から、通期（実績と会社予想）と四半期（3か月ごと）の業績を読む。
 * 金額は百万円。date は発表日（YYYY-MM-DD）。株探プレミアムの部分（長い過去の利益）は読まない。
 */
export function parseKabutanFinance(html) {
  const num = (t) => {
    const x = String(t).replace(/,/g, '').replace(/&nbsp;/g, '').trim()
    return /^[-+]?\d+(\.\d+)?$/.test(x) ? Number(x) : null
  }
  const ymd = (t) => {
    const m = String(t).match(/(\d{2})\/(\d{2})\/(\d{2})/)
    return m ? `20${m[1]}-${m[2]}-${m[3]}` : null
  }
  const tables = String(html).match(/<table[\s\S]*?<\/table>/g) || []
  const rowsOf = t => (t.match(/<tr[\s\S]*?<\/tr>/g) || []).map(tr => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(m => strip(m[1]).replace(/&nbsp;/g, ' ').trim()))
  const out = { annual: [], quarterly: [] }
  for (const t of tables) {
    const plain = strip(t).replace(/\s+/g, '')
    if (plain.includes('プレミアム')) continue
    const isAnnual = plain.startsWith('決算期売上高営業益経常益最終益修正1株益修正1株配発表日')
    const isQuarter = plain.startsWith('決算期売上高営業益経常益最終益修正1株益売上営業損益率発表日')
    if (!isAnnual && !isQuarter) continue
    for (const r of rowsOf(t)) {
      let cells = r.filter(c => c !== '')
      if (cells.length < 8) continue
      let fc = false
      if (cells[0] === '予') {
        fc = true
        cells = cells.slice(1)
      } else if (/^予\s*\S/.test(cells[0])) {
        fc = true
        cells = [cells[0].replace(/^予\s*/, ''), ...cells.slice(1)]
      }
      const c = cells
      const period = c[0]
      // 通期は「2026.09」、四半期は「26.07-09」。上期・下期の表（「25.10-03」）は通期と同じ見出しなので、形で分ける
      if (isAnnual && !/^\d{4}[.]\d{2}$/.test(period)) continue
      if (isQuarter && !/^\d{2}[.]\d{2}-\d{2}$/.test(period)) continue
      const row = { period, sales: num(c[1]), op: num(c[2]), ord: num(c[3]), net: num(c[4]), eps: num(c[5]), date: ymd(c[7]) }
      if (isAnnual) {
        if (out.annual.some(a => a.period === period && a.forecast === fc)) continue
        out.annual.push({ ...row, div: num(c[6]), forecast: fc })
      } else if (!fc && !out.quarterly.some(q => q.period === period)) out.quarterly.push({ ...row, margin: num(c[6]) })
    }
  }
  return out
}

/**
 * 四半期の業績から「業績の勢い」を出す。直近の四半期と、その1年前の同じ四半期を比べる。
 * 返り値: {period, date, op_yoy_pct, sales_yoy_pct, margin, margin_prev, streak（前年比で営業益が増えた四半期が直近から何回続くか）}
 */
export function earningsMomentum(quarterly, upTo = null) {
  const q = (quarterly || []).filter(x => !upTo || (x.date && x.date <= upTo))
  if (q.length < 5) return null
  const yoy = (a, b) => (ok(a) && ok(b) && b > 0 ? round((a / b - 1) * 100, 1) : null)
  const i = q.length - 1
  let streak = 0
  for (let j = i; j >= 4; j--) {
    if (ok(q[j].op) && ok(q[j - 4].op) && q[j].op > q[j - 4].op) streak++
    else break
  }
  return { period: q[i].period, date: q[i].date, op_yoy_pct: yoy(q[i].op, q[i - 4].op), sales_yoy_pct: yoy(q[i].sales, q[i - 4].sales), margin: q[i].margin, margin_prev: q[i - 4].margin, op: q[i].op, op_prev: q[i - 4].op, streak }
}

/** 株探の決算ページを取って読む */
export async function fetchFinance(code) {
  return parseKabutanFinance(await fetchText(`https://kabutan.jp/stock/finance?code=${encodeURIComponent(code)}`))
}

/** 次の決算発表日。株探に予定日があればそれ、無ければ IR BANK の過去の発表日から見積もる */
export async function fetchNextEarnings(code, today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)) {
  try {
    const d = parseKabutanEarningsDate(await fetchText(`https://kabutan.jp/stock/?code=${code}`))
    if (d && d >= today) return { date: d, estimated: false, source: '株探の決算発表予定日' }
  } catch { /* 次を試す */ }
  try {
    const e = estimateNextEarnings(parseIrbankHistory(await fetchText(`https://irbank.net/${code}`)), today)
    if (e) return { date: e.date, estimated: true, kind: e.kind, source: `IR BANK の過去の発表日からの見込み（去年は ${e.last_year} ${e.time}）` }
  } catch { /* 取れなかった */ }
  return null
}

/**
 * ある日の決算・業績修正のうち、最初の反応が minReact% 以上だったもの（と上方修正すべて）を、反応つきで返す。
 * 反応は次の営業日の始値まで分かるので、発表日の翌営業日の夜に使う。
 */
export async function fetchKessanReact(date, { minReact = 7 } = {}) {
  const k = await fetchKessan(date)
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T', '3mo')).bars
  } catch {
    bench = []
  }
  const codes = [...new Set(k.rows.map(r => r.code))]
  const bars = {}
  for (let i = 0; i < codes.length; i += 6) {
    await Promise.all(codes.slice(i, i + 6).map(async (c) => {
      try {
        bars[c] = (await fetchYahoo(`${c}.T`, '3mo')).bars
      } catch {
        bars[c] = null
      }
    }))
  }
  const seen = new Set()
  const rows = []
  for (const r of k.rows) {
    if (seen.has(r.code) || !bars[r.code]) continue
    const o = kessanOutcome({ date: k.date, time: r.time.slice(11, 16) }, bars[r.code], bench)
    if (o.pending) continue
    if (!(o.react >= minReact) && r.kind !== 'REVISE_UP') continue
    seen.add(r.code)
    rows.push({ ...r, date: k.date, time: r.time.slice(11, 16), react: o.react, entryDate: o.entryDate, entry: o.entry })
  }
  rows.sort((a, b) => b.react - a.react)
  return { date: k.date, total: k.count, rows }
}

/**
 * 「買おうとした銘柄」のその後。記録したときの値段（price）から、1・5・20営業日後の終値まで何%動いたか。
 * ex は同じ期間の TOPIX連動ETF（1306）との差。損切り（stop）があれば、そこまでに安値が届いたかも見る。
 * @param {object} rec {date: 'YYYY-MM-DD', price, stop?}
 */
export function consideredOutcome(rec, bars, bench = []) {
  let i = -1
  for (let k = 0; k < bars.length; k++) if (bars[k].date <= rec.date) i = k
  if (i < 0 || !ok(rec.price) || rec.price <= 0) return { pending: '記録した日の株価がありません' }
  const bi = bench.findIndex(x => x.date === bars[i].date)
  const out = { last: tick(bars[bars.length - 1].c), lastDate: bars[bars.length - 1].date }
  for (const n of [1, 5, 20]) {
    const k = i + n
    if (k >= bars.length) continue
    out['r' + n] = round((bars[k].c / rec.price - 1) * 100)
    const bk = bi >= 0 ? bench.findIndex(x => x.date === bars[k].date) : -1
    if (bi >= 0 && bk >= 0) out['ex' + n] = round(out['r' + n] - (bench[bk].c / bench[bi].c - 1) * 100)
    let lo = Infinity
    let hi = -Infinity
    for (let j = i + 1; j <= k; j++) {
      lo = Math.min(lo, bars[j].l)
      hi = Math.max(hi, bars[j].h)
    }
    out['low' + n] = round((lo / rec.price - 1) * 100)
    out['high' + n] = round((hi / rec.price - 1) * 100)
    if (ok(rec.stop) && rec.stop > 0) out['stopHit' + n] = lo <= rec.stop
  }
  out.final = out.r20 !== undefined
  return out
}

const CONSIDERED_KEYS = ['bought', 'passed', 'blocked']

/** 5日後の結果が出た記録を、判断（bought / passed / blocked）ごとに1回だけ足す */
export function mergeConsideredStats(prev, records) {
  const stats = prev && prev.bought ? JSON.parse(JSON.stringify(prev)) : {}
  for (const k of CONSIDERED_KEYS) stats[k] ||= { n: 0, sum5: 0, win5: 0, drop5: 0, nEx: 0, sumEx5: 0 }
  // /mite のスイングの判定ごとの成績（場中の判定は毎晩の全銘柄の記録で数える）。5日後は counted、20日後は counted20 で1回だけ足す
  stats.mite ||= { swing: {} }
  const addMite = (r, n) => {
    if (!r.mite_swing) return
    const c = (stats.mite.swing[r.mite_swing] ||= { n5: 0, sum5: 0, win5: 0, n20: 0, sum20: 0, win20: 0 })
    c['n' + n]++
    c['sum' + n] = round(c['sum' + n] + r['r' + n])
    if (r['r' + n] > 0) c['win' + n]++
  }
  const out0 = records.map((r) => {
    if (r.counted20 || !ok(r.r20) || !r.mite_swing) return r
    addMite(r, 20)
    return { ...r, counted20: true }
  })
  const out = out0.map((r) => {
    if (r.counted || !ok(r.r5) || !CONSIDERED_KEYS.includes(r.decision)) return r
    addMite(r, 5)
    const c = stats[r.decision]
    c.n++
    c.sum5 = round(c.sum5 + r.r5)
    if (r.r5 > 0) c.win5++
    if (r.r5 <= -5) c.drop5++
    if (ok(r.ex5)) {
      c.nEx++
      c.sumEx5 = round(c.sumEx5 + r.ex5)
    }
    return { ...r, counted: true }
  })
  return { stats, records: out }
}

export function summarizeConsideredStats(stats) {
  const out = {}
  for (const k of CONSIDERED_KEYS) {
    const c = stats[k]
    out[k] = c && c.n ? { count: c.n, avg_5d_pct: round(c.sum5 / c.n), win_rate_pct: round(c.win5 / c.n * 100, 0), drop5_pct: round(c.drop5 / c.n * 100, 0), avg_vs_topix_5d_pct: c.nEx ? round(c.sumEx5 / c.nEx) : null } : { count: 0 }
  }
  if (stats.mite) {
    out.mite = {}
    for (const side of ['swing']) {
      out.mite[side] = Object.fromEntries(Object.entries(stats.mite[side] || {}).map(([v, c]) => [v, {
        count5: c.n5, avg_5d_pct: c.n5 ? round(c.sum5 / c.n5) : null, win5_pct: c.n5 ? round(c.win5 / c.n5 * 100, 0) : null,
        count20: c.n20, avg_20d_pct: c.n20 ? round(c.sum20 / c.n20) : null, win20_pct: c.n20 ? round(c.win20 / c.n20 * 100, 0) : null
      }]))
    }
  }
  return out
}

/** 記録（[{id, code, date, price, stop?, decision, ...}]）のその後を取りに行き、累計を更新する。final の記録は取りに行かない */
export async function consideredResult(records, prevStats = null) {
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T', '1y')).bars
  } catch {
    bench = []
  }
  const done = []
  for (let k = 0; k < records.length; k += 6) {
    done.push(...await Promise.all(records.slice(k, k + 6).map(async (rec) => {
      if (rec.final) return rec
      try {
        const res = consideredOutcome(rec, (await fetchYahoo(`${rec.code}.T`, '1y')).bars, bench)
        return res.pending ? { ...rec, pending: res.pending } : { ...rec, ...res, updated: true }
      } catch (e) {
        return { ...rec, pending: e.message }
      }
    })))
  }
  const m = mergeConsideredStats(prevStats, done)
  return {
    note: 'bought=実際に買った、passed=検討して見送った、blocked=買う前チェックで止められた。記録したときの値段から5営業日後の終値まで。drop5_pct は5%以上下げた割合。passed や blocked が下げていれば、見送った・止めた判断が役に立ったことになる。件数が少ないうちは偶然の影響が大きい',
    total: summarizeConsideredStats(m.stats), stats: m.stats, records: m.records
  }
}

/** パケットから、買い候補の追跡に要る項目だけを取り出す（setup が出ていない日は null） */
export function candidateRow(pk, info = {}) {
  const bc = pk.buy_candidate || {}
  const kind = bc.pass ? bc.kind : (pk.setup?.candidate && pk.setup.candidate !== 'NONE' ? pk.setup.candidate : null)
  if (!kind) return null
  const close = pk.candle?.close
  return {
    code: info.code, name: info.name || '', date: pk.date_jst, kind, pass: !!bc.pass, reason: bc.pass ? 'NONE' : (bc.why_not || 'NONE'),
    close, stop: bc.stop ?? (ok(close) && ok(pk.volatility?.atr) ? tick(close - 2 * pk.volatility.atr) : null), target: bc.target ?? null,
    score: pk.scores?.long ?? null, overheat: pk.overheat?.score ?? null, regime: pk.regime || null,
    turnover: pk.volume?.turnover_avg ?? null, atrPct: pk.volatility?.atr_pct_of_price ?? null, dev25: pk.trend?.dev_fast_pct ?? null, rs: pk.relative_strength?.diff_pct ?? null
  }
}

/** たくさんの銘柄を日足で判定し、その日に出た買い候補（通過・見送り）だけを返す */
export async function scanCandidates(list, { parallel = 8 } = {}) {
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T')).bars
  } catch {
    bench = []
  }
  const rows = []
  let errors = 0
  let latest = null
  for (let k = 0; k < list.length; k += parallel) {
    await Promise.all(list.slice(k, k + parallel).map(async (x) => {
      try {
        const d = await fetchYahoo(`${x.code}.T`)
        const pk = analyze(d.bars, bench, { symbol: `TSE:${x.code}`, name: d.name, currency: d.currency, benchmark: 'TSE:1306' })
        if (!latest || pk.date_jst > latest) latest = pk.date_jst
        const r = candidateRow(pk, { code: x.code, name: x.name || d.name })
        if (r) rows.push(r)
      } catch {
        errors++
      }
    }))
  }
  // 足の日付がいちばん新しい日のものだけ（取引の無かった銘柄の古い足を混ぜない）
  const today = rows.filter(r => r.date === latest)
  return { date: latest, scanned: list.length, errors, pass: today.filter(r => r.pass).length, blocked: today.filter(r => !r.pass).length, rows: today }
}

const band = (v, edges, labels) => {
  if (!ok(v)) return '不明'
  for (let i = 0; i < edges.length; i++) if (v < edges[i]) return labels[i]
  return labels[labels.length - 1]
}

/** 決着した買い候補（status が TARGET / STOPPED / TIME_EXIT）を、いろいろな分け方で集計する */
export function signalsReport(records) {
  const done = records.filter(r => ['TARGET', 'STOPPED', 'TIME_EXIT'].includes(r.status) && ok(r.r))
  const agg = l => l.length ? { count: l.length, avg_r: round(l.reduce((a, x) => a + x.r, 0) / l.length), win_rate_pct: round(l.filter(x => x.r > 0).length / l.length * 100, 0), total_r: round(l.reduce((a, x) => a + x.r, 0)) } : { count: 0 }
  const by = (f) => {
    const g = {}
    for (const r of done) (g[f(r)] ||= []).push(r)
    return Object.fromEntries(Object.entries(g).map(([k, l]) => [k, agg(l)]))
  }
  return {
    note: 'R は損切り幅を1としたときの損益。決着した候補だけを数える。件数が少ない分け方は偶然の影響が大きい（目安は30件以上）',
    open: records.filter(r => ['PENDING', 'OPEN'].includes(r.status)).length,
    all: agg(done),
    by_pass: by(r => (r.pass ? '通過' : '見送り')),
    by_kind: by(r => `${r.pass ? '通過' : '見送り'}・${r.kind}`),
    by_reason: by(r => (r.pass ? '通過' : `見送り・${r.reason}`)),
    by_score: by(r => band(r.score, [55, 70, 85], ['55未満', '55〜70', '70〜85', '85以上'])),
    by_overheat: by(r => band(r.overheat, [20, 40, 60], ['20未満', '20〜40', '40〜60', '60以上'])),
    by_regime: by(r => r.regime || '不明'),
    by_price: by(r => band(r.close, [300, 1000, 2200, 5000], ['300円未満', '300〜1,000円', '1,000〜2,200円', '2,200〜5,000円', '5,000円以上'])),
    by_turnover: by(r => band(r.turnover, [1e8, 1e9, 1e10], ['1億円未満', '1〜10億円', '10〜100億円', '100億円以上']))
  }
}

/** 株探の銘柄ページから「決算発表予定日」を読む（載っていなければ null） */
export function parseKabutanEarningsDate(html) {
  const m = String(html).replace(/<[^>]*>/g, ' ').match(/決算発表予定日\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

/** 営業日（土日だけ除く。祝日は見ない）で、from から to まで何日あるか。過ぎていれば負の数 */
export function businessDaysBetween(from, to) {
  const a = new Date(from + 'T00:00:00Z')
  const b = new Date(to + 'T00:00:00Z')
  if (b < a) return -businessDaysBetween(to, from)
  let n = 0
  for (const d = new Date(a); d < b;) {
    d.setUTCDate(d.getUTCDate() + 1)
    if (![0, 6].includes(d.getUTCDay())) n++
  }
  return n
}

/**
 * 2つの銘柄の日々の値動き（終値の前日比）の相関。直近 n 日のうち、両方に値がある日だけで計算する。
 * 1 に近いほど一緒に動く。データが20日分に満たなければ null。
 */
export function returnCorrelation(barsA, barsB, n = 60) {
  const rets = (bars) => {
    const m = new Map()
    for (let i = 1; i < bars.length; i++) if (bars[i - 1].c > 0) m.set(bars[i].date, bars[i].c / bars[i - 1].c - 1)
    return m
  }
  const a = rets(barsA)
  const b = rets(barsB)
  const dates = [...a.keys()].filter(d => b.has(d)).sort().slice(-n)
  if (dates.length < 20) return null
  const xs = dates.map(d => a.get(d))
  const ys = dates.map(d => b.get(d))
  const mean = v => v.reduce((s, x) => s + x, 0) / v.length
  const mx = mean(xs)
  const my = mean(ys)
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? round(sxy / Math.sqrt(sxx * syy)) : null
}

// 最初の値から始める指数平滑（場中の5分足は本数が少ないので、助走なしで使う）
function emaSeed(src, len) {
  const a = 2 / (len + 1)
  const out = []
  for (const x of src) out.push(out.length ? a * x + (1 - a) * out[out.length - 1] : x)
  return out
}

/** 日足（{date,o,h,l,c,v} の配列、古い順）から、場中の判定に使う前提を作る。最後の1本は「前日まで」の最後の日 */
export function intradayContext(daily) {
  if (!daily?.length) return {}
  const c = daily.map(b => b.c)
  const m25 = sma(c, 25)
  const a14 = atr(daily, 14)
  const n = daily.length - 1
  return { prevClose: c[n], ma25: m25[n], ma25Prev: n >= 5 ? m25[n - 5] : null, atrDay: a14[n] }
}

/**
 * 場中の5分足から、地合い（上昇・下降・もみ合い・急落）、VWAP、支えと壁、合図（TAKE・WAIT・SKIP）を出す。
 * bars: 今日の5分足 [{m（9:00=540 の分）, o, h, l, c, v}]（時刻順、まだ出来ていない足は入れない）
 * ctx: intradayContext の結果 {prevClose, ma25, ma25Prev, atrDay}
 * 合図は売買の判断材料の一つ。当たるかは記録して確かめる（研究: kabu-lens/research/day/study_5m.mjs）。
 */
export function intradayView(bars, ctx = {}, opt = {}) {
  if (!bars?.length) return null
  const o = { chaseMax: 8, panicAtr: 0.6, ...opt }
  const last = bars[bars.length - 1]
  const price = last.c
  let pv = 0
  let vv = 0
  const vwapAt = []
  for (const b of bars) {
    const tp = (b.h + b.l + b.c) / 3
    pv += tp * (b.v || 0)
    vv += b.v || 0
    vwapAt.push(vv > 0 ? pv / vv : b.c)
  }
  const vwap = vv > 0 ? pv / vv : bars.reduce((s, b) => s + b.c, 0) / bars.length
  const closes = bars.map(b => b.c)
  const e9 = emaSeed(closes, 9)
  const e20 = emaSeed(closes, 20)
  const k = bars.length - 1
  const slope20 = k >= 6 ? e20[k] - e20[k - 6] : 0
  const recent = bars.slice(-12)
  const atr5 = recent.reduce((s, b) => s + (b.h - b.l), 0) / recent.length
  const dayHigh = Math.max(...bars.map(b => b.h))
  const dayLow = Math.min(...bars.map(b => b.l))
  const orBars = bars.filter(b => b.m < 570)
  const orDone = last.m >= 570 && orBars.length > 0
  const orHigh = orDone ? Math.max(...orBars.map(b => b.h)) : null
  const orLow = orDone ? Math.min(...orBars.map(b => b.l)) : null
  const open = bars[0].o
  const pct = (a, b) => (ok(a) && ok(b) && b > 0 ? round((a / b - 1) * 100, 2) : null)
  const fromPrev = pct(price, ctx.prevClose)
  let dailyTrend = 'FLAT'
  if (!ok(ctx.ma25) || !ok(ctx.prevClose)) dailyTrend = 'UNKNOWN'
  else if (ctx.prevClose > ctx.ma25 && ok(ctx.ma25Prev) && ctx.ma25 > ctx.ma25Prev) dailyTrend = 'UP'
  else if (ctx.prevClose < ctx.ma25 && ok(ctx.ma25Prev) && ctx.ma25 < ctx.ma25Prev) dailyTrend = 'DOWN'
  const hi6 = Math.max(...bars.slice(-6).map(b => b.h))
  let regime = 'CHOPPY'
  if (ok(ctx.atrDay) && hi6 - price >= o.panicAtr * ctx.atrDay && price < vwap) regime = 'PANIC'
  else if (price > vwap && e9[k] > e20[k] && slope20 > 0) regime = 'TREND_UP'
  else if (price < vwap && e9[k] < e20[k] && slope20 < 0) regime = 'TREND_DOWN'

  // 支えと壁：VWAP・寄り付き30分の高安・今日の高安・前日終値・直近の山と谷
  const piv = []
  for (let i = 2; i < bars.length - 2; i++) {
    const w = bars.slice(i - 2, i + 3)
    if (bars[i].l === Math.min(...w.map(b => b.l))) piv.push(['直近の谷', bars[i].l])
    if (bars[i].h === Math.max(...w.map(b => b.h))) piv.push(['直近の山', bars[i].h])
  }
  const lv = [['VWAP', vwap], ['今日の安値', dayLow], ['今日の高値', dayHigh], ['前日終値', ctx.prevClose], ['寄り30分の高値', orHigh], ['寄り30分の安値', orLow], ...piv]
    .filter(([, v]) => ok(v))
  const near = (side) => {
    const xs = lv.filter(([, v]) => (side < 0 ? v < price : v > price)).sort((a, b) => side < 0 ? b[1] - a[1] : a[1] - b[1])
    const outv = []
    for (const [name, v] of xs) if (!outv.some(x => Math.abs(x.price - v) < atr5 * 0.5)) outv.push({ name, price: tick(v) })
    return outv.slice(0, 3)
  }

  const reasons = []
  let signal = 'WAIT'
  let kind = null
  let raw = null
  if (dailyTrend === 'DOWN') reasons.push('日足は25日線の下で、25日線も下向き')
  if (regime === 'PANIC') reasons.push(`急落中：直近30分の高値から日々の値幅の${o.panicAtr}倍以上下げて、VWAPの下`)
  if (regime === 'TREND_DOWN') reasons.push('場中は下降（VWAPの下、短い平均が長い平均の下で下向き）')
  if (ok(fromPrev) && fromPrev >= o.chaseMax) reasons.push(`前日比 +${fromPrev}%：急騰を追いかける形`)
  if (reasons.length) signal = 'SKIP'
  else if (regime === 'TREND_UP') {
    const touched = bars.slice(-3).some(b => b.l <= Math.max(e20[k], vwap) + 0.25 * atr5)
    const brk = orDone && price > orHigh && bars.length >= 2 && bars[k - 1].c <= orHigh
    if (touched && last.c > last.o) {
      signal = 'TAKE'
      kind = 'PULLBACK'
      reasons.push('上昇中の押し目：VWAPか短い平均線まで下げて、陽線で戻した')
    } else if (brk) {
      signal = 'TAKE'
      kind = 'BREAKOUT'
      reasons.push('寄り付き30分の高値を上に抜けた')
    } else reasons.push('上昇中だが、平均線から離れている。押しを待つ')
    // 絞り込み（2026年11月19日。過去34日・約1万4千回の買い場を前半・後半に分け、どちらでも成績が悪かった形を外す）
    if (signal === 'TAKE') {
      const now = last.m + 5
      const atrPct = ok(ctx.atrDay) && ctx.prevClose > 0 ? ctx.atrDay / ctx.prevClose * 100 : null
      const dev25 = ok(ctx.ma25) && ctx.ma25 > 0 ? (ctx.prevClose / ctx.ma25 - 1) * 100 : null
      const vsV = (price / vwap - 1) * 100
      const fo = (price / open - 1) * 100
      const gap = (e9[k] / e20[k] - 1) * 100
      const why = []
      if (now < 630 || now >= 800) why.push('時間帯（10:30〜13:00 以外は成績が平凡）')
      if (vsV >= 1.5) why.push(`VWAPから離れすぎ（+${round(vsV, 1)}%）`)
      if (fo >= 4 || fo < -1) why.push(`始値から${fo >= 4 ? '上げすぎ' : '下げている'}（${round(fo, 1)}%）`)
      if (gap >= 0.5) why.push('短い平均が長い平均から離れすぎ（伸びきり）')
      if (ok(atrPct) && atrPct >= 4) why.push(`値動きの荒い株（1日に約${round(atrPct, 1)}%動く）`)
      if (ok(dev25) && dev25 >= 10) why.push(`25日線から離れすぎ（+${round(dev25, 1)}%）`)
      if (why.length) {
        signal = 'WAIT'
        raw = kind
        kind = null
        reasons.push(`形は買い場だが、検証で成績の出ない条件：${why.join('・')}`)
      }
    }
  } else reasons.push(regime === 'CHOPPY' ? 'もみ合い。方向が出るまで待つ' : '様子見')

  // 目印（合図とは別。試し中）：後場に VWAP を取り戻した形。過去60日では翌日まで持つと全体比+0.2%ほど（前半・後半とも）
  const marks = []
  if (bars.length >= 8 && last.m >= 750 && dailyTrend !== 'DOWN' && !(ok(fromPrev) && fromPrev >= o.chaseMax)) {
    const wasBelow = bars.slice(-7, -1).some((b, j) => b.c < vwapAt[k - 6 + j])
    const avgV = bars.slice(-13, -1).reduce((s2, b) => s2 + (b.v || 0), 0) / Math.min(12, bars.length - 1)
    if (wasBelow && last.c > vwap && last.c > last.o && (last.v || 0) >= 1.5 * avgV) marks.push('RECLAIM_PM')
  }
  // 目印（試し中）：低位株・荒い株の「強い引け」。14:30 以降、前日比+20%以上、VWAP の上、今日の値幅の上3割、張り付いていない（買える）。
  // 1時間足約3年で、張り付いて買えない日を除くと74回・利確+5%・損切り−8%・翌日13時で平均+1.6%（中央値+5.0%、勝率58%）。最初は張り付きの日を数えてしまい+4.2%と出ていた（2026-11-19 訂正）
  const atrPctDay = ok(ctx.atrDay) && ctx.prevClose > 0 ? ctx.atrDay / ctx.prevClose * 100 : null
  const lowGroup = (ok(ctx.prevClose) && ctx.prevClose < 500) || (ok(atrPctDay) && atrPctDay >= 4)
  const stuck = bars.slice(-3).every(b => b.h === b.l)
  if (lowGroup && last.m + 5 >= 870 && ok(fromPrev) && fromPrev >= 20 && !stuck && price > vwap && dayHigh > dayLow && (price - dayLow) / (dayHigh - dayLow) >= 0.7) marks.push('LOW_STRONG_CLOSE')
  const swingLow = Math.min(...bars.slice(-6).map(b => b.l))
  const limit = kind === 'PULLBACK' ? tick(Math.max(vwap, e20[k])) : kind === 'BREAKOUT' ? tick(orHigh) : null
  // 場中の損切り：直近の安値か VWAP の少し下。ただし買値から1%より近くには置かない（2026-11-19。幅0.3%未満だと75%が損切りに当たり、
  // 滑り0.1%を引くと上乗せが0になった。下限1%で、大引けまで持つのとほぼ同じ平均（+0.14%）のまま、一番悪い回を−15%→−3.8%に抑えられた）
  const stopIntraday = signal === 'TAKE' ? tick(Math.min(Math.min(swingLow, vwap) - 0.3 * atr5, (limit ?? price) * 0.99)) : null
  return {
    time: `${String(Math.floor(last.m / 60)).padStart(2, '0')}:${String(last.m % 60).padStart(2, '0')}`,
    price,
    open,
    vwap: tick(vwap),
    ema9: tick(e9[k]),
    ema20: tick(e20[k]),
    from_prev_pct: fromPrev,
    from_open_pct: pct(price, open),
    vs_vwap_pct: pct(price, vwap),
    day_high: dayHigh,
    day_low: dayLow,
    or_high: orHigh,
    or_low: orLow,
    atr5: round(atr5, 2),
    daily_trend: dailyTrend,
    ma25: tick(ctx.ma25),
    regime,
    supports: near(-1),
    resistances: near(1),
    signal,
    kind,
    reasons,
    limit,
    stop_intraday: stopIntraday,
    raw_take: raw || kind,
    low_group: lowGroup,
    marks
  }
}

/** 5分足（Yahoo の chart JSON）を日ごとに分ける。{date: [{m,o,h,l,c,v}]} */
export function splitFiveMin(json) {
  const r = json?.chart?.result?.[0]
  const days = {}
  if (!r?.timestamp) return days
  const q = r.indicators.quote[0]
  // 場中は、最後に「足になっていない最新の約定（時刻が5分の区切りでない・出来高0）」が1点付いてくる。
  // これを1本の足として扱うと、その1回の約定で合図が出たり消えたりする（2026-11-19、一覧では買い場・個別では待つ、のずれ）。
  // 検証（intradayReplay）は「出来上がった足」だけで判定しているので、それにそろえて、区切りでない点と、まだ出来上がっていない足を除く
  const asOf = Number(r.meta?.regularMarketTime) || Infinity
  r.timestamp.forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i] ?? 0
    if (o == null || c == null || h == null || l == null) return
    if (ts % 300 !== 0 || ts + 300 > asOf) return
    const d = new Date((ts + 9 * 3600) * 1000)
    const date = d.toISOString().slice(0, 10)
    const m = d.getUTCHours() * 60 + d.getUTCMinutes()
    if (m < 540 || m >= 930) return
    ;(days[date] ||= []).push({ m, o, h, l, c, v })
  })
  return days
}

/** 場中の判定を取る（株価は15〜20分遅れ）。codes の各銘柄について intradayView と、チャート用の今日の5分足を返す */
export async function fetchIntraday(codes, { live = {} } = {}) {
  const out = []
  await Promise.all(codes.map(async (code) => {
    try {
      const [five, d, now] = await Promise.all([
        fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=5d&interval=5m`),
        fetchYahoo(`${code}.T`, '6mo'),
        fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=5d&interval=1d`).then(j => parseYahooNow(j)).catch(() => null)
      ])
      const days = splitFiveMin(five)
      const dates = Object.keys(days).sort()
      const today = dates[dates.length - 1]
      const daily = d.bars.filter(b => b.date < today)
      // 本人が楽天の画面で見た今の値段（live）があれば、遅れた5分足の後ろにつないで判定し直す
      let bars = days[today]
      const lp = live[code]
      // 朝の早い時間は、遅れのせいで今日の5分足がまだ無い。そのときは今の値段を前の日の足につながない
      const jstToday = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
      const noTodayYet = ok(lp) && lp > 0 && today < jstToday && new Date(Date.now() + 9 * 3600e3).getUTCDay() % 6 !== 0
      if (noTodayYet) {
        out.push({ code, name: d.name, date: today, error: `今日（${jstToday}）の5分足がまだ届いていません（約15〜20分遅れ）。9:20〜9:30ごろからもう一度` })
        return
      }
      if (ok(lp) && lp > 0) {
        const last = bars[bars.length - 1]
        bars = [...bars, { m: last.m + 5, o: last.c, h: Math.max(last.c, lp), l: Math.min(last.c, lp), c: lp, v: 0 }]
      }
      const view = intradayView(bars, intradayContext(daily))
      if (ok(lp) && lp > 0) Object.assign(view, { live_price: lp, time: '今（本人の画面の値段）', delayed_price: days[today][days[today].length - 1].c })
      // Yahoo の5分足は 9:00 の足が欠けることがあるので、始値は日足から取る
      if (now?.is_today && ok(now.open)) Object.assign(view, { open: now.open, from_open_pct: round((view.price / now.open - 1) * 100, 2), day_high: Math.max(view.day_high, now.high ?? -Infinity), day_low: Math.min(view.day_low, now.low ?? Infinity) })
      out.push({ code, name: d.name, date: today, ...view, bars: days[today].map(b => [b.m, b.o, b.h, b.l, b.c, b.v]) })
    } catch (e) {
      out.push({ code, error: e.message })
    }
  }))
  return { source: 'Yahoo Finance の5分足（約15〜20分遅れ）', fetched_at: new Date().toISOString().slice(0, 19) + 'Z', stocks: codes.map(c => out.find(x => x.code === c)) }
}

/**
 * ある日の場中の判定を、時刻ごとに再現する（その時刻までに出来た足だけを使う）。
 * 結果には、その時刻の値段と、そこから大引けまでの騰落を付ける。delay 分遅れで見えていた場合も示す。
 */
export function intradayReplay(dayBars, ctx, { times = [570, 600, 630, 660, 780, 810, 840, 870, 900], delay = 20 } = {}) {
  const close = dayBars[dayBars.length - 1].c
  const out = []
  for (const t of times) {
    const seen = dayBars.filter(b => b.m + 5 <= t)
    if (seen.length < 3) continue
    const v = intradayView(seen, ctx)
    const at = dayBars.find(b => b.m >= t + delay)
    out.push({
      time: `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`,
      price: v.price,
      regime: v.regime,
      signal: v.signal,
      kind: v.kind,
      reasons: v.reasons,
      vwap: v.vwap,
      limit: v.limit,
      to_close_pct: round((close / v.price - 1) * 100, 2),
      seen_delayed_at: at ? `${Math.floor(at.m / 60)}:${String(at.m % 60).padStart(2, '0')}` : null,
      price_when_seen: at ? at.o : null
    })
  }
  return { close, steps: out }
}

// 毎晩の自動記録で数える組（名前 → 判定がその組に入るか）
const WIDE_GROUPS = {
  ALL: () => true,
  TAKE: r => r.signal === 'TAKE',
  TAKE_PULLBACK: r => r.kind === 'PULLBACK',
  TAKE_BREAKOUT: r => r.kind === 'BREAKOUT',
  TAKE_RAW: r => !!r.raw,
  TAKE_1030_1100: r => r.signal === 'TAKE' && (r.t === 630 || r.t === 660),
  WAIT: r => r.signal === 'WAIT',
  SKIP: r => r.signal === 'SKIP',
  RECLAIM_PM: r => r.marks.includes('RECLAIM_PM'),
  TREND_UP: r => r.regime === 'TREND_UP',
  CHOPPY: r => r.regime === 'CHOPPY',
  TREND_DOWN: r => r.regime === 'TREND_DOWN',
  PANIC: r => r.regime === 'PANIC',
  CHASE8: r => ok(r.fromPrev) && r.fromPrev >= 8,
  LOW_ALL: r => r.low,
  LOW_TAKE_RAW: r => r.low && !!r.raw,
  LOW_STRONG_CLOSE: r => r.marks.includes('LOW_STRONG_CLOSE')
}

/**
 * 1日分の場中の判定を、たくさんの銘柄でまとめて再現して数える（study_5m と同じ決まり：30分ごと、20分遅れで買う、同じ時刻の全銘柄平均との差）。
 * items: [{code, day: その日の5分足, nextClose: 翌営業日の終値, ctx}]
 * 返り値: {groups: {組: {n, sumExC, sumExN, winC}}, checks}
 */
export function intradayWideDay(items, { times = [570, 600, 630, 660, 780, 810, 840, 870], delay = 20 } = {}) {
  const rows = []
  for (const it of items) {
    const day = it.day
    if (!day?.length || !ok(it.nextClose)) continue
    const close = day[day.length - 1].c
    for (const t of times) {
      const seen = day.filter(b => b.m + 5 <= t)
      if (seen.length < 3) continue
      const e = day.find(b => b.m >= t + delay)
      if (!e || !(e.o > 0)) continue
      const v = intradayView(seen, it.ctx || {})
      rows.push({ t, signal: v.signal, kind: v.kind, raw: v.raw_take, low: v.low_group, regime: v.regime, marks: v.marks, fromPrev: v.from_prev_pct, rC: (close / e.o - 1) * 100, rN: (it.nextClose / e.o - 1) * 100 })
    }
  }
  const base = new Map()
  for (const r of rows) {
    const b = base.get(r.t) || { n: 0, c: 0, x: 0 }
    b.n++
    b.c += r.rC
    b.x += r.rN
    base.set(r.t, b)
  }
  const groups = {}
  for (const g of Object.keys(WIDE_GROUPS)) groups[g] = { n: 0, sumExC: 0, sumExN: 0, winC: 0 }
  for (const r of rows) {
    const b = base.get(r.t)
    const exC = r.rC - b.c / b.n
    const exN = r.rN - b.x / b.n
    for (const [g, f] of Object.entries(WIDE_GROUPS)) {
      if (!f(r)) continue
      const x = groups[g]
      x.n++
      x.sumExC += exC
      x.sumExN += exN
      if (exC > 0) x.winC++
    }
  }
  for (const x of Object.values(groups)) {
    x.sumExC = round(x.sumExC, 3)
    x.sumExN = round(x.sumExN, 3)
  }
  return { groups, checks: rows.length }
}

/** 1日分（intradayWideDay の結果に date を付けたもの）を累計に足す。同じ日は2回足さない */
export function mergeIntradayWide(prev, day) {
  const st = prev ? JSON.parse(JSON.stringify(prev)) : { days: [], groups: {} }
  if (st.days.includes(day.date)) return st
  st.days.push(day.date)
  st.days.sort()
  for (const [g, x] of Object.entries(day.groups)) {
    const c = (st.groups[g] ||= { n: 0, sumExC: 0, sumExN: 0, winC: 0 })
    c.n += x.n
    c.sumExC = round(c.sumExC + x.sumExC, 3)
    c.sumExN = round(c.sumExN + x.sumExN, 3)
    c.winC += x.winC
  }
  return st
}

/**
 * 毎晩の自動記録：universe の銘柄すべてについて、前の営業日の場中の判定を再現し、その日の大引け・翌営業日（＝今日）の大引けまでで答え合わせする。
 * 今日の夜に動かすと「前の営業日」が対象になる（翌日の終値がそろうため）。
 */
export async function fetchIntradayWide(list, { date = null, parallel = 8, keepLatest = false, paper = false } = {}) {
  const items = []
  const latest = {}
  const paperDays = {}
  let target = date
  let errors = 0
  for (let i = 0; i < list.length; i += parallel) {
    await Promise.all(list.slice(i, i + parallel).map(async ({ code, name }) => {
      try {
        const [five, d] = await Promise.all([
          fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=5d&interval=5m`),
          fetchYahoo(`${code}.T`, '6mo')
        ])
        const days = splitFiveMin(five)
        const dates = Object.keys(days).sort()
        if (paper && dates.length) {
          // 練習口座用：いちばん新しい日の5分足と、その前の日までの日足から作る場中の前提
          const ld = dates[dates.length - 1]
          const past = d.bars.filter(b => b.date < ld)
          const turnover = past.slice(-20).reduce((s, b) => s + b.c * b.v, 0) / 20
          ;(paperDays[ld] ||= {})[code] = { name: name || d.name, bars: days[ld], ctx: intradayContext(past), turnover }
        }
        if (keepLatest && dates.length) {
          const ld = dates[dates.length - 1]
          ;(latest[ld] ||= {})[code] = days[ld].map(b => [b.m, b.o, b.h, b.l, b.c, b.v])
        }
        if (dates.length < 2) return
        const t = target || dates[dates.length - 2]
        const j = dates.indexOf(t)
        if (j < 0 || j + 1 >= dates.length) return
        const next = days[dates[j + 1]]
        items.push({ code, date: t, day: days[t], nextClose: next[next.length - 1].c, ctx: intradayContext(d.bars.filter(b => b.date < t)) })
      } catch {
        errors++
      }
    }))
  }
  // いちばん多い日付にそろえる（銘柄によって最後の日がずれることがあるため）
  const cnt = {}
  for (const it of items) cnt[it.date] = (cnt[it.date] || 0) + 1
  target = target || Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const use = items.filter(it => it.date === target)
  const res = { date: target, stocks: use.length, errors, ...intradayWideDay(use) }
  if (paper) {
    const pd = Object.entries(paperDays).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0]
    res.paper = pd ? { date: pd[0], stocks: pd[1] } : null
  }
  if (keepLatest) {
    // いちばん多くの銘柄がそろった最後の日の5分足（毎晩保存して、60日より長いデータにする）
    const ld = Object.entries(latest).sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0]
    res.latest = ld ? { date: ld[0], bars: ld[1] } : null
  }
  return res
}

// ---- 練習口座（シミュレーション）----------------------------------------------
// 合図どおりに「仮の資金」で買って売ったら、どうなったかを毎日数える。本人の売買とは別。
// ・デイトレ：場中の買い場（10:30〜13:00、低位株・荒い株は除く）。見えてから20分後に指値の目安で指値、30分で約定しなければ取り消し。
//   約定したら場中の損切りの目安に逆指値、届かなければ大引け。1日2回まで
// ・スイング：前の夜の買い候補（通過）。寄りが終値の+2%以内なら寄りで買う。損切り・目標（3R）・最長40営業日。同時に3銘柄まで
// ・低位株の強い引け：14:30の判定で目印 → 14:50に買い、翌日 利確+5%・損切り−8%、どちらも無ければ翌日13時。1日1回まで
// ・株数：損切りまでの損が資金の riskPct% 以内、1銘柄は資金の maxPosPct% 以内、現金の範囲で、100株単位
// ・成行（寄り・逆指値・時間切れ）は0.1%不利に約定するとみる。指値は指値の値段。手数料は0（楽天のゼロコース）
export const PAPER_DEFAULTS = {
  capital: 1000000, riskPct: 1, maxPosPct: 30, swingMax: 3, dayMax: 2, lowMax: 1, slipPct: 0.1,
  dayFrom: 630, dayTo: 780, delay: 20, fillWindow: 30, lowAt: 870, lowEntryM: 890, lowTpPct: 5, lowSlPct: 8, lowExitM: 780,
  swingGapPct: 2, swingMaxDays: 40
}

export function paperNew(params = {}) {
  const p = { ...PAPER_DEFAULTS, ...params }
  return { params: p, start: null, cash: p.capital, positions: [], history: [], days: [] }
}

const ohlcOf = bars => ({ o: bars[0].o, h: Math.max(...bars.map(b => b.h)), l: Math.min(...bars.map(b => b.l)), c: bars[bars.length - 1].c })

/**
 * 練習口座を1営業日すすめる。
 * input: {date, stocks: {code: {name, bars: その日の5分足 [{m,o,h,l,c,v}], ctx: intradayContext（前日まで）, turnover}}, cands: 買い候補（pass のもの。date が前の営業日の分を使う）}
 * 返り値: {state, trades: その日に決着した売買, opened: その日に買った売買}
 */
export function paperStep(prev, { date, stocks = {}, cands = [] }) {
  const st = JSON.parse(JSON.stringify(prev))
  const p = st.params
  if (st.days.includes(date)) return { state: st, trades: [], opened: [], skipped: true }
  const slip = p.slipPct / 100
  const trades = []
  const opened = []
  const r1 = x => Math.round(x * 10) / 10
  const equityNow = () => st.cash + st.positions.reduce((s, x) => s + x.qty * x.last, 0)
  const equity0 = equityNow()
  const sizeOf = (price, stop, cash) => {
    const rps = price - stop
    if (!(price > 0) || !(rps > 0)) return 0
    const n = Math.min(equity0 * p.riskPct / 100 / rps, equity0 * p.maxPosPct / 100 / price, cash / price)
    return Math.floor(n / 100) * 100
  }
  const close = (pos, price, reason) => {
    const exit = r1(price)
    st.cash += pos.qty * exit
    const pnl = Math.round((exit - pos.entry) * pos.qty)
    trades.push({ id: `${pos.entryDate}-${pos.track}-${pos.code}`, track: pos.track, code: pos.code, name: pos.name, entryDate: pos.entryDate, entry: pos.entry, exitDate: date, exit, qty: pos.qty, pnl, pnlPct: round((exit / pos.entry - 1) * 100, 2), reason, held: pos.held || 0 })
  }
  const open = (track, code, name, entry, qty, extra = {}) => {
    const pos = { track, code, name, entryDate: date, entry: r1(entry), qty, last: r1(entry), held: 0, ...extra }
    st.cash -= pos.qty * pos.entry
    opened.push({ ...pos })
    return pos
  }
  const keep = []
  // 1. 持っている株の決着（低位株の強い引けは今日の13時まで、スイングは今日の日足で）
  for (const pos of st.positions) {
    const bars = stocks[pos.code]?.bars
    if (!bars?.length) {
      pos.held = (pos.held || 0) + 1
      keep.push(pos)
      continue
    }
    if (pos.track === 'low') {
      const tp = pos.entry * (1 + p.lowTpPct / 100)
      const sl = pos.entry * (1 - p.lowSlPct / 100)
      let done = false
      const first = bars[0]
      if (first.o >= tp) {
        close(pos, first.o, '利確（寄り）')
        done = true
      } else if (first.o <= sl) {
        close(pos, first.o * (1 - slip), '損切り（寄り）')
        done = true
      }
      for (const b of bars) {
        if (done) break
        if (b.m >= p.lowExitM) {
          close(pos, b.o * (1 - slip), '翌日13時')
          done = true
        } else if (b.l <= sl) {
          close(pos, sl * (1 - slip), '損切り')
          done = true
        } else if (b.h >= tp) {
          close(pos, tp, '利確')
          done = true
        }
      }
      if (!done) close(pos, bars[bars.length - 1].c * (1 - slip), '翌日の引け')
      continue
    }
    // スイング
    const x = ohlcOf(bars)
    pos.held = (pos.held || 0) + 1
    if (x.o <= pos.stop) close(pos, x.o * (1 - slip), '損切り（寄り）')
    else if (x.l <= pos.stop) close(pos, pos.stop * (1 - slip), '損切り')
    else if (pos.target && x.o >= pos.target) close(pos, x.o, '目標（寄り）')
    else if (pos.target && x.h >= pos.target) close(pos, pos.target, '目標')
    else if (pos.held >= p.swingMaxDays) close(pos, x.c * (1 - slip), '期間切れ')
    else {
      pos.last = x.c
      keep.push(pos)
    }
  }
  st.positions = keep
  // 2. スイングの買い（前の営業日の夜の候補）
  const prevDate = cands.filter(c => c.date < date).map(c => c.date).sort().pop()
  const todays = cands.filter(c => c.date === prevDate && c.pass !== false).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  for (const c of todays) {
    if (st.positions.filter(x => x.track === 'swing').length >= p.swingMax) break
    if (st.positions.some(x => x.code === c.code)) continue
    const bars = stocks[c.code]?.bars
    if (!bars?.length || !(c.close > 0) || !(c.stop > 0)) continue
    const x = ohlcOf(bars)
    if (x.o > c.close * (1 + p.swingGapPct / 100) || x.o <= c.stop) continue
    const entry = x.o * (1 + slip)
    const qty = sizeOf(entry, c.stop, st.cash)
    if (qty < 100) continue
    const pos = open('swing', c.code, c.name || stocks[c.code]?.name || '', entry, qty, { stop: c.stop, target: c.target ?? null, kind: c.kind || null, score: c.score ?? null })
    if (x.l <= pos.stop) close(pos, pos.stop * (1 - slip), '損切り（当日）')
    else if (pos.target && x.h >= pos.target) close(pos, pos.target, '目標（当日）')
    else {
      pos.last = x.c
      st.positions.push(pos)
    }
  }
  // 3. デイトレ（場中の買い場）
  const events = []
  const lows = []
  for (const [code, s] of Object.entries(stocks)) {
    const bars = s.bars
    if (!bars?.length || !s.ctx) continue
    for (let t = p.dayFrom; t < p.dayTo + 20; t += 5) {
      const seen = bars.filter(b => b.m + 5 <= t)
      if (seen.length < 3) continue
      const v = intradayView(seen, s.ctx)
      if (!v) continue
      if (v.signal === 'TAKE' && !v.low_group && ok(v.limit) && ok(v.stop_intraday)) {
        events.push({ t, code, name: s.name, limit: v.limit, stop: v.stop_intraday, kind: v.kind, turnover: s.turnover || 0 })
        break
      }
    }
    const seenL = bars.filter(b => b.m + 5 <= p.lowAt)
    if (seenL.length >= 3) {
      const v = intradayView(seenL, s.ctx)
      if (v?.marks?.includes('LOW_STRONG_CLOSE')) lows.push({ code, name: s.name, turnover: s.turnover || 0 })
    }
  }
  events.sort((a, b) => a.t - b.t || b.turnover - a.turnover)
  let dayCount = 0
  let dayCash = st.cash
  for (const e of events) {
    if (dayCount >= p.dayMax) break
    if (st.positions.some(x => x.code === e.code)) continue
    const bars = stocks[e.code].bars
    const from = e.t + p.delay
    const k = bars.findIndex(b => b.m >= from && b.m < from + p.fillWindow && b.l <= e.limit)
    if (k < 0) continue
    const price = Math.min(e.limit, bars[k].o)
    const qty = sizeOf(price, e.stop, dayCash)
    if (qty < 100) continue
    dayCount++
    dayCash -= qty * price
    const pos = open('day', e.code, e.name || '', price, qty, { stop: e.stop, kind: e.kind, seenAt: `${Math.floor(e.t / 60)}:${String(e.t % 60).padStart(2, '0')}` })
    let done = false
    if (bars[k].l <= e.stop) {
      close(pos, e.stop * (1 - slip), '損切り（約定した足）')
      done = true
    }
    for (const b of bars.slice(k + 1)) {
      if (done) break
      if (b.o <= e.stop) {
        close(pos, b.o * (1 - slip), '損切り')
        done = true
      } else if (b.l <= e.stop) {
        close(pos, e.stop * (1 - slip), '損切り')
        done = true
      }
    }
    if (!done) close(pos, bars[bars.length - 1].c, '大引け')
  }
  // 4. 低位株の強い引け（14:50に買って翌日に決着）
  lows.sort((a, b) => b.turnover - a.turnover)
  let lowCount = 0
  for (const l of lows) {
    if (lowCount >= p.lowMax) break
    if (st.positions.some(x => x.code === l.code)) continue
    const bars = stocks[l.code].bars
    const b = bars.find(x => x.m >= p.lowEntryM)
    if (!b) continue
    const entry = b.o * (1 + slip)
    const qty = sizeOf(entry, entry * (1 - p.lowSlPct / 100), st.cash)
    if (qty < 100) continue
    const pos = open('low', l.code, l.name || '', entry, qty)
    pos.last = bars[bars.length - 1].c
    st.positions.push(pos)
    lowCount++
  }
  // 5. その日の終わりの資産
  st.start ||= date
  st.days.push(date)
  st.cash = Math.round(st.cash)
  const equity = Math.round(equityNow())
  st.history.push({ date, equity, cash: st.cash, positions: st.positions.length, trades: trades.length, pnl: trades.reduce((s, x) => s + x.pnl, 0) })
  return { state: st, trades, opened }
}

/** 練習口座の成績のまとめ（全体と、デイトレ・スイング・低位株の別） */
export function paperSummary(state, trades = []) {
  const p = state.params
  const last = state.history[state.history.length - 1]
  const by = {}
  for (const t of trades) {
    const g = (by[t.track] ||= { n: 0, win: 0, pnl: 0, sumPct: 0 })
    g.n++
    if (t.pnl > 0) g.win++
    g.pnl += t.pnl
    g.sumPct += t.pnlPct
  }
  let peak = p.capital
  let maxDd = 0
  for (const h of state.history) {
    peak = Math.max(peak, h.equity)
    maxDd = Math.min(maxDd, (h.equity / peak - 1) * 100)
  }
  return {
    start: state.start, days: state.days.length, capital: p.capital, equity: last?.equity ?? p.capital,
    return_pct: round(((last?.equity ?? p.capital) / p.capital - 1) * 100, 2), max_drawdown_pct: round(maxDd, 2),
    tracks: Object.fromEntries(Object.entries(by).map(([k, g]) => [k, { trades: g.n, win_rate_pct: round(g.win / g.n * 100, 0), pnl: g.pnl, avg_pct: round(g.sumPct / g.n, 2) }]))
  }
}

// 検証（本番の記録が少ないうちの目安）。場中は study_5m（2026-09〜11、20分遅れ込み、同じ時刻の全体比）、スイングは backtest（167銘柄 2017〜2026、R）
const MITE_REF = {
  day: {
    TAKE: '買い場（絞り込み後）：過去34日 4,310回で、大引けまで平均より+0.18%・勝率58%、翌日まで+0.28%。売り方は「場中の損切りの目安に逆指値、届かなければ大引けで売る（引成）」が一番バランスが良い（平均+0.12%、一番悪い回を−15%→−3.7%に抑える）。早く売ると上乗せが消える',
    RAW: '形は買い場だが条件外：過去34日では平均より+0.09%（絞り込み後の半分）',
    WAIT: '待つ：平均とほぼ同じ（+0.03%）',
    SKIP: '見送り：平均とほぼ同じか少し悪い（−0.02%）。急騰の追いかけ（前日比+8%以上）はその日の大引けまで−0.21%',
    LOW_STRONG_CLOSE: '低位株の強い引け（試し中）：15:00〜15:25に買い、翌日に利確+5%の指値と損切り−8%の逆指値、どちらも無ければ翌日13時に売る。1時間足3年で、ストップ高に張り付いて買えなかった日を除くと74回・平均+1.6%（前半+0.6%／後半+2.4%）・中央値+5.0%・勝率58%。低位株は値段の開きが大きく、手数料と開きを引くと上乗せはさらに小さい。株数は損切り−8%で /kau の損失上限に収める',
    RECLAIM_PM: '後場の VWAP 奪回：翌日まで持つと平均より+0.2%ほど',
    LOW: '低位株・荒い株：場中の買い場は使わない（場中の形はどれも効いていない、±0.1%）。夕方に買って翌日まで持つのも平均で不利（−0.44%）。使うのは「強い引け（前日比+20%以上・張り付きなし）」の目印だけ'
  }
}

/** 本番の記録（intraday_wide_stats の1組）を文章に */
function liveDay(stats, key) {
  const g = stats?.groups?.[key]
  if (!g?.n) return null
  const days = stats.days?.length || 0
  return `本番 ${days}日・${g.n}回：大引けまで平均より${g.sumExC / g.n >= 0 ? '+' : ''}${round(g.sumExC / g.n, 2)}%、翌日まで${g.sumExN / g.n >= 0 ? '+' : ''}${round(g.sumExN / g.n, 2)}%${days < 20 ? '（まだ日数が少ない）' : ''}`
}

/**
 * 今、場中の「買い場」や目印が出ている銘柄を、universe の全銘柄から探す（5分足は約15〜20分遅れ）。
 * 返り値: {date, time, scanned, take: [...], marks: [...]}。売買代金の大きい順
 */
export async function scanIntradayNow(list, { parallel = 8 } = {}) {
  const rows = []
  let errors = 0
  for (let i = 0; i < list.length; i += parallel) {
    await Promise.all(list.slice(i, i + parallel).map(async ({ code, name }) => {
      try {
        const [five, d] = await Promise.all([
          fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=5d&interval=5m`),
          fetchYahoo(`${code}.T`, '6mo')
        ])
        const days = splitFiveMin(five)
        const dates = Object.keys(days).sort()
        const today = dates[dates.length - 1]
        if (!today) return
        const daily = d.bars.filter(b => b.date < today)
        const v = intradayView(days[today], intradayContext(daily))
        if (!v) return
        const turnover = daily.slice(-20).reduce((sum, b) => sum + b.c * b.v, 0) / 20
        rows.push({ code, name, date: today, time: v.time, price: v.price, from_prev_pct: v.from_prev_pct, vwap: v.vwap, regime: v.regime, signal: v.signal, kind: v.kind, raw_take: v.raw_take, marks: v.marks, low_group: v.low_group, limit: v.limit, stop_intraday: v.stop_intraday, reasons: v.reasons, turnover: Math.round(turnover) })
      } catch {
        errors++
      }
    }))
  }
  const cnt = {}
  for (const r of rows) cnt[r.date] = (cnt[r.date] || 0) + 1
  const date = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  const use = rows.filter(r => r.date === date).sort((a, b) => b.turnover - a.turnover)
  return {
    source: 'Yahoo Finance の5分足（約15〜20分遅れ）', date, time: use[0]?.time || null, scanned: use.length, errors,
    take: use.filter(r => r.signal === 'TAKE'),
    marks: use.filter(r => r.marks?.length && r.signal !== 'TAKE'),
    counts: { TAKE: use.filter(r => r.signal === 'TAKE').length, WAIT: use.filter(r => r.signal === 'WAIT').length, SKIP: use.filter(r => r.signal === 'SKIP').length }
  }
}

/**
 * 1銘柄について、デイトレ（場中）・スイング（日足）・少し長期（業績・位置）の3つの判定と、その合図の成績、買う前チェックをまとめる。
 * opt: price（今の値段。本人の画面の値段）、state（/kau と同じ）、stats {intraday_wide_stats, cands_stats, backtest}
 */
export async function miteReport(code, { price = null, state = null, stats = {}, long = null } = {}) {
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  let bench = []
  try {
    bench = (await fetchYahoo('1306.T')).bars
  } catch {
    bench = []
  }
  const [d, intra, ne, dl, fin] = await Promise.all([
    fetchYahoo(`${code}.T`),
    fetchIntraday([code], { live: ok(price) ? { [code]: price } : {} }).then(r => r.stocks[0]).catch(e => ({ error: e.message })),
    fetchNextEarnings(code, today),
    fetchDilution(code, today),
    long ? Promise.resolve(null) : fetchFinance(code).catch(() => null)
  ])
  // Yahoo の日足は、その日の終値が埋まるのが遅いことがある。5分足に今日（か最新の日）があり、日足に無ければ、5分足から1本作って足す
  let dailyBars = d.bars
  let builtFromFive = false
  const lastDaily = dailyBars[dailyBars.length - 1]?.date
  if (intra && !intra.error && intra.date && (!lastDaily || intra.date > lastDaily) && intra.bars?.length) {
    const b = intra.bars
    dailyBars = [...dailyBars, { date: intra.date, o: ok(intra.open) ? intra.open : b[0][1], h: Math.max(intra.day_high ?? -Infinity, ...b.map(x => x[2])), l: Math.min(intra.day_low ?? Infinity, ...b.map(x => x[3])), c: ok(price) ? price : intra.price, v: b.reduce((sum, x) => sum + (x[5] || 0), 0) }]
    builtFromFive = true
  }
  const pk = analyze(dailyBars, bench, { symbol: `TSE:${code}`, name: d.name, currency: d.currency, benchmark: 'TSE:1306' })
  const px = ok(price) ? price : (ok(intra?.price) ? intra.price : pk.candle.close)

  // デイトレ
  let day = null
  if (intra && !intra.error) {
    const marks = intra.marks || []
    const key = intra.signal === 'TAKE' ? 'TAKE' : intra.raw_take ? 'RAW' : intra.signal
    const verdict = intra.signal === 'TAKE' ? '買い場' : intra.signal === 'SKIP' ? '見送り' : '待つ'
    day = {
      verdict, time: intra.time, date: intra.date, price: intra.price, regime: intra.regime, vwap: intra.vwap, reasons: intra.reasons,
      signal: intra.signal, kind: intra.kind, from_prev_pct: intra.from_prev_pct, daily_trend: intra.daily_trend,
      limit: intra.limit, stop: intra.stop_intraday, marks, low_group: intra.low_group,
      supports: intra.supports, resistances: intra.resistances,
      record: [MITE_REF.day[key], liveDay(stats.intraday_wide_stats, intra.signal === 'TAKE' ? 'TAKE' : intra.raw_take ? 'TAKE_RAW' : intra.signal),
        ...marks.map(m => MITE_REF.day[m]), ...marks.map(m => liveDay(stats.intraday_wide_stats, m)),
        intra.low_group ? MITE_REF.day.LOW : null].filter(Boolean),
      bars: intra.bars
    }
  } else day = { verdict: '確認できず', reasons: [intra?.error || '5分足を取れず'] }

  // スイング
  const bc = pk.buy_candidate
  const WHY = { NO_SETUP: '買いの形が出ていない', TREND_DOWN: '下降トレンド', HIGH_VOLATILITY: '値動きが荒い地合い', OVERHEAT: '高値づかみ危険度が高い', WEEKLY_DOWN: '週足が下向き', GAP_TOO_BIG: '窓が大きすぎる', LOW_SCORE: '買いスコアが基準未満' }
  const swingVerdict = bc.pass ? '買い候補' : bc.why_not === 'NO_SETUP' ? '待つ（形なし）' : '見送り'
  const KIND = { GAP: '窓あけ', PULLBACK: '押し目', BREAKOUT: '高値抜け', MOMENTUM: '勢い', NONE: '—' }
  const bt = stats.backtest
  const liveSwing = stats.cands_stats?.by_kind?.[`通過・${bc.kind}`]
  const swing = {
    verdict: swingVerdict, kind: KIND[bc.kind] || bc.kind, why_not: bc.pass ? null : (WHY[bc.why_not] || bc.why_not),
    date: pk.date_jst, built_from_five: builtFromFive, close: pk.candle.close, buy_below: bc.pass ? tick(pk.candle.close * 1.02) : null,
    stop: bc.stop, target: bc.target, hold_days: bc.hold_days, exit_rule: bc.exit_rule,
    regime: pk.regime, score: pk.scores.long, overheat: pk.overheat.score, dev25: pk.trend.dev_fast_pct, htf: pk.trend.htf_bias,
    record: [
      bt?.by_kind?.[bc.kind] ? `検証（${bt.codes}銘柄・${bt.period}）：${KIND[bc.kind]}は ${bt.by_kind[bc.kind].closed}回で平均${bt.by_kind[bc.kind].avg_r}R・勝率${bt.by_kind[bc.kind].win_rate_pct}%（損切り幅の3倍が目標なので勝率は低め）` : null,
      bt?.any_day ? `比べる相手：どの日に買っても平均${bt.any_day.avg_r}R。合図の上乗せは小さい` : null,
      liveSwing?.count ? `本番（約1,150銘柄の毎晩の記録）：${liveSwing.count}回決着、平均${liveSwing.avg_r}R・勝率${liveSwing.win_rate_pct}%` : '本番の記録：まだ決着した回がない'
    ].filter(Boolean)
  }

  // 少し長期：業績（株探）と位置。検証（2025-11〜2026-11 の決算3,418回）では、業績の伸びで「買い時」は決まらなかったので、判定は出さず参考として示す
  let fundamentals = long
  if (!fundamentals && fin) {
    const m = earningsMomentum(fin.quarterly)
    const act = fin.annual.filter(a => !a.forecast)
    const fc = fin.annual.find(a => a.forecast)
    const lastA = act[act.length - 1]
    const grow = (a, b) => (ok(a) && ok(b) && b > 0 ? round((a / b - 1) * 100, 1) : null)
    let note = '業績の伸びと、その後60日の値動きには、はっきりした関係が見つかっていない（1年分の検証）'
    if (m && ok(m.op_yoy_pct) && m.op_yoy_pct >= 20 && ok(m.sales_yoy_pct) && m.sales_yoy_pct >= 10) note = '業績は強い。ただし検証では、強い決算のあと60日は平均より−3.8%（906回・前半後半とも悪い）。好業績は株価に織り込まれていることが多い'
    else if (m && !ok(m.op_yoy_pct) && ok(m.op) && m.op > 0) note = '前年は赤字で今は黒字（立ち直り）。検証では60日後に平均より+4%（459回）だが、後半の期間は±0で安定していない'
    fundamentals = {
      quarter: m ? { period: m.period, date: m.date, op_yoy_pct: m.op_yoy_pct, sales_yoy_pct: m.sales_yoy_pct, margin: m.margin, margin_prev: m.margin_prev, streak: m.streak } : null,
      forecast: fc && lastA ? { period: fc.period, op: fc.op, op_growth_pct: grow(fc.op, lastA.op), sales_growth_pct: grow(fc.sales, lastA.sales), date: fc.date } : null,
      note
    }
  }
  // 上場して1年たっていない株は、52週の高安と200日線が計算できないので、上場来の高安を使い、200日線は「確認できず」にする
  const shortHistory = dailyBars.length < 252
  const hiAll = Math.max(...dailyBars.map(b => b.h))
  const loAll = Math.min(...dailyBars.map(b => b.l))
  const lg = {
    short_history: shortHistory, since: shortHistory ? dailyBars[0].date : null,
    from_52w_high_pct: shortHistory ? round((pk.candle.close / hiAll - 1) * 100) : pk.range_52w.from_high_pct,
    from_52w_low_pct: shortHistory ? round((pk.candle.close / loAll - 1) * 100) : pk.range_52w.from_low_pct,
    ma200: ok(pk.trend.ma_slow) ? tick(pk.trend.ma_slow) : null, above_ma200: ok(pk.trend.ma_slow) ? pk.candle.close > pk.trend.ma_slow : null, ma200_slope: ok(pk.trend.ma_slow) ? pk.trend.slow_slope : null,
    weekly: pk.trend.htf_bias, next_earnings: ne?.date || null, earnings_estimated: !!ne?.estimated,
    dilution: dl, fundamentals: fundamentals || null,
    verdict: long?.verdict || '参考のみ（業績で買い時は決まらなかった）'
  }

  // 買う前チェック
  let kau = null
  if (state) {
    const correlations = []
    for (const pos of state.positions || []) {
      if (!pos.code || pos.code === code) continue
      try {
        correlations.push({ code: pos.code, name: pos.name, corr: returnCorrelation(dailyBars, (await fetchYahoo(`${pos.code}.T`)).bars) })
      } catch {
        correlations.push({ code: pos.code, name: pos.name, corr: null })
      }
    }
    kau = preTradeCheck({ code, price: px, atr: pk.volatility.atr, regime: pk.regime, overheat: pk.overheat.score, today, earningsDate: ne?.date || null, earningsEstimated: ne?.estimated, dilution: dl, settings: state.settings, positions: state.positions, buysToday: state.buysToday, correlations })
  }
  const pc = v => (ok(v) ? `${v > 0 ? '+' : ''}${v}%` : '—')
  const fq = lg.fundamentals?.quarter
  const ff = lg.fundamentals?.forecast
  // 記録帳の mite に入れる形（name は日本語の銘柄名に置き換えて使う）
  const ledger = {
    code, date: today, price: px, live_price: ok(price),
    day_verdict: day.verdict, day_reason: (day.reasons || [])[0] || null,
    swing_verdict: swing.verdict, swing_kind: swing.kind, swing_why: swing.why_not ? `理由：${swing.why_not}` : null,
    swing_buy_below: swing.buy_below, swing_stop: swing.stop, swing_target: swing.target,
    long_verdict: '参考のみ',
    long_quarter: fq ? `直近の四半期（${fq.period}）：営業益 前年比${ok(fq.op_yoy_pct) ? pc(fq.op_yoy_pct) : '（前年が赤字）'}・売上 ${pc(fq.sales_yoy_pct)}` : null,
    long_forecast: ff ? `会社予想（${ff.period}）：営業益 ${pc(ff.op_growth_pct)}・売上 ${pc(ff.sales_growth_pct)}` : null,
    long_position: lg.short_history ? `上場来の高値から${pc(lg.from_52w_high_pct)}（${lg.since} 上場）` : `52週高値から${pc(lg.from_52w_high_pct)}・200日線の${lg.above_ma200 ? '上' : '下'}`,
    long_caution: lg.dilution && (lg.dilution.has_ms_1y || lg.dilution.third_party_1y?.length) ? '注意：株が増える資金調達あり' : null,
    kau_ok: kau ? kau.ok : null, kau_blocks: kau ? kau.blocks : [],
    kau_summary: kau && kau.ok ? (kau.shares_100_unit ? `${kau.shares_100_unit}株（${kau.cost_jpy.toLocaleString('ja-JP')}円）・損切り ${kau.stop}円・損失 約${kau.loss_if_stopped_jpy.toLocaleString('ja-JP')}円` : `100株は${kau.limited_by}を超える（かぶミニなら${kau.mini_shares_max}株）`) : null
  }
  return { code, name: d.name, price: px, live_price: ok(price), today, day, swing, long: lg, kau, ledger }
}

/**
 * 場中の判定（intraday コレクションの1件）の答え合わせ。判定したときの値段から、その日の大引けまでと翌営業日の大引けまでの騰落。
 * days: splitFiveMin の結果。翌営業日の足があれば final: true
 */
export function intradayOutcome(rec, days) {
  const dates = Object.keys(days || {}).sort()
  const i = dates.indexOf(rec.date)
  if (i < 0 || !ok(rec.price) || rec.price <= 0) return null
  const day = days[rec.date]
  const close = day[day.length - 1].c
  const out = { rClose: round((close / rec.price - 1) * 100, 2), final: false }
  if (i + 1 < dates.length) {
    const nd = days[dates[i + 1]]
    out.rNext = round((nd[nd.length - 1].c / rec.price - 1) * 100, 2)
    out.final = true
  }
  return out
}

/** 答えが出た判定を、合図（TAKE・WAIT・SKIP）ごとの成績に足す */
export function mergeIntradayStats(prev, done) {
  const st = prev ? JSON.parse(JSON.stringify(prev)) : {}
  for (const r of done) {
    if (!ok(r.rClose)) continue
    const k = r.signal || 'WAIT'
    const c = (st[k] ||= { n: 0, sumClose: 0, sumNext: 0, nNext: 0, winClose: 0 })
    c.n++
    c.sumClose += r.rClose
    if (r.rClose > 0) c.winClose++
    if (ok(r.rNext)) {
      c.sumNext += r.rNext
      c.nNext++
    }
  }
  return st
}

/** intraday コレクションのまだ final でない判定に答えを付ける。{updates, stats} */
export async function intradayResult(records, prevStats = null) {
  const updates = []
  const byCode = new Map()
  for (const r of records) if (!r.final) (byCode.get(r.code) || byCode.set(r.code, []).get(r.code)).push(r)
  for (const [code, recs] of byCode) {
    let days = {}
    try {
      days = splitFiveMin(await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=5d&interval=5m`))
    } catch {
      continue
    }
    for (const r of recs) {
      const o = intradayOutcome(r, days)
      if (o) updates.push({ id: r.id, ...o })
    }
  }
  const done = updates.filter(u => u.final).map(u => ({ ...records.find(r => r.id === u.id), ...u }))
  return { updates, stats: mergeIntradayStats(prevStats, done) }
}

/**
 * 買う前チェック。決めたルールに照らして、買ってよい株数と、止める理由・注意を出す。
 * 止める理由（blocks）が1つでもあれば ok は false。
 * @param {object} a code, price（買う値段）, atr（1日の値幅の目安・円）, regime, overheat, today（YYYY-MM-DD）, earningsDate,
 *   settings {capital, cash, riskPct, maxPosPct, maxPositions, maxOpenRiskMult（あれば銘柄数の代わりに損の合計で上限）, dayTradeMax},
 *   positions [{code, name, entry, last, qty, stop, style}]（保有中。style が day は持ち越さないので上限に数えない）, buysToday（今日すでに買った回数）
 */
export function preTradeCheck(a) {
  const st = a.settings || {}
  const blocks = []
  const warnings = []
  const price = a.price
  const stop = ok(a.atr) && ok(price) ? tick(Math.max(1, price - 2 * a.atr)) : null
  const riskPerShare = ok(stop) ? price - stop : null
  const lossLimit = ok(st.capital) && ok(st.riskPct) ? Math.floor(st.capital * st.riskPct / 100) : null
  const posLimit = ok(st.capital) && ok(st.maxPosPct) ? Math.floor(st.capital * st.maxPosPct / 100) : null
  const caps = []
  if (ok(lossLimit) && riskPerShare > 0) caps.push(['損失の上限', Math.floor(lossLimit / riskPerShare)])
  if (ok(posLimit) && price > 0) caps.push(['1銘柄の上限', Math.floor(posLimit / price)])
  if (ok(st.cash) && price > 0) caps.push(['現金', Math.floor(st.cash / price)])
  caps.sort((x, y) => x[1] - y[1])

  const held = (a.positions || []).find(x => x.code === a.code)
  if (held) {
    const cur = ok(held.last) ? held.last : price
    if (ok(held.entry) && cur < held.entry) blocks.push(`買い増し禁止：${held.name || a.code} はすでに ${held.qty}株 持っていて、含み損（買値 ${held.entry}円 → 今 ${cur}円）。下がっている株は買い足さない`)
    else warnings.push(`${held.name || a.code} はすでに ${held.qty}株 持っている。買い足すと1銘柄の上限を超えないか確認`)
    if (ok(posLimit) && ok(held.qty) && cur * held.qty >= posLimit) blocks.push(`1銘柄の上限：すでに ${Math.round(cur * held.qty).toLocaleString('ja-JP')}円 分を持っていて、上限 ${posLimit.toLocaleString('ja-JP')}円 に達している`)
  }
  if (ok(a.buysToday) && ok(st.dayTradeMax) && a.buysToday >= st.dayTradeMax) blocks.push(`1日の回数の上限：今日はすでに ${a.buysToday}回 買っている（上限 ${st.dayTradeMax}回）。今日は終わり`)
  // 持ち越す保有の数・損の合計（デイトレ＝style が day の保有は、その日のうちに売るので数えない）
  const carry = (a.positions || []).filter(x => x.style !== 'day')
  if (ok(st.maxOpenRiskMult) && ok(lossLimit)) {
    // 銘柄数ではなく「持っている株が全部損切りに当たったときの損の合計」で上限を決める（2026-11-19 本人と決定）
    const openRisk = carry.reduce((sum, x) => {
      const cur = ok(x.last) ? x.last : x.entry
      if (!ok(x.stop) || !ok(cur) || !ok(x.qty)) return sum + lossLimit // 損切りが無い保有は、上限いっぱいの損とみる
      return sum + Math.max(0, cur - x.stop) * x.qty
    }, 0)
    const budget = lossLimit * st.maxOpenRiskMult
    const room = Math.max(0, budget - openRisk)
    if (riskPerShare > 0) {
      caps.push(['損の合計の上限', Math.floor(room / riskPerShare)])
      caps.sort((x, y) => x[1] - y[1])
    }
    a.openRisk = { open: Math.round(openRisk), budget, room: Math.round(room) }
  } else if (!held && ok(st.maxPositions) && carry.length >= st.maxPositions) blocks.push(`銘柄数の上限：すでに ${carry.length}銘柄 持っている（上限 ${st.maxPositions}。デイトレの保有は数えない）`)
  const maxShares2 = caps.length ? caps[0][1] : null
  const lots2 = ok(maxShares2) ? Math.floor(maxShares2 / 100) * 100 : null
  if (ok(maxShares2) && maxShares2 < 1) blocks.push(caps[0][0] === '損の合計の上限' ? `損の合計の上限：持っている株が全部損切りに当たると約${a.openRisk.open.toLocaleString('ja-JP')}円の損で、上限 ${a.openRisk.budget.toLocaleString('ja-JP')}円（1回の損の上限×${st.maxOpenRiskMult}）に残りがない` : `買える株数が0：${caps[0][0]}が足りない`)
  else if (lots2 === 0) warnings.push(`100株では${caps[0][0]}を超える。1株単位（かぶミニ）なら ${maxShares2}株 まで`)

  for (const c of a.correlations || []) {
    if (!ok(c.corr) || c.code === a.code) continue
    if (c.corr >= 0.7) warnings.push(`一緒に動きすぎ：保有中の ${c.name || c.code} と値動きの相関が ${c.corr}（直近60日）。実質的に同じ株を買い増すのに近く、悪い日は両方同時に損切りになりやすい`)
    else if (c.corr >= 0.5) warnings.push(`やや一緒に動く：保有中の ${c.name || c.code} との相関 ${c.corr}（直近60日）`)
  }
  const atrPct = ok(a.atr) && price > 0 ? round(a.atr / price * 100, 1) : null
  if (ok(atrPct) && atrPct >= 8) warnings.push(`値動きがとても荒い：1日に約${atrPct}%動く株。損切りが遠くなり、買える株数が少なくなる`)
  if (ok(price) && price < 100) warnings.push('株価100円未満：1円の動きが1%以上になる')
  if (a.regime === 'TREND_DOWN') warnings.push('下降トレンド中（ルールでは新しく買わない地合い）')
  if (a.regime === 'HIGH_VOLATILITY') warnings.push('値動きが荒い地合い（ルールでは新しく買わない地合い）')
  if (ok(a.overheat) && a.overheat >= 60) warnings.push(`高値づかみ危険度が${a.overheat}（60以上は見送りの基準）`)
  if (a.earningsDate && a.today) {
    const n = businessDaysBetween(a.today, a.earningsDate)
    const est = a.earningsEstimated ? '（去年の発表日からの見込み）' : ''
    if (n >= 0 && n <= 3) blocks.push(`決算前：決算発表予定日が ${a.earningsDate}${est}（${n === 0 ? '今日' : n + '営業日後'}）。決算の3営業日前から当日までは新しく買わない`)
    else if (a.earningsEstimated && n > 3 && n <= 8) warnings.push(`決算が近いかもしれない：見込みは ${a.earningsDate}（${n}営業日後）。正式な日付を確認を`)
  } else if (!a.earningsDate) warnings.push('決算発表予定日は確認できず。自分で確認を')
  const dl = a.dilution
  if (dl && (dl.has_ms_1y || dl.third_party_1y?.length)) {
    if (dl.recent_heavy?.length || dl.recent_done?.length) {
      const ev = [...(dl.recent_heavy || []).map(d => `${d} 大量行使`), ...(dl.recent_done || []).map(d => `${d} 行使完了`)].join('、')
      warnings.push(`株が増える資金調達（強い注意）：直近30日に新株予約権の行使が出ている（${ev}）。上がったところで新しい株が市場に売られた形で、急騰のあとはそのまま崩れやすい`)
    } else if (dl.active) warnings.push(`株が増える資金調達：行使価額修正条項付の新株予約権（MSワラント）などが残っている（最新 ${dl.latest?.date}）。株価が上がるほど新しい株が売られ、上値が重くなりやすい`)
    else if (dl.has_ms_1y) warnings.push(`株が増える資金調達：直近1年に MSワラントなどの開示あり（最新 ${dl.latest?.date}、行使は完了）。また出す会社か確認を`)
    if (dl.third_party_1y?.length) warnings.push(`第三者割当の新株発行：直近1年に ${dl.third_party_1y.join('、')}`)
    if (dl.series_5y >= 2) warnings.push(`MSワラントなどを5年で ${dl.series_5y}回 出している会社。資金が足りなくなるたびに株を増やす傾向`)
  } else if (dl === null) warnings.push('株が増える資金調達（MSワラント等）は確認できず')

  const shares = lots2 || 0
  return {
    ok: blocks.length === 0,
    blocks,
    warnings,
    price,
    stop,
    stop_basis: '買う値段 − 1日の値幅の目安（ATR）× 2',
    loss_limit_jpy: lossLimit,
    position_limit_jpy: posLimit,
    limited_by: caps.length ? caps[0][0] : null,
    open_risk: a.openRisk || null,
    shares_100_unit: shares,
    cost_jpy: shares ? Math.round(shares * price) : 0,
    loss_if_stopped_jpy: shares && riskPerShare ? Math.round(shares * riskPerShare) : 0,
    mini_shares_max: ok(maxShares2) ? Math.max(0, maxShares2) : null,
    target_3r: ok(riskPerShare) ? tick(price + 3 * riskPerShare) : null,
    daily_range_pct: atrPct,
    correlations: (a.correlations || []).filter(c => c.code !== a.code),
    earnings_date: a.earningsDate || null,
    earnings_estimated: !!a.earningsEstimated,
    dilution: a.dilution ?? null
  }
}

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
  if (args.includes('--next-earnings')) {
    const codes = args.filter(a => isTseCode(a.toUpperCase())).map(a => a.toUpperCase())
    const out = []
    for (const c of codes) {
      out.push({ code: c, ...(await fetchNextEarnings(c)) })
      await sleep(300)
    }
    console.log(JSON.stringify(out, null, 2))
    return
  }
  if (args.includes('--matsui')) {
    const kind = args[args.indexOf('--matsui') + 1]
    console.log(JSON.stringify(await fetchMatsuiRanking(kind && !kind.startsWith('--') ? kind : undefined), null, 2))
    return
  }
  if (args.includes('--tdnet')) {
    const rest = args.slice(args.indexOf('--tdnet') + 1).filter(a => !a.startsWith('--'))
    const date = rest.find(a => /^\d{8}$/.test(a))
    const codes = rest.filter(a => isTseCode(a.toUpperCase())).map(a => a.toUpperCase())
    console.log(JSON.stringify(await fetchTdnet(date, { codes }), null, 2))
    return
  }
  if (args.includes('--scan-wide')) {
    const file = args[args.indexOf('--scan-wide') + 1]
    console.log(JSON.stringify(await scanCandidates(JSON.parse(readFileSync(file, 'utf-8'))), null, 2))
    return
  }
  if (args.includes('--signals-report')) {
    const file = args[args.indexOf('--signals-report') + 1]
    console.log(JSON.stringify(signalsReport(JSON.parse(readFileSync(file, 'utf-8'))), null, 2))
    return
  }
  if (args.includes('--considered-result')) {
    const file = args[args.indexOf('--considered-result') + 1]
    const si = args.indexOf('--stats')
    let prev = null
    if (si >= 0) {
      try {
        prev = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
      } catch {
        prev = null
      }
    }
    console.log(JSON.stringify(await consideredResult(JSON.parse(readFileSync(file, 'utf-8')), prev), null, 2))
    return
  }
  if (args.includes('--kessan-result')) {
    const file = args[args.indexOf('--kessan-result') + 1]
    const si = args.indexOf('--stats')
    let prev = null
    if (si >= 0) {
      try {
        prev = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
      } catch {
        prev = null
      }
    }
    console.log(JSON.stringify(await kessanResult(JSON.parse(readFileSync(file, 'utf-8')), prev), null, 2))
    return
  }
  if (args.includes('--kessan-react')) {
    const d = args[args.indexOf('--kessan-react') + 1]
    console.log(JSON.stringify(await fetchKessanReact(/^\d{8}$/.test(d || '') ? d : undefined), null, 2))
    return
  }
  if (args.includes('--kessan')) {
    const d = args[args.indexOf('--kessan') + 1]
    console.log(JSON.stringify(await fetchKessan(/^\d{8}$/.test(d || '') ? d : undefined), null, 2))
    return
  }
  if (args.includes('--intraday-result')) {
    const file = args[args.indexOf('--intraday-result') + 1]
    const si = args.indexOf('--stats')
    let prev = null
    if (si >= 0) {
      try {
        prev = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
      } catch {
        prev = null
      }
    }
    console.log(JSON.stringify(await intradayResult(JSON.parse(readFileSync(file, 'utf-8')), prev), null, 2))
    return
  }
  if (args.includes('--scan-now')) {
    const list = JSON.parse(readFileSync(args[args.indexOf('--scan-now') + 1], 'utf-8'))
    console.log(JSON.stringify(await scanIntradayNow(list), null, 2))
    return
  }
  if (args.includes('--mite')) {
    const [code, p] = String(args[args.indexOf('--mite') + 1] || '').toUpperCase().split(':')
    if (!isTseCode(code)) {
      console.error('使い方: node .claude/scripts/kabu-lens.mjs --mite <コード>[:今の値段] [--state 状態.json] [--stats-dir フォルダ] [--long 業績.json]')
      process.exit(1)
    }
    const read = (f) => {
      try {
        return JSON.parse(readFileSync(f, 'utf-8'))
      } catch {
        return null
      }
    }
    const si = args.indexOf('--state')
    const di = args.indexOf('--stats-dir')
    const li = args.indexOf('--long')
    const dir = di >= 0 ? args[di + 1] : null
    const stats = dir ? Object.fromEntries(['intraday_wide_stats', 'cands_stats', 'backtest'].map(k => [k, read(`${dir}/${k}.json`)])) : {}
    const r = await miteReport(code, { price: Number(p) > 0 ? Number(p) : null, state: si >= 0 ? read(args[si + 1]) : null, stats, long: li >= 0 ? read(args[li + 1]) : null })
    console.log(JSON.stringify(r, null, 2))
    return
  }
  if (args.includes('--intraday-wide')) {
    const i = args.indexOf('--intraday-wide')
    const list = JSON.parse(readFileSync(args[i + 1], 'utf-8'))
    const d = /^\d{4}-\d{2}-\d{2}$/.test(args[i + 2] || '') ? args[i + 2] : null
    const si = args.indexOf('--stats')
    let prev = null
    if (si >= 0) {
      try {
        prev = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
      } catch {
        prev = null
      }
    }
    const fo = args.indexOf('--five-out')
    const pi = args.indexOf('--paper')
    const day = await fetchIntradayWide(list, { date: d, keepLatest: fo >= 0, paper: pi >= 0 })
    // 練習口座：--paper 状態.json（無ければ新しく始める）--paper-cands 買い候補.json（cands の pass。配列）--paper-out 結果.json
    let paper = null
    if (pi >= 0 && day.paper) {
      let ps = null
      try {
        ps = JSON.parse(readFileSync(args[pi + 1], 'utf-8'))
      } catch {
        ps = null
      }
      if (!ps?.params) ps = paperNew()
      let cands = []
      const ci = args.indexOf('--paper-cands')
      if (ci >= 0) {
        try {
          cands = JSON.parse(readFileSync(args[ci + 1], 'utf-8'))
        } catch {
          cands = []
        }
      }
      const r = paperStep(ps, { date: day.paper.date, stocks: day.paper.stocks, cands: Array.isArray(cands) ? cands : [] })
      paper = { date: day.paper.date, skipped: !!r.skipped, trades: r.trades, opened: r.opened, summary: paperSummary(r.state, r.trades), equity: r.state.history[r.state.history.length - 1] || null }
      const po = args.indexOf('--paper-out')
      if (po >= 0) writeFileSync(args[po + 1], JSON.stringify(r.state))
      paper.state_file = po >= 0 ? args[po + 1] : null
    }
    delete day.paper
    let five = null
    if (fo >= 0 && day.latest) {
      // その日の5分足を保存（{date, bars: {code: [[分, 始, 高, 安, 終, 出来高], ...]}}。分は 9:00=540）
      writeFileSync(args[fo + 1], JSON.stringify(day.latest))
      five = { date: day.latest.date, stocks: Object.keys(day.latest.bars).length, file: args[fo + 1] }
    }
    delete day.latest
    console.log(JSON.stringify({ day, stats: day.date && day.stocks > 0 ? mergeIntradayWide(prev, day) : prev, five, paper }, null, 2))
    return
  }
  if (args.includes('--intraday-replay')) {
    const i = args.indexOf('--intraday-replay')
    const code = String(args[i + 1] || '').toUpperCase()
    const date = args[i + 2]
    const [five, d] = await Promise.all([
      fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.T?range=1mo&interval=5m`),
      fetchYahoo(`${code}.T`, '6mo')
    ])
    const days = splitFiveMin(five)
    if (!days[date]) {
      console.error(`${date} の5分足がありません（Yahoo は直近60日まで）`)
      process.exit(1)
    }
    const r = intradayReplay(days[date].map(b => ({ ...b })), intradayContext(d.bars.filter(b => b.date < date)))
    console.log(JSON.stringify({ code, name: d.name, date, ...r, bars: days[date].map(b => [b.m, b.o, b.h, b.l, b.c, b.v]) }, null, 2))
    return
  }
  if (args.includes('--intraday')) {
    // 「コード」か「コード:今の値段」（例 4888:452）。今の値段は本人が楽天の画面で見たもの
    const items = args.slice(args.indexOf('--intraday') + 1).filter(a => !a.startsWith('--')).map(a => a.toUpperCase().split(':'))
    const codes = [...new Set(items.map(([c]) => c).filter(isTseCode))]
    const live = Object.fromEntries(items.filter(([c, p]) => isTseCode(c) && Number(p) > 0).map(([c, p]) => [c, Number(p)]))
    if (!codes.length) {
      console.error('使い方: node .claude/scripts/kabu-lens.mjs --intraday <銘柄コード> [...]')
      process.exit(1)
    }
    console.log(JSON.stringify(await fetchIntraday(codes, { live }), null, 2))
    return
  }
  if (args.includes('--check')) {
    const ci = args.indexOf('--check')
    const code = String(args[ci + 1] || '').toUpperCase()
    const price = Number(args[ci + 2])
    const si = args.indexOf('--state')
    if (!isTseCode(code) || !(price > 0) || si < 0) {
      console.error('使い方: node .claude/scripts/kabu-lens.mjs --check <銘柄コード> <買う値段> --state <状態.json>\n  状態.json: {"settings": {...}, "positions": [{"code","name","entry","last","qty"}], "buysToday": 0}')
      process.exit(1)
    }
    const state = JSON.parse(readFileSync(args[si + 1], 'utf-8'))
    let bench = []
    try {
      bench = (await fetchYahoo('1306.T')).bars
    } catch {
      bench = []
    }
    const d = await fetchYahoo(`${code}.T`)
    const pk = analyze(d.bars, bench, { symbol: `TSE:${code}`, name: d.name, currency: d.currency, benchmark: 'TSE:1306' })
    const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
    const [ne, dilution] = await Promise.all([fetchNextEarnings(code, today), fetchDilution(code, today)])
    const correlations = []
    for (const pos of state.positions || []) {
      if (!pos.code || pos.code === code) continue
      try {
        correlations.push({ code: pos.code, name: pos.name, corr: returnCorrelation(d.bars, (await fetchYahoo(`${pos.code}.T`)).bars) })
      } catch {
        correlations.push({ code: pos.code, name: pos.name, corr: null })
      }
    }
    const res = preTradeCheck({ code, price, atr: pk.volatility.atr, regime: pk.regime, overheat: pk.overheat.score, today, earningsDate: ne?.date || null, earningsEstimated: ne?.estimated, dilution, settings: state.settings, positions: state.positions, buysToday: state.buysToday, correlations })
    console.log(JSON.stringify({ code, name: d.name, as_of: pk.date_jst, last_close: pk.candle.close, regime: pk.regime, score: pk.scores.long, overheat: pk.overheat.score, buy_candidate: pk.buy_candidate, ...res, earnings_source: ne?.source || null }, null, 2))
    return
  }
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
    let daytrade = null
    try {
      const mr = await fetchMatsuiRanking('day-trading-morning')
      daytrade = { as_of: mr.as_of, note: '松井証券のデイトレ適性ランキング（売買代金が大きく、1日の値動きも大きい株）。売り買いしやすさの目安で、上がりやすさではない', rows: mr.rows.slice(0, 20) }
      const set = new Set(mr.rows.map(x => x.code))
      for (const s of [...up.stocks, ...dn.stocks]) s.in_daytrade_ranking = set.has(s.code)
    } catch (e) {
      daytrade = { error: e.message }
    }
    console.log(JSON.stringify({
      nikkei_change_pct: nikkei,
      daytrade,
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
  const codes = [...new Set(sigs.map(sg => String(sg.code || '').toUpperCase()).filter(isTseCode))]
  for (let k = 0; k < codes.length; k += 8) {
    await Promise.all(codes.slice(k, k + 8).map(async (c) => {
      try {
        cache.set(c, (await fetchYahoo(`${c}.T`)).bars)
      } catch {
        /* あとで1件ずつ取り直す */
      }
    }))
  }
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
