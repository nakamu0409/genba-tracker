import { describe, expect, it } from 'vitest'
// @ts-expect-error 型定義のない .mjs スクリプト
import { isOrderTitle, parseOrderPdf, orderSizeNote, isMonthlyOrderTitle, parseBunbaiPage, expectCheck, orderPlan, swingEntryVariants, eventExitVariants, liveStudyDay, mergeLiveStudy, below200, parseBuybackPdf, drawdownStop, nikkeiFutBrief, pickYutaiEnd, isPreHoliday, nextTradingDate, crashSignal, worldBrief, parseTanshin, cashNow, surgePullback, archiveMerge, lowExit, marksOutcomes, mergeMarks, nextDayOutcome, mergeNextDay, parseKabutanFinance, splitFiveMin, paperNew, paperStep, pickSwingToSell, keepEventRow, paperSummary, paperInputOf, paperInputFromFive, paperReplay, isBuybackTitle, tickFloor, pickBuybacks, buybackScore, pickEvents, isDividendUpTitle, isSplitTitle, earningsMomentum, intradayWideDay, mergeIntradayWide, intradayReplay, intradayView, intradayContext, intradayOutcome, mergeIntradayStats, parseDilution, summarizeDilution, afternoonResult, returnCorrelation, candidateRow, signalsReport, consideredOutcome, mergeConsideredStats, summarizeConsideredStats, estimateNextEarnings, parseIrbankHistory, parseMatsuiRanking, parseTdnetList, tagTdnet, kessanOutcome, mergeKessanStats, summarizeKessanStats, classifyKessan, parseKabutanKessanList, businessDaysBetween, parseKabutanEarningsDate, preTradeCheck, analyze, atr, backtest, chaseFeatures, chaseRisk, dipRisk, mergeMoverStats, parseKabutanNews, summarizeMoverStats, ema, evaluateSignal, isTseCode, parseKabutanMovers, parseKabutanRanking, parseKabutanStock, parseYahoo, parseYahooNow, percentRank, rma, rsi, sma, summarize } from '../../.claude/scripts/kabu-lens.mjs'

type Bar = { date: string, o: number, h: number, l: number, c: number, v: number }

// 平日だけの日付を start から n 本ぶん作る
function dates(n: number, start = '2024-01-01'): string[] {
  const out: string[] = []
  const d = new Date(start + 'T00:00:00Z')
  while (out.length < n) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

// 終値の並びから日足を作る（始値は前日終値、高値・安値は上下に spread ずつ）
function barsFrom(closes: number[], spread = 5, v = 1000): Bar[] {
  const ds = dates(closes.length)
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1]!
    return { date: ds[i]!, o, h: Math.max(o, c) + spread, l: Math.min(o, c) - spread, c, v }
  })
}

describe('指標の計算', () => {
  it('sma は len 本そろうまで null、そろったら平均', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('ema は最初の len 本の平均から始まる', () => {
    // 種 = (1+2+3)/3 = 2、次 = 0.5*4 + 0.5*2 = 3、次 = 0.5*5 + 0.5*3 = 4
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4])
  })

  it('rma は 1/len の重みで平滑する', () => {
    // 種 = (3+3)/2 = 3、次 = 0.5*9 + 0.5*3 = 6
    expect(rma([3, 3, 9], 2)).toEqual([null, 3, 6])
  })

  it('先頭に null があっても、その後ろから計算する', () => {
    expect(ema([null, null, 1, 2, 3, 4], 3)).toEqual([null, null, null, null, 2, 3])
  })

  it('rsi は上げ続ければ 100、下げ続ければ 0、上げ下げ同じ幅なら 50', () => {
    const up = rsi([1, 2, 3, 4, 5, 6], 3)
    expect(up[5]).toBe(100)
    const down = rsi([6, 5, 4, 3, 2, 1], 3)
    expect(down[5]).toBe(0)
    const flat = rsi([10, 11, 10, 11, 10], 4)
    expect(flat[4]).toBeCloseTo(50)
  })

  it('atr は値幅が一定ならその値幅になる', () => {
    const bars = barsFrom(new Array(10).fill(100), 5)
    expect(atr(bars, 3)[9]).toBeCloseTo(10)
  })

  it('percentRank は直前 len 本のうち今の値以下の割合', () => {
    // 直前4本 [1,2,3,4] のうち 3 以下は3本 → 75%
    expect(percentRank([1, 2, 3, 4, 3], 4)[4]).toBe(75)
    expect(percentRank([1, 2, 3, 4, 3], 4)[3]).toBeNull()
  })
})

describe('analyze', () => {
  it('一直線に上げ続ける銘柄は、スコアが高くても過熱で買いを止める', () => {
    // 毎日 +1.5% で300日。25日線から大きく離れ、RSI も連騰も最大になる
    const closes = Array.from({ length: 300 }, (_, i) => 1000 * 1.015 ** i)
    const p = analyze(barsFrom(closes, 1), [], { symbol: 'TSE:9999' })
    expect(p.schema).toBe('kabu-lens/v1')
    expect(p.trend.stack).toBe('BULLISH')
    expect(p.overheat.factors.rsi).toBe(20)
    expect(p.overheat.factors.streak).toBe(10)
    expect(p.overheat.factors.run_up).toBe(15)
    expect(p.overheat.score).toBeGreaterThanOrEqual(60)
    expect(p.overheat.level).toBe('HIGH')
    // 過熱し続けているので、一度も買いシグナルが出ていない
    expect(p.trade.side).toBe('NONE')
    expect(p.scores.long).toBe(Object.values(p.scores.factors as Record<string, number>).reduce((a, b) => a + b, 0))
    expect(p.overheat.score).toBe(Object.values(p.overheat.factors as Record<string, number>).reduce((a, b) => a + b, 0))
  })

  it('下げ続ける銘柄は下降トレンドで、買いシグナルを出さない', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 3000 * 0.995 ** i)
    const p = analyze(barsFrom(closes, 1), [], { symbol: 'TSE:9999' })
    expect(p.regime).toBe('TREND_DOWN')
    expect(p.trend.stack).toBe('BEARISH')
    expect(p.trade.side).toBe('NONE')
    expect(p.scores.factors.trend).toBe(0)
  })

  it('指数より強ければ相対強度が満点、指数データが無ければ中立の10点', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 1000 + i * 3)
    const bars = barsFrom(closes, 1)
    const bench = bars.map(b => ({ date: b.date, c: 100 }))
    const strong = analyze(bars, bench, { symbol: 'TSE:9999', benchmark: 'TSE:1306' })
    expect(strong.relative_strength.bench_return_pct).toBe(0)
    expect(strong.relative_strength.diff_pct).toBeCloseTo(strong.relative_strength.stock_return_pct)
    expect(strong.scores.factors.relative_strength).toBe(20)
    const noBench = analyze(bars, [], { symbol: 'TSE:9999' })
    expect(noBench.relative_strength.diff_pct).toBeNull()
    expect(noBench.scores.factors.relative_strength).toBe(10)
  })

  it('買いシグナル後に損切りを割ると STOPPED になる', () => {
    // 横ばいのあと1日4円ずつ上げる。買いシグナルが出て保有中になった日の翌日に急落させる。
    // 値幅が一定の作り物データでは ATR の順位が常に100%になるので、その見送りだけ切っておく
    const opt = { blockHighVol: false }
    const info = { symbol: 'TSE:9999' }
    const flat: number[] = new Array(260).fill(1000)
    // 横ばいだけでは買いシグナルを出さない
    let before = analyze(barsFrom(flat, 2), [], info, opt)
    expect(before.trade.side).toBe('NONE')
    let closes: number[] = flat
    for (let k = 1; k <= 40 && before.trade.status !== 'ACTIVE'; k++) {
      closes = [...flat, ...Array.from({ length: k }, (_, i) => 1000 + (i + 1) * 4)]
      before = analyze(barsFrom(closes, 2), [], info, opt)
    }
    expect(before.trade.status).toBe('ACTIVE')
    expect(before.event).toBe('BUY_SETUP')
    expect(before.trade.entry).toBe(closes[closes.length - 1])
    expect(before.trade.stop).toBeLessThan(before.trade.entry)
    // 目標1は損切り幅の2倍、目標2は4倍
    const risk = before.trade.entry - before.trade.stop
    expect(before.trade.target_1 - before.trade.entry).toBeCloseTo(2 * risk, 0)
    expect(before.trade.target_2 - before.trade.entry).toBeCloseTo(4 * risk, 0)
    const after = analyze(barsFrom([...closes, 900], 2), [], info, opt)
    expect(after.trade.status).toBe('STOPPED')
    expect(after.event).toBe('TRADE_UPDATE')
  })

  it('日足が少なすぎるとエラー', () => {
    expect(() => analyze(barsFrom([1, 2, 3]), [])).toThrow()
  })
})

describe('買っていた場合の追跡', () => {
  const mk = (rows: number[][]): Bar[] => rows.map((r, i) => ({ date: dates(rows.length)[i]!, o: r[0]!, h: r[1]!, l: r[2]!, c: r[3]!, v: 1000 }))
  // シグナルの足（終値100）のあと、翌日の始値で買う。損切り90 → 損切り幅10、目標は+2R
  const sig = [100, 101, 99, 100]
  // 目標は損切り幅の2倍、期限は20営業日で確かめる
  const opt = { trackRR: 2, trackMaxBars: 20 }

  it('目標に届けば +2R', () => {
    const r = evaluateSignal(mk([sig, [100, 105, 99, 104], [104, 121, 103, 120]]), 0, 90, opt)
    expect(r.status).toBe('TARGET')
    expect(r.entry).toBe(100)
    expect(r.target).toBe(120)
    expect(r.r).toBe(2)
    expect(r.bars).toBe(2)
  })

  it('損切りに届けば −1R。同じ日に両方届いたら損切り扱い', () => {
    expect(evaluateSignal(mk([sig, [100, 102, 89, 95]]), 0, 90, opt).r).toBe(-1)
    const both = evaluateSignal(mk([sig, [100, 125, 89, 110]]), 0, 90, opt)
    expect(both.status).toBe('STOPPED')
  })

  it('損切りより下で寄り付いたら、その始値で売れたものとする', () => {
    const r = evaluateSignal(mk([sig, [100, 101, 96, 97], [80, 82, 78, 79]]), 0, 90, opt)
    expect(r.status).toBe('STOPPED')
    expect(r.exit).toBe(80)
    expect(r.r).toBe(-2)
  })

  it('翌日の始値が+2%より高ければ買わない', () => {
    expect(evaluateSignal(mk([sig, [103, 104, 102, 103]]), 0, 90, opt).status).toBe('SKIPPED_GAP')
  })

  it('期限まで決着しなければ終値で手じまい、翌日の足がまだ無ければ保留', () => {
    const flat = Array.from({ length: 25 }, () => [100, 103, 97, 105])
    const r = evaluateSignal(mk([sig, ...flat]), 0, 90, opt)
    expect(r.status).toBe('TIME_EXIT')
    expect(r.bars).toBe(20)
    expect(r.r).toBe(0.5)
    expect(evaluateSignal(mk([sig]), 0, 90, opt).status).toBe('PENDING')
    expect(evaluateSignal(mk([sig, [100, 103, 97, 105]]), 0, 90, opt).status).toBe('OPEN')
  })

  it('既定では目標は損切り幅の3倍、期限は40営業日', () => {
    const r = evaluateSignal(mk([sig, [100, 125, 99, 124]]), 0, 90)
    expect(r.status).toBe('OPEN')
    expect(r.target).toBe(130)
    const flat = Array.from({ length: 45 }, () => [100, 103, 97, 105])
    expect(evaluateSignal(mk([sig, ...flat]), 0, 90).bars).toBe(40)
  })

  it('目標なし（trackRR: 0）なら、期限まで持って終値で手じまい', () => {
    const up = Array.from({ length: 6 }, (_, k) => [100 + k * 10, 112 + k * 10, 99 + k * 10, 110 + k * 10])
    const r = evaluateSignal(mk([sig, ...up]), 0, 90, { trackRR: 0, trackMaxBars: 5 })
    expect(r.status).toBe('TIME_EXIT')
    expect(r.target).toBeNull()
    expect(r.exit).toBe(150)
    expect(r.r).toBe(5)
  })

  it('集計は決着したものだけを数える', () => {
    const s = summarize([{ status: 'TARGET', r: 2, bars: 3 }, { status: 'STOPPED', r: -1, bars: 1 }, { status: 'SKIPPED_GAP' }, { status: 'OPEN', r: 0.3, bars: 2 }])
    expect(s.closed).toBe(2)
    expect(s.win_rate_pct).toBe(50)
    expect(s.avg_r).toBe(0.5)
    expect(s.skipped).toBe(1)
    expect(s.open).toBe(1)
  })

  it('過去の足から候補を拾い、通過と見送りに分ける', () => {
    const closes = Array.from({ length: 400 }, (_, i) => 1000 + i * 2 + Math.round(Math.sin(i / 7) * 25))
    const r = backtest(barsFrom(closes, 6), [])
    expect(Array.isArray(r.passed)).toBe(true)
    expect(Array.isArray(r.blocked)).toBe(true)
    for (const x of r.passed) expect(x.stop).toBeLessThan(x.signalClose)
    // 同じ銘柄で追跡中に次の候補を数えない（買った日が前の決着より後）
    for (let k = 1; k < r.passed.length; k++) {
      const prev = r.passed[k - 1]
      if (prev.exitDate && r.passed[k].entryDate) expect(r.passed[k].signalDate >= prev.exitDate).toBe(true)
    }
  })
})

describe('好材料の窓開け', () => {
  // 横ばいのあと、最後の日だけ窓を開けて上げる
  const base = (last: Partial<Bar>): Bar[] => {
    const bars = barsFrom(Array.from({ length: 300 }, (_, i) => 1000 + (i % 3)), 5, 1000)
    const d = bars[bars.length - 1]!
    bars[bars.length - 1] = { ...d, ...last }
    return bars
  }

  it('窓+3%・陽線・高値引け・出来高3倍なら、買い候補（GAP）になる', () => {
    const p = analyze(base({ o: 1032, h: 1062, l: 1030, c: 1060, v: 3000 }), [], { symbol: 'TSE:9999' })
    expect(p.gap_up.is_gap_up).toBe(true)
    expect(p.buy_candidate.pass).toBe(true)
    expect(p.buy_candidate.kind).toBe('GAP')
    expect(p.buy_candidate.target).toBeNull()
    expect(p.buy_candidate.hold_days).toBe(40)
    expect(p.buy_candidate.stop).toBeLessThan(1060)
  })

  it('出来高が足りない・陰線・窓が小さい場合は GAP にならない', () => {
    const info = { symbol: 'TSE:9999' }
    expect(analyze(base({ o: 1032, h: 1062, l: 1030, c: 1060, v: 1500 }), [], info).gap_up.is_gap_up).toBe(false)
    expect(analyze(base({ o: 1060, h: 1062, l: 1030, c: 1032, v: 3000 }), [], info).gap_up.is_gap_up).toBe(false)
    expect(analyze(base({ o: 1010, h: 1062, l: 1008, c: 1060, v: 3000 }), [], info).gap_up.is_gap_up).toBe(false)
  })
})

describe('PTSの読み取り（株探のページ）', () => {
  const stockHtml = (pts: string) => `
    <div class="si_i1_1"><h2><span class="inline-block">6721</span><span class="fs0"> </span>ウインテスト</h2>
      <div class="si_i1_1_rbox"><span class="market">東証Ｓ</span> <time datetime="2026-11-13T15:30+09:00">15:30</time></div></div>
    <div class="si_i1_2"><span class="kabuka">1,112円</span>
      <dl class="si_i1_dl1"><dt>前日比</dt><dd><span class="down">-5</span></dd><dd><span class="down">-4.27</span>%</dd></dl></div>
    ${pts}`

  it('通常取引の株価と PTS の値段・時刻を読む', () => {
    const r = parseKabutanStock(stockHtml('<div class="si_i1_3"><div class="kabuka1">PTS</div> <div class="kabuka2">1,081.5円</div> <div class="kabuka3">08:24\u300011/16</div></div>'))
    expect(r.name).toBe('ウインテスト')
    expect(r.price).toBe(1112)
    expect(r.price_time).toBe('2026-11-13T15:30+09:00')
    expect(r.change).toBe(-5)
    expect(r.change_pct).toBe(-4.27)
    expect(r.pts_price).toBe(1081.5)
    expect(r.pts_time).toBe('08:24 11/16')
    expect(r.pts_vs_price_pct).toBeCloseTo(-2.74, 2)
  })

  it('PTS の取引が無い銘柄は null', () => {
    const none = parseKabutanStock(stockHtml(''))
    expect(none.pts_price).toBeNull()
    expect(none.pts_time).toBeNull()
    const dash = parseKabutanStock(stockHtml('<div class="kabuka1">PTS</div> <div class="kabuka2">－円</div> <div class="kabuka3">－</div>'))
    expect(dash.pts_price).toBeNull()
  })

  it('ランキングの表を読む', () => {
    const html = `<div class="meigara_count"><ul><li>2026年11月14日</li><li>06:02現在</li><li>572銘柄</li></ul></div>
      <table class="stock_table st_market"><thead><tr><th>通常取引<br>13日終値</th></tr></thead><tbody>
      <tr><td class="tac"><a href="/stock/?code=7522">7522</a></td><th scope="row" class="tal">ワタミ</th><td class="tac">東Ｐ</td>
        <td class="gaiyou_icon"><a href="/stock/?code=7522"></a></td><td class="chart_icon"><a href="/stock/chart?code=7522"></a></td>
        <td>1,008</td><td>1,280</td><td class="w61"><span class="up">+272</span></td><td class="w50"><span class="up">+26.98</span>%</td><td>75,700</td><td>－</td></tr>
      <tr><td class="tac"><a href="/stock/?code=247A">247A</a></td><th scope="row" class="tal">Ａｉロボ</th><td class="tac">東Ｇ</td>
        <td class="gaiyou_icon"></td><td class="chart_icon"></td>
        <td>709</td><td>559</td><td class="w61"><span class="down">-150</span></td><td class="w50"><span class="down">-21.16</span>%</td><td>123,400</td><td>－</td></tr>
      </tbody></table>`
    const r = parseKabutanRanking(html)
    expect(r.date).toBe('2026年11月14日')
    expect(r.as_of).toBe('06:02現在')
    expect(r.base).toBe('13日終値')
    expect(r.rows).toEqual([
      { code: '7522', name: 'ワタミ', market: '東Ｐ', close: 1008, pts_price: 1280, change: 272, change_pct: 26.98, volume: 75700 },
      { code: '247A', name: 'Ａｉロボ', market: '東Ｇ', close: 709, pts_price: 559, change: -150, change_pct: -21.16, volume: 123400 }
    ])
  })
})

describe('取引時間中の今の株価', () => {
  // 2026-11-13 と 2026-11-16 の足。11/16 は取引中
  const json = (ts: number[]) => ({
    chart: { result: [{
      meta: { gmtoffset: 32400, longName: 'Test Corp', regularMarketPrice: 114.04, regularMarketTime: 1794794530 },
      timestamp: ts,
      indicators: { quote: [{ open: [115, 109], high: [117, 121], low: [110, 109], close: [112, 114], volume: [1000, 2000] }] }
    }] }
  })

  it('今日の足があれば、前日終値との比と、寄り付きからの比を出す', () => {
    const r = parseYahooNow(json([1794528000, 1794787200]), 1794794600)
    expect(r.is_today).toBe(true)
    expect(r.price).toBe(114)
    expect(r.prev_close).toBe(112)
    expect(r.change_pct).toBeCloseTo(1.79, 2)
    expect(r.open).toBe(109)
    expect(r.from_open_pct).toBeCloseTo(4.59, 2)
    expect(r.time).toBe('2026-11-16 11:02')
  })

  it('今日の足がまだ無いときは、今日の値として扱わない', () => {
    const r = parseYahooNow(json([1794441600, 1794528000]), 1794794600)
    expect(r.is_today).toBe(false)
    expect(r.open).toBeNull()
    expect(r.prev_close).toBe(114)
  })
})

describe('飛びつく危険度', () => {
  it('特徴が無ければ0点で「低」', () => {
    const r = chaseRisk({ gainPct: 6, price: 1500, volSurge: 3, offHighPct: -0.5, run5Pct: 2, range20Pct: 3 })
    expect(r.score).toBe(0)
    expect(r.level).toBe('LOW')
    expect(r.reasons).toEqual([])
  })

  it('急騰・低位株・大商い・高値からの下げ・連騰・荒い値動きは点が積み上がる', () => {
    const r = chaseRisk({ gainPct: 81, price: 58, volSurge: 16, offHighPct: -4.9, run5Pct: 14, range20Pct: 13.5 })
    // 25（+20%以上）+ 25（100円未満）+ 6（出来高10倍）+ 5（高値から3%）+ 20（普段8%以上）
    expect(r.score).toBe(81)
    expect(r.level).toBe('HIGH')
    expect(r.reasons).toHaveLength(5)
  })

  it('境目の点数と、100点の上限', () => {
    expect(chaseRisk({ gainPct: 15, price: 300 }).score).toBe(15)
    expect(chaseRisk({ gainPct: 15, price: 300 }).level).toBe('MID')
    expect(chaseRisk({ gainPct: 25, price: 50, volSurge: 40, offHighPct: -9, run5Pct: 35, range20Pct: 9 }).score).toBe(100)
    // 値が取れなかった項目は点を付けない
    expect(chaseRisk({ gainPct: null, price: undefined }).score).toBe(0)
  })

  it('1時間ごとの株価から、検証と同じ特徴を出す', () => {
    // 6営業日ぶんの前場2本。最後の日（11/16）が今日
    const J = 9 * 3600
    const day = (d: string, h: number) => Date.parse(`${d}T${String(h).padStart(2, '0')}:00:00Z`) / 1000 - J
    const ds = ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-16']
    const ts: number[] = []
    const o: number[] = []
    const h: number[] = []
    const l: number[] = []
    const c: number[] = []
    const v: number[] = []
    ds.forEach((d, k) => {
      const last = k === ds.length - 1
      ts.push(day(d, 9), day(d, 10))
      o.push(100, 100)
      h.push(last ? 130 : 102, last ? 130 : 102)
      l.push(98, 98)
      c.push(100, last ? 120 : 100)
      v.push(0, last ? 5000 : 1000)
    })
    const json = { chart: { result: [{ meta: { gmtoffset: 32400, longName: 'Test', regularMarketPrice: 120 }, timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: v }] } }] } }
    const f = chaseFeatures(json, day('2026-11-16', 11))
    expect(f.is_today).toBe(true)
    expect(f.prev_close).toBe(100)
    expect(f.gainPct).toBe(20)
    expect(f.offHighPct).toBeCloseTo(-7.69, 2)
    expect(f.volSurge).toBe(5)
    expect(f.run5Pct).toBe(0)
    expect(f.range20Pct).toBeCloseTo(4.08, 2)
    // 今日の足が無ければ、今日の値として扱わない
    expect(chaseFeatures(json, day('2026-11-17', 11)).is_today).toBe(false)
  })

  it('値上がり率ランキングの表を読む（ストップ高の印つき）', () => {
    const html = `<div class="meigara_count"><ul><li>2026年11月16日</li><li>11:15現在</li><li>1706銘柄</li></ul></div>
      <table class="stock_table"><thead><tr><th>コード</th></tr></thead><tbody>
      <tr><td class="tac"><a href="/stock/?code=3624">3624</a></td><th scope="row" class="tal">アクセルＭ</th><td class="tac">東Ｇ</td>
        <td class="gaiyou_icon"></td><td class="chart_icon"></td><td>58</td><td></td><td><span class="up">+27</span></td><td><span class="up">+87.10</span>%</td><td>8,741,100</td><td>－</td></tr>
      <tr><td class="tac"><a href="/stock/?code=6317">6317</a></td><th scope="row" class="tal">北川鉄</th><td class="tac">東Ｓ</td>
        <td class="gaiyou_icon"></td><td class="chart_icon"></td><td>2,785</td><td>S</td><td><span class="up">+472</span></td><td><span class="up">+20.41</span>%</td><td>120,300</td><td>12.1</td></tr>
      </tbody></table>`
    const r = parseKabutanMovers(html)
    expect(r.date).toBe('2026年11月16日')
    expect(r.as_of).toBe('11:15現在')
    expect(r.rows[0]).toEqual({ code: '3624', name: 'アクセルＭ', market: '東Ｇ', price: 58, mark: '', change: 27, change_pct: 87.1, volume: 8741100 })
    expect(r.rows[1]!.mark).toBe('S')
    expect(r.rows[1]!.price).toBe(2785)
  })
})

describe('データ取得まわり', () => {
  it('東証の銘柄コードだけ受け付ける', () => {
    expect(isTseCode('7203')).toBe(true)
    expect(isTseCode('285A')).toBe(true)
    expect(isTseCode('AAPL')).toBe(false)
    expect(isTseCode('72030')).toBe(false)
    expect(isTseCode('../x')).toBe(false)
  })

  const yahoo = (regular: { start: number, end: number }) => ({
    chart: {
      result: [{
        meta: { gmtoffset: 32400, currency: 'JPY', longName: 'Test Corp', currentTradingPeriod: { regular } },
        // 2026-11-12 09:00 JST と 2026-11-13 09:00 JST
        timestamp: [1794441600, 1794528000],
        indicators: { quote: [{ open: [10, 11], high: [12, 13], low: [9, 10], close: [11, 12], volume: [100, 200] }] }
      }]
    }
  })

  it('取引時間中は今日の足を未確定として外す', () => {
    const r = parseYahoo(yahoo({ start: 1794528000, end: 1794551400 }), 1794540000)
    expect(r.bars.map((b: Bar) => b.date)).toEqual(['2026-11-12'])
    expect(r.droppedUnconfirmed).toBe(true)
  })

  it('取引終了から30分たてば今日の足も使う', () => {
    const r = parseYahoo(yahoo({ start: 1794528000, end: 1794551400 }), 1794551400 + 1801)
    expect(r.bars.map((b: Bar) => b.date)).toEqual(['2026-11-12', '2026-11-13'])
    expect(r.name).toBe('Test Corp')
  })

  it('端数つきの値は0.1円単位に丸める', () => {
    const j = yahoo({ start: 0, end: 0 })
    j.chart.result[0]!.indicators.quote[0]!.close[1] = 265.79998779296875
    expect(parseYahoo(j, 1794600000).bars[1].c).toBe(265.8)
  })

  it('値が欠けた日は捨てる', () => {
    const j = yahoo({ start: 0, end: 0 })
    j.chart.result[0]!.indicators.quote[0]!.close[0] = null as unknown as number
    expect(parseYahoo(j, 1794600000).bars).toHaveLength(1)
  })
})

describe('値下がり株の危険度・材料ニュース・答え合わせ', () => {
  it('dipRisk: 危ない特徴が無ければ低、重なれば高', () => {
    expect(dipRisk({ gainPct: -6, price: 1500, offLowPct: 0.5, run5Pct: 0, range20Pct: 3 })).toMatchObject({ score: 0, level: 'LOW' })
    const r = dipRisk({ gainPct: -12, price: 80, offLowPct: 6, run5Pct: 40, range20Pct: 9 })
    expect(r.level).toBe('HIGH')
    expect(r.score).toBe(98)
    expect(dipRisk({ gainPct: -7, price: 500, offLowPct: 1, run5Pct: -20, range20Pct: 6 })).toMatchObject({ score: 20, level: 'MID' })
  })

  it('parseKabutanNews: 自動記事・まとめ記事・古い記事を外し、記事を開示より先に出す', () => {
    const row = (time: string, ctg: string, title: string) => `<tr> <td class="news_time"><time datetime="${time}">x</time></td> <td><div class="newslist_ctg newsctg2_b">${ctg}</div></td> <td><a href="/stock/news?code=7522&b=n1">${title}</a></td> </tr>`
    const html = `<table class="s_news_list mgbt0">${[
      row('2026-11-16T15:38:31+09:00', 'テク', '本日の【ボリンジャー】'),
      row('2026-11-16T08:00:00+09:00', '開示', 'ＭＢＯの実施に関するお知らせ'),
      row('2026-11-16T10:10:00+09:00', '材料', 'ワタミは急騰、ＴＯＢ価格にサヤ寄せ'),
      row('2026-11-16T09:00:00+09:00', '材料', '前日に動いた銘柄 part1'),
      row('2026-11-16T09:00:00+09:00', '開示', 'Notice Regarding MBO'),
      row('2026-11-12T10:00:00+09:00', '材料', '古い記事')
    ].join('')}</table>`
    const n = parseKabutanNews(html, '2026-11-13T15:00:00+09:00')
    expect(n.map(v => v.title)).toEqual(['ワタミは急騰、ＴＯＢ価格にサヤ寄せ', 'ＭＢＯの実施に関するお知らせ'])
    expect(n[0]).toMatchObject({ category: '材料', time: '2026-11-16T10:10' })
  })

  it('afternoonResult: 後場の始値から終値までを出す', () => {
    const base = Date.UTC(2026, 10, 16, 0, 0, 0) / 1000 // 日本時間 9:00
    const hours = [0, 1, 2, 3.5, 4.5, 5.5] // 9時, 10時, 11時, 12:30, 13:30, 14:30
    const json = { chart: { result: [{ meta: { gmtoffset: 32400 }, timestamp: hours.map(h => base + h * 3600), indicators: { quote: [{ open: [100, 104, 106, 110, 108, 105], high: [105, 107, 111, 112, 109, 106], low: [99, 103, 105, 107, 104, 101], close: [104, 106, 110, 108, 105, 104.5], volume: [1, 1, 1, 1, 1, 1] }] } }] } }
    expect(afternoonResult(json, '2026-11-16')).toEqual({ morning_close: 110, afternoon_open: 110, close: 104.5, afternoon_pct: -5, worst_dip_pct: -8.18, best_pop_pct: 1.82 })
    expect(afternoonResult(json, '2026-11-17')).toBeNull()
  })

  it('mergeMoverStats: 危険度ごとに足し、同じ日は二重に足さない', () => {
    const recs = [
      { date: '2026-11-16', dir: 'up', risk_level: 'HIGH', has_news: true, afternoon_pct: -4 },
      { date: '2026-11-16', dir: 'up', risk_level: 'HIGH', has_news: false, afternoon_pct: 1 },
      { date: '2026-11-16', dir: 'down', risk_level: 'LOW', has_news: null, afternoon_pct: 0.5 }
    ]
    const s1 = mergeMoverStats(null, recs)
    const s2 = mergeMoverStats(s1, recs)
    expect(s2).toEqual(s1)
    const sum = summarizeMoverStats(s1)
    expect(sum.days).toBe(1)
    expect(sum.up.HIGH).toEqual({ count: 2, avg_pct: -1.5, win_rate_pct: 50, drop3_count: 1, drop3_pct: 50 })
    expect(sum.up.with_news.count).toBe(1)
    expect(sum.down.LOW.count).toBe(1)
    expect(sum.down.no_news.count).toBe(0)
  })

  it('mergeMoverStats: 朝の記録の累計（open）を持ち越しても、昼の累計に混ざらない', () => {
    const noon = mergeMoverStats(null, [{ date: '2026-11-16', dir: 'up', risk_level: 'LOW', has_news: true, afternoon_pct: 1 }])
    const withOpen = { ...noon, open: mergeMoverStats(null, [{ date: '2026-11-16', dir: 'down', risk_level: 'HIGH', has_news: false, afternoon_pct: -5 }]) }
    const next = mergeMoverStats(withOpen, [{ date: '2026-11-17', dir: 'up', risk_level: 'LOW', has_news: true, afternoon_pct: -1 }])
    expect(next.dates).toEqual(['2026-11-16', '2026-11-17'])
    expect(next.up.LOW).toMatchObject({ n: 2, sum: 0, win: 1 })
    expect(next.down.HIGH.n).toBe(0)
    expect(next.open.down.HIGH).toMatchObject({ n: 1, drop3: 1 })
  })
})

describe('買う前チェック', () => {
  const settings = { capital: 400000, cash: 150000, riskPct: 2, maxPosPct: 40, maxPositions: 3, dayTradeMax: 2 }
  const base = { code: '7203', price: 1000, atr: 20, regime: 'TREND_UP', overheat: 10, today: '2026-11-17', earningsDate: '2027-02-05', settings, positions: [], buysToday: 0 }

  it('損切りと株数を、損失の上限・1銘柄の上限・現金のいちばん厳しいもので決める', () => {
    const r = preTradeCheck(base)
    expect(r).toMatchObject({ ok: true, stop: 960, loss_limit_jpy: 8000, shares_100_unit: 100, cost_jpy: 100000, loss_if_stopped_jpy: 4000, target_3r: 1120 })
    expect(r.limited_by).toBe('現金')
    expect(r.blocks).toEqual([])
  })

  it('含み損の保有銘柄の買い増しを止める', () => {
    const r = preTradeCheck({ ...base, code: '6721', price: 117, atr: 23, positions: [{ code: '6721', name: 'テスト', entry: 188.72, last: 117, qty: 1300 }] })
    expect(r.ok).toBe(false)
    expect(r.blocks.some(b => b.includes('買い増し禁止'))).toBe(true)
    expect(r.warnings.some(w => w.includes('値動きがとても荒い'))).toBe(true)
  })

  it('1日の回数・銘柄数・決算前で止める', () => {
    expect(preTradeCheck({ ...base, buysToday: 2 }).blocks.some(b => b.includes('1日の回数'))).toBe(true)
    const pos = [1, 2, 3].map(n => ({ code: '100' + n, entry: 100, last: 110, qty: 100 }))
    expect(preTradeCheck({ ...base, positions: pos }).blocks.some(b => b.includes('銘柄数の上限'))).toBe(true)
    expect(preTradeCheck({ ...base, earningsDate: '2026-11-17' }).blocks.some(b => b.includes('決算の日'))).toBe(true)
    const near = preTradeCheck({ ...base, earningsDate: '2026-11-19' })
    expect(near.blocks.some(b => b.includes('決算'))).toBe(false)
    expect(near.warnings.some(w => w.includes('決算が近い'))).toBe(true)
    expect(preTradeCheck({ ...base, earningsDate: '2026-11-16' }).blocks).toEqual([])
  })

  it('デイトレの保有は銘柄数に数えない', () => {
    const pos = [1, 2, 3].map(n => ({ code: '100' + n, entry: 100, last: 110, qty: 100, style: n === 3 ? 'day' : 'swing' }))
    expect(preTradeCheck({ ...base, positions: pos }).blocks.some(b => b.includes('銘柄数の上限'))).toBe(false)
  })

  it('maxOpenRiskMult があれば、銘柄数ではなく損の合計で上限を決める', () => {
    const s2 = { ...settings, maxOpenRiskMult: 3, cash: 1000000, maxPosPct: 100 } // 1回の損の上限 8,000円 → 合計 24,000円
    // 損の小さい保有が4つ（合計 4,000円）なら、銘柄数が多くても買える
    // 11/24〜：買値から損切りまでで数える。損切りを買値まで上げた株は0、上がっていても買値より下の損切りは（買値 − 損切り）
    const small = [1, 2, 3, 4].map(n => ({ code: '100' + n, entry: 100, last: 110, qty: 100, stop: n === 4 ? 90 : 100, style: 'swing' }))
    const r1 = preTradeCheck({ ...base, settings: s2, positions: small })
    expect(r1.blocks).toEqual([])
    expect(r1.open_risk).toMatchObject({ open: 1000, budget: 24000, room: 23000 })
    // 損切りの無い保有は上限いっぱい（8,000円）とみる。3つで 24,000円 → 残りなしで止める
    const nostop = [1, 2, 3].map(n => ({ code: '200' + n, entry: 100, last: 100, qty: 100 }))
    const r2 = preTradeCheck({ ...base, settings: s2, positions: nostop })
    expect(r2.ok).toBe(false)
    expect(r2.blocks.some(b => b.includes('損の合計の上限'))).toBe(true)
    // 残りが少なければ株数が減る（残り 4,000円 ÷ 1株40円 = 100株）
    const r3 = preTradeCheck({ ...base, settings: s2, positions: [{ code: '3001', entry: 1000, last: 1000, qty: 500, stop: 960 }] })
    expect(r3.limited_by).toBe('損の合計の上限')
    expect(r3.shares_100_unit).toBe(100)
  })

  it('100株で上限を超えるときは、1株単位の株数を出す', () => {
    const r = preTradeCheck({ ...base, price: 5000, atr: 150 })
    expect(r.shares_100_unit).toBe(0)
    expect(r.mini_shares_max).toBe(26)
    expect(r.warnings.some(w => w.includes('かぶミニ'))).toBe(true)
  })

  it('決算発表予定日の読み取りと、営業日の数え方', () => {
    expect(parseKabutanEarningsDate('<div>決算発表予定日 <time>2026/11/16</time></div>')).toBe('2026-11-16')
    expect(parseKabutanEarningsDate('<div>なし</div>')).toBeNull()
    expect(businessDaysBetween('2026-11-13', '2026-11-16')).toBe(1)
    expect(businessDaysBetween('2026-11-17', '2026-11-17')).toBe(0)
    expect(businessDaysBetween('2026-11-17', '2026-11-13')).toBe(-2)
  })
})

describe('決算の見出し', () => {
  it('classifyKessan: 上方修正・下方修正・良い決算・悪い決算に分ける', () => {
    expect(classifyKessan('光陽社、今期最終を61％上方修正、配当も6円増額')).toEqual({ kind: 'REVISE_UP', revise_pct: 61 })
    expect(classifyKessan('ジェネパ、前期経常を17％下方修正')).toEqual({ kind: 'REVISE_DOWN', revise_pct: 17 })
    expect(classifyKessan('データセク、今期最終を一転赤字に下方修正').kind).toBe('REVISE_DOWN')
    expect(classifyKessan('平山、7-9月期(1Q)経常は83％増益で着地').kind).toBe('GOOD')
    expect(classifyKessan('フロンテオ、上期経常が赤字拡大で着地・7-9月期は赤字転落').kind).toBe('BAD')
    expect(classifyKessan('浅沼組、今期配当を1.5円増額修正').kind).toBe('OTHER')
  })

  it('parseKabutanKessanList: 一覧の行とページ数を読み、途中で切れた見出しは捨てる', () => {
    const row = (time: string, code: string, title: string) => `<tr><td class="news_time"><time datetime="${time}">x</time></td><td><div class="newslist_ctg newsctg3_kk_b oncodetip_code-data1" data-code="${code}">決算</div></td><td class="oncodetip_code-data1" data-code="${code}"></td><td><a href="/news/?&b=k1">${title}</a></td></tr>`
    const html = `<table class="s_news_list mgbt0">${row('2026-11-13T21:00:00+09:00', '3719', 'Ａ社、今期最終を一転赤字に下方修正')}${row('2026-11-13T15:30:00+09:00', '285A', 'Ｂ社、今期経常を10％上方修正')}${row('2022-05-13T19:30:00+09:00', '4760', 'Ｃ社、今期最終は…')}</table><a href="?category=3&page=2">2</a><a href="?category=3&page=7">»</a>`
    const r = parseKabutanKessanList(html)
    expect(r.last_page).toBe(7)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[1]).toMatchObject({ code: '285A', time: '2026-11-13T15:30', category: '決算', kind: 'REVISE_UP', revise_pct: 10 })
  })
})

describe('上方修正のその後', () => {
  const mk = (closes: number[], start = 2) => closes.map((c, k) => ({ date: `2026-11-${String(start + k).padStart(2, '0')}`, o: c - 1, h: c + 2, l: c - 3, c }))
  const bars = mk([100, 102, 104, 110, 112, 115, 113, 118, 120])
  const bench = mk([200, 200, 200, 201, 202, 203, 204, 205, 206])

  it('引け後の発表は、翌営業日の始値で買い、最初の反応は始値と前日終値の差', () => {
    const r = kessanOutcome({ date: '2026-11-04', time: '15:30' }, bars, bench)
    expect(r).toMatchObject({ entryDate: '2026-11-05', entry: 109, react: 4.81, r1: 0.92, r5: 8.26, final: false, stuck: false, openAtHigh: false })
    expect(r.ex5).toBe(5.76)
    expect(r.r20).toBeUndefined()
  })

  it('場中の発表は、その日の終値までを最初の反応とする', () => {
    expect(kessanOutcome({ date: '2026-11-04', time: '11:00' }, bars, bench).react).toBe(1.96)
  })

  it('次の営業日がまだ無ければ pending', () => {
    expect(kessanOutcome({ date: '2026-11-10', time: '15:30' }, bars, bench).pending).toBeTruthy()
  })

  it('mergeKessanStats: 5日後が出た記録を1回だけ数える', () => {
    const recs = [{ id: 'a', react: 15, r5: 6, ex5: 5 }, { id: 'b', react: 2, r5: -1, ex5: -2 }, { id: 'c', react: 3 }]
    const m1 = mergeKessanStats(null, recs)
    const m2 = mergeKessanStats(m1.stats, m1.records)
    expect(m2.stats).toEqual(m1.stats)
    expect(m1.records.map(r => r.counted)).toEqual([true, true, undefined])
    const sum = summarizeKessanStats(m1.stats)
    expect(sum.all).toEqual({ count: 2, avg_5d_pct: 2.5, win_rate_pct: 50, avg_vs_topix_5d_pct: 1.5, beat_topix_pct: 50 })
    expect(sum.react12.count).toBe(1)
    expect(sum.react_under12.count).toBe(1)
  })

  it('mergeKessanStats: 上方修正以外は、反応の大きさの欄にだけ数える', () => {
    const m = mergeKessanStats(null, [{ kind: 'GOOD', react: 13, r5: 4 }, { kind: 'BAD', react: 8, r5: -1 }, { kind: 'REVISE_UP', react: 9, r5: 2 }])
    const sum = summarizeKessanStats(m.stats)
    expect(sum.all.count).toBe(1)
    expect(sum.react12.count).toBe(1)
    expect(sum.react7_12.count).toBe(2)
    expect(sum.react_under12.count).toBe(1)
  })

  it('mergeKessanStats: 1日じゅう張り付いた日は数えず、高く始まって下げた日は数える', () => {
    const m = mergeKessanStats(null, [{ kind: 'GOOD', react: 20, r5: 10, stuck: true }, { kind: 'GOOD', react: 13, r5: -2, openAtHigh: true }, { kind: 'GOOD', react: 14, r5: 1 }])
    expect(summarizeKessanStats(m.stats).react12.count).toBe(2)
  })
})

describe('適時開示（TDnet）', () => {
  it('tagTdnet: 増資・損失・修正などに印を付け、役員のストック・オプションは増資にしない', () => {
    expect(tagTdnet('第三者割当による第14回新株予約権の発行に関するお知らせ')).toEqual(['DILUTION'])
    expect(tagTdnet('取締役に対するストック・オプション（新株予約権）の付与に関するお知らせ')).toEqual([])
    expect(tagTdnet('第16回新株予約権の取得及び消却並びに自己株式の消却に関するお知らせ')).toEqual([])
    expect(tagTdnet('棚卸資産評価損、営業外費用に関するお知らせ')).toEqual(['LOSS'])
    expect(tagTdnet('2026年12月期通期業績予想の修正に関するお知らせ')).toEqual(['REVISION'])
    expect(tagTdnet('継続企業の前提に関する注記についてのお知らせ')).toEqual(['DANGER'])
  })

  it('parseTdnetList: 行とページ数を読み、コードは4桁にする', () => {
    const row = (tm: string, code: string, title: string) => `<tr>\n<td class="oddnew-L kjTime" noWrap>${tm}</td>\n<td class="oddnew-M kjCode" noWrap>${code}</td>\n<td class="oddnew-M kjName" noWrap>テスト </td>\n<td class="oddnew-M kjTitle" align="left"><a href="1401202611175.pdf" target="_blank">${title}</a></td>\n<td class="oddnew-M kjXbrl"> </td>\n<td class="oddnew-M kjPlace" noWrap align="left">東 </td>\n</tr>`
    const html = `<table><tr><th>時刻</th></tr>${row('17:00', '67210', '資金の借入に関するお知らせ')}${row('15:30', '421A0', '業績予想の修正に関するお知らせ')}</table><a href="I_list_002_20261116.html">2</a><a href="I_list_005_20261116.html">5</a>`
    const r = parseTdnetList(html)
    expect(r.last_page).toBe(5)
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ time: '17:00', code: '6721', name: 'テスト', place: '東', tags: [] })
    expect(r.rows[1]).toMatchObject({ code: '421A', tags: ['REVISION'], pdf: 'https://www.release.tdnet.info/inbs/1401202611175.pdf' })
  })
})

describe('松井証券のランキング', () => {
  it('parseMatsuiRanking: 順位・銘柄・現在値・売買代金・変動率を読む', () => {
    const html = `<table class="m-table"><tr><td>x</td></tr></table><p>2026/11/17 15:30 現在</p><table class="m-table" data-type="rankingDt"><thead><tr><th>順位</th></tr></thead><tbody>
    <tr>
      <td>1</td>
      <td>
        <a href=/stock/285A/index>キオクシアホールディングス</a>
        <span>285A 東P</span>
      </td>
      <td><span class="m-down-icon">7,819.0</span></td>
      <td class="m-sp-only m-align-right"><span class="m-down-color">-573.0(-6.83%)</span></td>
      <td><span>出来高：</span>90,313,600</td>
      <td><span>概算売買代金：</span>729,264,887,200</td>
      <td><span class="m-sp-only">株価変動率：</span>+6.59%</td>
      <td><ul></ul></td>
    </tr></tbody></table>`
    const r = parseMatsuiRanking(html)
    expect(r.as_of).toBe('2026/11/17 15:30')
    expect(r.rows).toEqual([{ rank: 1, name: 'キオクシアホールディングス', code: '285A', market: '東P', price: 7819, change_pct: -6.83, volume: 90313600, turnover: 729264887200, range_pct: 6.59 }])
  })
})

describe('次の決算発表日の見積もり', () => {
  const rows = [
    { date: '2026-11-13', time: '14:00', kind: '3Q', title: '' },
    { date: '2026-08-07', time: '14:00', kind: '2Q', title: '' },
    { date: '2026-08-07', time: '14:00', kind: '修正', title: '' },
    { date: '2026-05-14', time: '14:00', kind: '1Q', title: '' },
    { date: '2026-02-12', time: '15:30', kind: '通期', title: '' },
    { date: '2025-11-14', time: '14:00', kind: '3Q', title: '' },
    { date: '2025-02-13', time: '15:30', kind: '通期', title: '' }
  ]
  it('去年の同じ区分の発表日＋364日のうち、まだ発表していない一番近いもの', () => {
    expect(estimateNextEarnings(rows, '2026-11-17')).toEqual({ date: '2027-02-11', kind: '通期', last_year: '2026-02-12', time: '15:30' })
    expect(estimateNextEarnings(rows, '2026-11-10')).toMatchObject({ date: '2026-11-13', kind: '3Q' })
  })
  it('parseIrbankHistory: 表の行を読む', () => {
    const html = '<table><tr><th>提出日</th><th>時間</th><th>区分</th><th>資料</th></tr><tr class="odd"><td class="lf">2026/11/13</td><td class="lf">14:00</td><td class="lf co_red">3Q</td><td class="lf"><a href="/x">2026年12月期第3四半期決算短信</a></td></tr></table>'
    expect(parseIrbankHistory(html)).toEqual([{ date: '2026-11-13', time: '14:00', kind: '3Q', title: '2026年12月期第3四半期決算短信' }])
  })
})

describe('買おうとした銘柄のその後', () => {
  const mk = (closes: number[]) => closes.map((c, k) => ({ date: `2026-11-${String(2 + k).padStart(2, '0')}`, o: c, h: c + 2, l: c - 3, c }))
  const bars = mk([100, 102, 95, 98, 101, 104, 99])
  const bench = mk([200, 200, 202, 202, 204, 204, 206])
  it('記録した値段から1・5営業日後と、途中の安値・損切り', () => {
    const r = consideredOutcome({ date: '2026-11-02', price: 100, stop: 93 }, bars, bench)
    expect(r).toMatchObject({ r1: 2, r5: 4, ex5: 2, low5: -8, high5: 6, stopHit1: false, stopHit5: true, final: false })
  })
  it('mergeConsideredStats: /mite のスイングの判定ごとに、5日後と20日後を1回ずつ数える', () => {
    const recs = [{ decision: 'passed', mite_swing: '買い候補', r5: 2, r20: 4 }, { decision: 'passed', mite_swing: '買い候補', r5: -1 }, { decision: 'blocked', mite_swing: '見送り', r5: -3, r20: -6 }]
    const m1 = mergeConsideredStats(null, recs)
    expect(mergeConsideredStats(m1.stats, m1.records).stats).toEqual(m1.stats)
    const t = summarizeConsideredStats(m1.stats).mite.swing
    expect(t['買い候補']).toEqual({ count5: 2, avg_5d_pct: 0.5, win5_pct: 50, count20: 1, avg_20d_pct: 4, win20_pct: 100 })
    expect(t['見送り'].avg_20d_pct).toBe(-6)
  })
  it('mergeConsideredStats: 判断ごとに1回だけ数える', () => {
    const recs = [{ decision: 'bought', r5: 3, ex5: 1 }, { decision: 'passed', r5: -6, ex5: -5 }, { decision: 'blocked', r5: -2 }, { decision: 'passed' }]
    const m1 = mergeConsideredStats(null, recs)
    expect(mergeConsideredStats(m1.stats, m1.records).stats).toEqual(m1.stats)
    const s = summarizeConsideredStats(m1.stats)
    expect(s.passed).toEqual({ count: 1, avg_5d_pct: -6, win_rate_pct: 0, drop5_pct: 100, avg_vs_topix_5d_pct: -5 })
    expect(s.blocked.count).toBe(1)
  })
})

describe('広い範囲の買い候補と成績の集計', () => {
  it('candidateRow: 通過・見送りの候補だけを、追跡に要る形にする', () => {
    const pk = { date_jst: '2026-11-17', candle: { close: 1000 }, volatility: { atr: 20, atr_pct_of_price: 2 }, regime: 'TREND_UP', scores: { long: 78 }, overheat: { score: 10 }, volume: { turnover_avg: 5e8 }, trend: { dev_fast_pct: 3 }, relative_strength: { diff_pct: 4 }, setup: { candidate: 'PULLBACK' } }
    expect(candidateRow({ ...pk, buy_candidate: { pass: true, kind: 'PULLBACK', stop: 960, target: 1120 } }, { code: '9999', name: 'テスト' })).toMatchObject({ code: '9999', kind: 'PULLBACK', pass: true, reason: 'NONE', stop: 960, target: 1120, score: 78 })
    expect(candidateRow({ ...pk, buy_candidate: { pass: false, why_not: 'OVERHEAT' } }, { code: '9999' })).toMatchObject({ pass: false, reason: 'OVERHEAT', stop: 960 })
    expect(candidateRow({ ...pk, setup: { candidate: 'NONE' }, buy_candidate: { pass: false } }, { code: '9999' })).toBeNull()
  })
  it('signalsReport: 決着したものだけを分け方ごとに集計する', () => {
    const rep = signalsReport([
      { status: 'TARGET', r: 3, pass: true, kind: 'GAP', score: 80, close: 500, regime: 'TREND_UP' },
      { status: 'STOPPED', r: -1, pass: true, kind: 'GAP', score: 60, close: 500, regime: 'TREND_UP' },
      { status: 'TIME_EXIT', r: 0.5, pass: false, kind: 'MOMENTUM', reason: 'OVERHEAT', score: 90, close: 3000 },
      { status: 'OPEN', pass: true, kind: 'PULLBACK' }
    ])
    expect(rep.open).toBe(1)
    expect(rep.all).toEqual({ count: 3, avg_r: 0.83, win_rate_pct: 67, total_r: 2.5 })
    expect(rep.by_kind['通過・GAP']).toEqual({ count: 2, avg_r: 1, win_rate_pct: 50, total_r: 2 })
    expect(rep.by_reason['見送り・OVERHEAT'].count).toBe(1)
    expect(rep.by_price['300〜1,000円'].count).toBe(2)
  })
})

describe('値動きの相関', () => {
  const day = (k: number) => `2026-${String(1 + Math.floor(k / 28)).padStart(2, '0')}-${String(1 + (k % 28)).padStart(2, '0')}`
  const mk = (rs: number[]) => {
    const closes = rs.reduce<number[]>((acc, r) => [...acc, (acc.at(-1) ?? 100) * (1 + r)], [])
    return closes.map((c, k) => ({ date: day(k), o: c, h: c, l: c, c }))
  }
  const base = Array.from({ length: 70 }, (_, k) => Math.sin(k * 1.7) * 0.02)
  it('同じ動きは1、逆の動きは−1、20日に満たなければ null', () => {
    expect(returnCorrelation(mk(base), mk(base))).toBe(1)
    expect(returnCorrelation(mk(base), mk(base.map(r => -r)))).toBe(-1)
    expect(returnCorrelation(mk(base.slice(0, 10)), mk(base.slice(0, 10)))).toBeNull()
  })
  it('preTradeCheck: 保有株と相関が高いと警告する', () => {
    const settings = { capital: 400000, cash: 150000, riskPct: 2, maxPosPct: 40, maxPositions: 3, dayTradeMax: 2 }
    const r = preTradeCheck({ code: '7203', price: 1000, atr: 20, regime: 'TREND_UP', overheat: 10, today: '2026-11-17', earningsDate: '2027-02-05', settings, positions: [], buysToday: 0, correlations: [{ code: '7267', name: 'テスト', corr: 0.82 }, { code: '9984', name: 'べつ', corr: 0.55 }, { code: '4502', name: 'ちがう', corr: 0.1 }] })
    expect(r.ok).toBe(true)
    expect(r.warnings.filter(w => w.includes('一緒に動きすぎ'))).toHaveLength(1)
    expect(r.warnings.filter(w => w.includes('やや一緒に動く'))).toHaveLength(1)
  })
})

describe('株が増える資金調達（MSワラント）の警告', () => {
  const a = (t: string, d: string) => `<a class="nxq" title="9999 テスト | ${t}（${d} 16:30提出）" href="/x">x</a>`
  const html = [
    a('第三者割当による第13回新株予約権(行使価額修正条項付)の行使完了及び月間行使状況に関するお知らせ', '2026/10/20'),
    a('第三者割当による第13回新株予約権(行使価額修正条項付)の大量行使に関するお知らせ', '2026/10/19'),
    a('募集新株予約権(有償ストック・オプション)の発行に関するお知らせ', '2026/04/15'),
    a('第三者割当による第13回新株予約権(行使価額修正条項付)の発行に関するお知らせ', '2025/12/26'),
    a('第三者割当による第12回新株予約権(行使価額修正条項付)の発行に関するお知らせ', '2024/10/31'),
    a('液体レンズの採用に関するお知らせ', '2026/10/08'),
    a('行使価額修正条項付新株予約権の月間行使状況に関するお知らせ', '2024/07/01'),
    a('行使価額修正条項付新株予約権の月間行使状況に関するお知らせ', '2024/08/01'),
    a('(開示事項の経過)テスト株式会社の発行済み転換社債型新株予約権付社債の新株予約権行使および同社の連結子会社化完了に関するお知らせ', '2026/10/21')
  ].join('')
  const rows = parseDilution(html)
  it('MSワラントの開示だけを拾い、ストック・オプションと関係ない開示は除く', () => {
    expect(rows.map((r: { kind: string }) => r.kind)).toEqual(['other', 'done', 'heavy', 'issue', 'issue', 'monthly', 'monthly'])
    expect(summarizeDilution(rows, '2026-11-18').active).toBe(false)
    expect(rows[1].series).toBe(13)
  })
  it('「行使の完了」も完了として読む', () => {
    expect(parseDilution(a('第三者割当により発行された第19回新株予約権(行使価額修正条項付)の行使停止指定に関するお知らせ', '2026/11/12'))[0].kind).toBe('other')
    expect(parseDilution(a('第三者割当により発行された第19回新株予約権(行使価額修正条項付)の大量行使、行使の完了及び月間行使状況に関するお知らせ', '2026/11/02'))[0].kind).toBe('done')
  })
  it('行使完了の前はまだ残っている、直近の大量行使・完了は強い注意', () => {
    expect(summarizeDilution(rows, '2026-10-10').active).toBe(true)
    const after = summarizeDilution(rows, '2026-11-18')
    expect(after.active).toBe(false)
    expect(after.recent_heavy).toEqual(['2026-10-19'])
    expect(after.series_5y).toBe(2)
    const base = { code: '9999', price: 117, atr: 10, today: '2026-11-18', earningsDate: '2027-02-15', settings: { capital: 400000, cash: 300000, riskPct: 3, maxPosPct: 62, maxPositions: 3, dayTradeMax: 2 }, positions: [], buysToday: 0 }
    const w = preTradeCheck({ ...base, dilution: after }).warnings.join('\n')
    expect(w).toContain('強い注意')
    expect(w).toContain('5年で 2回')
    expect(preTradeCheck({ ...base, dilution: summarizeDilution(rows, '2026-10-10') }).warnings.join('\n')).toContain('残っている')
    expect(preTradeCheck({ ...base, dilution: summarizeDilution([], '2026-11-18') }).warnings.join('\n')).not.toContain('資金調達')
    expect(preTradeCheck(base).ok).toBe(true)
  })
})

describe('場中の判定（5分足）', () => {
  // 9:00 から5分ごと。上昇してから VWAP 近くまで押し、陽線で戻す形
  const mk = (cs: number[]) => cs.map((c, i) => ({ m: 540 + i * 5, o: i ? cs[i - 1] : c, h: Math.max(c, i ? cs[i - 1] : c) + 0.5, l: Math.min(c, i ? cs[i - 1] : c) - 0.5, c, v: 1000 }))
  const up = mk([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 109, 108, 107, 106.5, 107.5])
  const ctx = { prevClose: 100, ma25: 95, ma25Prev: 94, atrDay: 6 }
  it('上昇中の押し目で TAKE、支えと壁を出す', () => {
    // 10:30 前後、始値から+1%台、値動きの穏やかな株の押し目
    const calm = mk([100, 100.15, 100.3, 100.45, 100.6, 100.75, 100.9, 101.05, 101.2, 101.35, 101.5, 101.35, 101.2, 101.05, 100.95, 101.15]).map((b, i) => ({ ...b, m: 590 + i * 5, h: Math.max(b.o, b.c) + 0.1, l: Math.min(b.o, b.c) - 0.1 }))
    const v = intradayView(calm, { prevClose: 100, ma25: 97, ma25Prev: 96, atrDay: 2 })
    expect(v.regime).toBe('TREND_UP')
    expect(v.daily_trend).toBe('UP')
    expect(v.signal).toBe('TAKE')
    expect(v.kind).toBe('PULLBACK')
    expect(v.supports.length).toBeGreaterThan(0)
    expect(v.resistances[0].price).toBeGreaterThan(v.price)
    expect(v.stop_intraday).toBeLessThan(v.price)
    expect(v.stop_intraday).toBeLessThanOrEqual(v.limit * 0.99 + 1) // 損切りは買値から1%以上離す
  })
  it('形は買い場でも、時間帯・値動きの荒さなどで外れたら WAIT（理由つき）', () => {
    const v = intradayView(up, ctx)
    expect(v.signal).toBe('WAIT')
    expect(v.raw_take).toBe('PULLBACK')
    expect(v.reasons.join('')).toContain('時間帯')
    expect(v.reasons.join('')).toContain('値動きの荒い株')
  })
  it('日足が下向き・急騰の追いかけ・急落は SKIP', () => {
    expect(intradayView(up, { ...ctx, ma25: 105, ma25Prev: 106 }).signal).toBe('SKIP')
    expect(intradayView(up, { ...ctx, prevClose: 95 }).reasons.join('')).toContain('急騰')
    const crash = mk([100, 101, 102, 103, 104, 105, 104, 102, 100, 98, 96, 94])
    const v = intradayView(crash, ctx)
    expect(v.regime).toBe('PANIC')
    expect(v.signal).toBe('SKIP')
  })
  it('日足の前提を作る', () => {
    const daily = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1 }))
    const c = intradayContext(daily)
    expect(c.prevClose).toBe(139)
    expect(c.ma25).toBeCloseTo(127, 5)
    expect(c.ma25).toBeGreaterThan(c.ma25Prev)
  })
  it('全銘柄の1日分を数えて累計に足す（同じ日は2回足さない）', () => {
    const flat = mk([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100])
    const d = intradayWideDay([{ day: up, nextClose: 110, ctx }, { day: flat, nextClose: 100, ctx }], { times: [570, 600], delay: 5 })
    expect(d.groups.ALL.n).toBe(d.checks)
    expect(d.groups.ALL.sumExC).toBeCloseTo(0, 6)
    const st = mergeIntradayWide(null, { date: '2026-11-18', ...d })
    expect(mergeIntradayWide(st, { date: '2026-11-18', ...d }).groups.ALL.n).toBe(d.checks)
    expect(mergeIntradayWide(st, { date: '2026-11-19', ...d }).groups.ALL.n).toBe(d.checks * 2)
  })
  it('後場に VWAP を取り戻した形に目印', () => {
    const am = mk([100, 99, 98, 97, 96, 95, 94, 93]).map((b, i) => ({ ...b, m: 540 + i * 5 }))
    const pm = mk([93, 93.5, 94, 98]).map((b, i) => ({ ...b, m: 750 + i * 5, v: i === 3 ? 5000 : 1000 }))
    const v = intradayView([...am, ...pm], { prevClose: 95, ma25: 90, ma25Prev: 89, atrDay: 20 })
    expect(v.marks).toContain('RECLAIM_PM')
    expect(intradayView(up, ctx).marks).toEqual([])
  })
  it('低位株の強い引けに目印', () => {
    const cs = Array.from({ length: 60 }, (_, i) => 120 + i * 0.1)
    const bars = cs.map((c, i) => ({ m: i < 30 ? 540 + i * 5 : 750 + (i - 30) * 5, o: i ? cs[i - 1] : c, h: c + 0.2, l: (i ? cs[i - 1] : c) - 0.2, c, v: 1000 }))
    const v = intradayView(bars, { prevClose: 100, ma25: 90, ma25Prev: 88, atrDay: 6 })
    expect(v.low_group).toBe(true)
    expect(v.marks).toContain('LOW_STRONG_CLOSE')
    expect(intradayView(bars.slice(0, 40), { prevClose: 100, ma25: 90, ma25Prev: 88, atrDay: 6 }).marks).not.toContain('LOW_STRONG_CLOSE')
  })
  it('ある日を時刻ごとに再現する', () => {
    const r = intradayReplay(up, ctx, { times: [570, 600], delay: 10 })
    expect(r.close).toBe(107.5)
    expect(r.steps.map((x: { time: string }) => x.time)).toEqual(['9:30', '10:00'])
    expect(r.steps[0].price).toBe(105)
    expect(r.steps[0].seen_delayed_at).toBe('9:40')
  })
  it('答え合わせ：大引けまでと翌日まで', () => {
    const days = { '2026-11-18': mk([100, 102]), '2026-11-19': mk([103, 99]) }
    const o = intradayOutcome({ date: '2026-11-18', price: 100 }, days)
    expect(o).toEqual({ rClose: 2, rNext: -1, final: true })
    const st = mergeIntradayStats(null, [{ signal: 'TAKE', ...o }, { signal: 'TAKE', rClose: -1, rNext: 1 }])
    expect(st.TAKE).toEqual({ n: 2, sumClose: 1, sumNext: 0, nNext: 2, winClose: 1 })
  })
})

describe('株探の業績（少し長期）', () => {
  const th = (cells: string[]) => '<tr>' + cells.map((c, i) => (i === 0 ? `<th>${c}</th>` : `<td>${c}</td>`)).join('') + '</tr>'
  const annual = '<table><tr><th>決算期</th><th>売上高</th><th>営業益</th><th>経常益</th><th>最終益</th><th>修正<br>1株益</th><th>修正<br>1株配</th><th>発表日</th></tr>'
    + th(['2025.09&nbsp;', '874,030', '71,702', '71,743', '31,667', '62.5', '17', '25/11/14'])
    + th(['<span>&nbsp;予&nbsp;</span>2027.09&nbsp;', '1,070,000', '66,000', '66,000', '35,000', '69.0', '22', '26/11/11']) + '</table>'
  const half = annual.replace('2025.09', '25.10-03')
  const qrow = (p: string, op: number, d: string) => th([p, '200,000', String(op), '1', '1', '1.0', '5.0', d])
  const quarter = '<table><tr><th>決算期</th><th>売上高</th><th>営業益</th><th>経常益</th><th>最終益</th><th>修正<br>1株益</th><th>売上営業<br>損益率</th><th>発表日</th></tr>'
    + qrow('25.01-03', 100, '25/05/15') + qrow('25.04-06', 100, '25/08/08') + qrow('25.07-09', 100, '25/11/14') + qrow('25.10-12', 100, '26/02/06')
    + qrow('26.01-03', 120, '26/05/13') + qrow('26.04-06', 150, '26/08/07') + '</table>'
  const r = parseKabutanFinance(annual + half + quarter)
  it('通期の実績と会社予想、四半期を発表日つきで読む（上期・下期の表は混ぜない）', () => {
    expect(r.annual.map((a: { period: string, forecast: boolean }) => a.period + (a.forecast ? '予' : ''))).toEqual(['2025.09', '2027.09予'])
    expect(r.annual[0].op).toBe(71702)
    expect(r.quarterly).toHaveLength(6)
    expect(r.quarterly[5].date).toBe('2026-08-07')
  })
  it('業績の勢い：直近の四半期を1年前と比べ、その時点までの数字だけを使う', () => {
    const m = earningsMomentum(r.quarterly)
    expect(m.op_yoy_pct).toBe(50)
    expect(m.streak).toBe(2)
    expect(earningsMomentum(r.quarterly, '2026-05-13').op_yoy_pct).toBe(20)
    expect(earningsMomentum(r.quarterly, '2026-02-06')).toBeNull()
  })
})

describe('5分足の取り込み', () => {
  it('最新の約定の1点と、まだ出来上がっていない足は使わない（一覧と個別で判定がずれないように）', () => {
    const base = Date.UTC(2026, 10, 19, 1, 50) / 1000 // 10:50 JST
    const json = {
      chart: {
        result: [{
          meta: { regularMarketTime: base + 607 }, // 11:00:07
          timestamp: [base, base + 300, base + 600, base + 607],
          indicators: { quote: [{ open: [1804.5, 1808.5, null, 1813], high: [1809, 1812, null, 1813], low: [1803, 1806, null, 1813], close: [1808, 1811, null, 1813], volume: [5800, 7200, null, 0] }] }
        }]
      }
    }
    const bars = splitFiveMin(json)['2026-11-19']
    expect(bars.map(b => b.m)).toEqual([650, 655])
    // 10:55 の足の途中（11:02）までしか来ていなければ、その足も除く
    json.chart.result[0].meta.regularMarketTime = base + 420
    expect(splitFiveMin(json)['2026-11-19'].map(b => b.m)).toEqual([650])
  })
})

describe('練習口座（シミュレーション）', () => {
  const flat = (m0, n, o, h, l, c) => Array.from({ length: n }, (_, i) => ({ m: m0 + i * 5, o, h, l, c, v: 1000 }))
  it('スイング：前の夜の候補を寄りで買い、目標に届いたら売る。同じ日は2回すすめない', () => {
    const st0 = paperNew({ capital: 1000000 })
    const cands = [{ code: '1111', name: 'A', date: '2026-11-18', pass: true, close: 1000, stop: 950, target: 1150, score: 80 }]
    const d1 = { date: '2026-11-19', cands, stocks: { 1111: { name: 'A', bars: flat(540, 6, 1005, 1010, 990, 1000) } } }
    const r1 = paperStep(st0, d1)
    expect(r1.opened).toHaveLength(1)
    const pos = r1.state.positions[0]
    expect(pos.qty % 100).toBe(0)
    expect(pos.qty * (pos.entry - 950)).toBeLessThanOrEqual(10000 + 1) // 損切りまでの損は資金の1%以内
    expect(paperStep(r1.state, d1).skipped).toBe(true)
    const r2 = paperStep(r1.state, { date: '2026-11-20', cands, stocks: { 1111: { name: 'A', bars: flat(540, 6, 1100, 1160, 1090, 1150) } } })
    expect(r2.trades[0].reason).toBe('目標')
    expect(r2.trades[0].exit).toBe(1150)
    expect(r2.state.positions).toHaveLength(0)
    expect(paperSummary(r2.state, r2.trades).tracks.swing.trades).toBe(1)
  })
  it('企業の行動を小さい会社まで広げる：universe に無い会社は自社株買い・増配で売買代金5,000万円以上だけ', () => {
    expect(keepEventRow({ kind: 'split', turnover_avg: 1e7 }, true)).toBe(true)
    expect(keepEventRow({ kind: 'buyback', turnover_avg: 6e7 }, false)).toBe(true)
    expect(keepEventRow({ kind: 'divup', turnover_avg: 4e7 }, false)).toBe(false)
    expect(keepEventRow({ kind: 'split', turnover_avg: 9e7 }, false)).toBe(false)
    expect(keepEventRow({ kind: 'buyback', turnover_avg: 9e7 }, false, 0)).toBe(false)
  })
  it('自社株買いの現金が足りない夜は、含み益の一番小さいスイングを前の夜のPTSで売る（swSellForEv）', () => {
    const P = [{ track: 'swing', code: 'A', entry: 1000, last: 1100, qty: 100 }, { track: 'swing', code: 'B', entry: 500, last: 480, qty: 100 }, { track: 'buyback', code: 'C', entry: 100, last: 90, qty: 100 }, { track: 'swing', code: 'D', entry: 100, last: 50, qty: 100, frozen: true }]
    expect(pickSwingToSell(P, 100000, 90000)).toEqual([]) // 足りていれば売らない
    expect(pickSwingToSell(P, 10000, 50000).map(x => x.code)).toEqual(['B']) // 含み損の B から。凍結・スイング以外は売らない
    expect(pickSwingToSell(P, 10000, 100000).map(x => x.code)).toEqual(['B', 'A'])
    const st = paperNew({ capital: 300000, swSellForEv: true, bbSizeRule: false, evPosPct: 50, maxPosPct: 50 })
    st.cash = 50000
    st.positions = [{ track: 'swing', code: '2222', name: 'S', entryDate: '2026-11-10', entry: 1000, qty: 200, last: 990, held: 5, stop: 900, target: 1300 }]
    const r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { name: 'A', turnover: 5e9, bars: flat(540, 6, 1000, 1010, 995, 1005), ctx: { prevClose: 1000 } }, 2222: { name: 'S', bars: flat(540, 6, 1200, 1300, 1190, 1290) } }, buybacks: [{ code: '1111', name: 'A', kind: 'buyback', score: 2 }] })
    const sold = r.trades.find(t => t.code === '2222')
    expect(sold.reason).toMatch(/PTS/)
    expect(sold.exit).toBe(Math.round(990 * 0.997 * 10) / 10) // 前の日の終値から0.3%不利。今日の目標到達は数えない
    expect(r.opened.some(x => x.code === '1111')).toBe(true)
  })
  it('もしもの試算：保存した入力（five ＋ 5分足以外）から作り直すと、もとの練習口座と同じ結果になり、別の決まりでも動かせる', () => {
    const cands = [{ code: '1111', name: 'A', date: '2026-11-18', pass: true, close: 1000, stop: 950, target: 1150, score: 80 }]
    const days = [
      { date: '2026-11-19', prevDate: '2026-11-18', cands, buybacks: [], usBear: false, stocks: { 1111: { name: 'A', turnover: 5e9, bars: flat(540, 6, 1005, 1010, 990, 1000) } } },
      { date: '2026-11-20', prevDate: '2026-11-19', cands, buybacks: [], usBear: false, stocks: { 1111: { name: 'A', turnover: 5e9, bars: flat(540, 6, 1100, 1160, 1090, 1150) } } }
    ]
    const fives = days.map(d => ({ date: d.date, bars: { 1111: d.stocks[1111].bars.map(b => [b.m, b.o, b.h, b.l, b.c, b.v]) }, paper: paperInputOf(d) }))
    expect(fives[0].paper.ctx[1111].bars).toBeUndefined()
    expect(fives[0].paper.ctx[1111].turnover).toBe(5e9)
    const back = paperInputFromFive(fives[0])
    expect(back.stocks[1111].bars).toEqual(days[0].stocks[1111].bars)
    expect(paperInputFromFive({ date: '2026-11-19', bars: {} })).toBeNull()
    let st = paperNew({ capital: 1000000 })
    for (const d of days) st = paperStep(st, d).state
    const r = paperReplay(fives.map(paperInputFromFive).reverse(), { capital: 1000000 })
    expect(r.summary.equity).toBe(st.history[st.history.length - 1].equity)
    expect(r.trades).toHaveLength(1)
    const big = paperReplay(fives.map(paperInputFromFive), { capital: 1000000, riskPct: 3, maxPosPct: 100 })
    expect(big.summary.equity - 1000000).toBeGreaterThan(r.summary.equity - 1000000)
  })
  it('寄りが候補の終値より2%を超えて高いと買わない', () => {
    const cands = [{ code: '1111', date: '2026-11-18', pass: true, close: 1000, stop: 950, target: 1150, score: 80 }]
    const r = paperStep(paperNew(), { date: '2026-11-19', cands, stocks: { 1111: { bars: flat(540, 6, 1030, 1040, 1020, 1030) } } })
    expect(r.opened).toHaveLength(0)
  })
  it('低位株の強い引け：翌日に損切り−8%に当たったら損切り', () => {
    const st = paperNew()
    st.positions.push({ track: 'low', code: '2222', name: 'B', entryDate: '2026-11-18', entry: 300, qty: 1000, last: 300, held: 0 })
    st.cash -= 300000
    const r = paperStep(st, { date: '2026-11-19', stocks: { 2222: { bars: [{ m: 540, o: 290, h: 292, l: 270, c: 272, v: 1 }] } } })
    expect(r.trades[0].reason).toBe('損切り')
    expect(r.trades[0].exit).toBeLessThan(276.1)
  })
})

describe('自社株買いの発表', () => {
  it('取得の決定だけを拾い、状況・結果の報告や立会外は除く', () => {
    expect(isBuybackTitle('自己株式取得に係る事項の決定に関するお知らせ')).toBe(true)
    expect(isBuybackTitle('自己株式の取得に係る事項の決定及び自己株式の消却に関するお知らせ')).toBe(true)
    expect(isBuybackTitle('自己株式の取得状況に関するお知らせ')).toBe(false)
    expect(isBuybackTitle('自己株式の取得結果及び取得終了に関するお知らせ')).toBe(false)
    expect(isBuybackTitle('自己株式の取得及び自己株式立会外買付取引（ToSTNeT-3）による自己株式の買付けに関するお知らせ')).toBe(false)
  })
  it('15:00以降・決算と別の日・対象の銘柄だけを選ぶ', () => {
    const rows = [
      { time: '15:30', code: '1111', name: 'A', title: '自己株式取得に係る事項の決定に関するお知らせ' },
      { time: '13:00', code: '2222', name: 'B', title: '自己株式取得に係る事項の決定に関するお知らせ' },
      { time: '15:00', code: '3333', name: 'C', title: '2027年3月期 第2四半期決算短信' },
      { time: '15:00', code: '3333', name: 'C', title: '自己株式取得に係る事項の決定に関するお知らせ' },
      { time: '16:00', code: '4444', name: 'D', title: '自己株式取得に係る事項の決定に関するお知らせ' }
    ]
    expect(pickBuybacks(rows, ['1111', '2222', '3333']).map(r => r.code)).toEqual(['1111'])
  })
  it('呼値にそろえる', () => {
    expect(tickFloor(384.54)).toBe(384)
    expect(tickFloor(3999)).toBe(3995)
    expect(tickFloor(12345)).toBe(12340)
  })
  it('練習口座：寄りが前日の終値×1.02以下なら寄りで買い、大引けで売る', () => {
    const bars = [{ m: 540, o: 1010, h: 1030, l: 1005, c: 1025, v: 1 }, { m: 925, o: 1025, h: 1030, l: 1020, c: 1028, v: 1 }]
    const r = paperStep(paperNew(), { date: '2026-11-20', stocks: { 1111: { name: 'A', bars, ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111', name: 'A' }] })
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0]).toMatchObject({ track: 'bb', entry: 1010, exit: 1028, reason: '大引け' })
    const gap = paperStep(paperNew(), { date: '2026-11-20', stocks: { 1111: { name: 'A', bars: [{ ...bars[0], o: 1030 }, bars[1]], ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111' }] })
    expect(gap.trades).toHaveLength(0)
  })
})

describe('自社株買いの良い条件', () => {
  it('久しぶり・15時台前半・25日線の下を数える', () => {
    expect(buybackScore({ time: '15:00', dev25: -3, repeat: false }).score).toBe(3)
    expect(buybackScore({ time: '15:30', dev25: 4, repeat: true }).score).toBe(0)
    expect(buybackScore({ time: '16:00', dev25: null, repeat: null }).score).toBe(0)
  })
})

describe('企業の行動の開示（自社株買い・増配・株式分割）', () => {
  it('種類を分け、15時以降・決算と別の日だけを選ぶ', () => {
    expect(isDividendUpTitle('配当予想の修正（増配）に関するお知らせ')).toBe(true)
    expect(isDividendUpTitle('配当予想の修正（減配）に関するお知らせ')).toBe(false)
    expect(isSplitTitle('株式分割及び定款の一部変更に関するお知らせ')).toBe(true)
    const rows = [
      { time: '15:00', code: '1111', name: 'A', title: '剰余金の配当（増配）に関するお知らせ' },
      { time: '15:30', code: '2222', name: 'B', title: '株式分割に関するお知らせ' },
      { time: '15:30', code: '3333', name: 'C', title: '自己株式取得に係る事項の決定に関するお知らせ' },
      { time: '15:30', code: '3333', name: 'C', title: '配当予想の修正（増配）に関するお知らせ' },
      { time: '14:00', code: '4444', name: 'D', title: '株式分割に関するお知らせ' }
    ]
    const ev = pickEvents(rows)
    expect(ev.map(e => [e.code, e.kind])).toEqual([['1111', 'divup'], ['2222', 'split'], ['3333', 'buyback']])
  })
  it('練習口座：株式分割は寄りで買い、5営業日目の引けで売る', () => {
    const day = (o, c) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    let st = paperNew()
    let r = paperStep(st, { date: '2026-11-20', stocks: { 2222: { name: 'B', bars: day(1005, 1010), ctx: { prevClose: 1000 } } }, buybacks: [{ code: '2222', kind: 'split' }] })
    expect(r.state.positions[0]).toMatchObject({ track: 'split', entry: 1005, held: 1 })
    st = r.state
    for (const d of ['2026-11-21', '2026-11-24', '2026-11-25']) {
      st = paperStep(st, { date: d, stocks: { 2222: { bars: day(1010, 1020) } } }).state
    }
    expect(st.positions).toHaveLength(1)
    r = paperStep(st, { date: '2026-11-26', stocks: { 2222: { bars: day(1020, 1030) } } })
    expect(r.trades[0]).toMatchObject({ track: 'split', exit: 1030 })
    expect(r.state.positions).toHaveLength(0)
  })
  it('練習口座：evOrder が mom なら、企業の行動は20日の騰落の大きい順に買う', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c) + 5, l: Math.min(o, c) - 5, c, v: 1000 }]
    const stocks = { 1111: { bars: day(1000, 1010), ctx: { prevClose: 1000 }, r20: -5 }, 2222: { bars: day(1000, 1010), ctx: { prevClose: 1000 }, r20: 12 } }
    const bb = [{ code: '1111', kind: 'split' }, { code: '2222', kind: 'buyback' }]
    const a = paperStep(paperNew({ slipPct: 0, bbMax: 1 }), { date: '2026-11-20', stocks, buybacks: bb })
    const b = paperStep(paperNew({ slipPct: 0, bbMax: 1, evOrder: 'mom' }), { date: '2026-11-20', stocks, buybacks: bb })
    expect(a.state.positions.map(x => x.code).concat(a.trades.map(x => x.code))).toEqual(['1111'])
    expect(b.state.positions.map(x => x.code).concat(b.trades.map(x => x.code))).toEqual(['2222'])
  })
  it('below200：200日の平均より下か。桁の誤りの日は除く。200日に足りなければ null', () => {
    const mk = (a: number[]) => a.map((c, i) => ({ date: String(i), o: c, h: c, l: c, c, v: 1 }))
    expect(below200(mk(Array(150).fill(100)))).toBe(null)
    expect(below200(mk([...Array(199).fill(100), 90]))).toBe(true)
    expect(below200(mk([...Array(199).fill(100), 110]))).toBe(false)
    expect(below200(mk([...Array(150).fill(100), 10, 10, ...Array(49).fill(100), 99]))).toBe(true)
  })
  it('parseBuybackPdf：取得の割合（変更後）・期間・方法を取り出す', () => {
    const txt = '（２）取得しうる株式の総数 500 百万株（上限） 610 百万株（上限）\n（発行済株式総数（自己株式を除く）に対する割合 4.22％） に対する割合 5.18％）\n（４）取得期間 2026 年８月５日～2027 年８月４日\n（５）取得方法 市場買付'
    expect(parseBuybackPdf(txt)).toEqual({ pct: 5.18, days: 364, method: '市場' })
    expect(parseBuybackPdf('何もない').pct).toBe(null)
  })
  it('練習口座：bbSizeRule なら、自社株買いは良い条件＋割合2%以上で2つ以上だけ買う', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c) + 5, l: Math.min(o, c) - 5, c, v: 1000 }]
    const stocks = { 1111: { bars: day(1000, 1010), ctx: { prevClose: 1000 } }, 2222: { bars: day(1000, 1010), ctx: { prevClose: 1000 } }, 3333: { bars: day(1000, 1010), ctx: { prevClose: 1000 } } }
    const bb = [{ code: '1111', kind: 'buyback', score: 1, pct: 1.5 }, { code: '2222', kind: 'buyback', score: 1, pct: 3 }, { code: '3333', kind: 'buyback', score: 2, pct: 0.5 }]
    const r = paperStep(paperNew({ slipPct: 0, maxPosPct: 10, bbSizeRule: true }), { date: '2026-11-20', stocks, buybacks: bb })
    expect(r.trades.map(x => x.code).sort()).toEqual(['2222', '3333'])
    const r0 = paperStep(paperNew({ slipPct: 0, maxPosPct: 10 }), { date: '2026-11-20', stocks, buybacks: bb })
    expect(r0.trades.length).toBe(3)
  })
  it('練習口座：evTurnCap があれば、企業の行動は売買代金の◯%までしか買わない', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c) + 5, l: Math.min(o, c) - 5, c, v: 1000 }]
    const r = paperStep(paperNew({ slipPct: 0, evPosPct: 70, evTurnCap: 1.5 }), { date: '2026-11-20', stocks: { 1111: { bars: day(1000, 1010), ctx: { prevClose: 1000 }, turnover: 2e7 } }, buybacks: [{ code: '1111', kind: 'buyback' }] })
    expect(r.trades[0].qty).toBe(300)
  })
  it('練習口座：swReserve があれば、スイングは現金をその%まで残す', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const cands = [{ code: '1111', date: '2026-11-19', close: 1000, stop: 990, pass: true, score: 90 }]
    const mk = (r: number | null) => paperStep(paperNew({ slipPct: 0, riskPct: 100, maxPosPct: 100, swReserve: r }), { date: '2026-11-20', stocks: { 1111: { bars: day(1000, 1010) } }, cands })
    expect(mk(null).state.positions[0].qty).toBe(1000)
    expect(mk(70).state.positions[0].qty).toBe(300)
  })
  it('練習口座：ma200Half なら、1306 が200日線より下の日はスイングの株数を半分にする', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const cands = [{ code: '1111', date: '2026-11-19', close: 1000, stop: 900, pass: true, score: 90 }]
    const mk = (below: boolean) => paperStep(paperNew({ slipPct: 0, riskPct: 1, maxPosPct: 100, ma200Half: true }), { date: '2026-11-20', stocks: { 1111: { bars: day(1000, 1010) }, 1306: { bars: day(3000, 3000), below200: below } }, cands })
    expect(mk(false).state.positions.find(x => x.code === '1111')?.qty).toBe(100)
    expect(mk(true).state.positions.find(x => x.code === '1111')).toBeUndefined()
  })
  it('練習口座：evStopPct があれば、自社株買い・増配は場中に寄値から −evStopPct% で損切りする', () => {
    const bars = [{ m: 540, o: 1000, h: 1005, l: 990, c: 995, v: 1 }, { m: 600, o: 995, h: 996, l: 940, c: 960, v: 1 }, { m: 900, o: 960, h: 980, l: 955, c: 975, v: 1 }]
    const r = paperStep(paperNew({ slipPct: 0, evStopPct: 5 }), { date: '2026-11-20', stocks: { 1111: { bars, ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111', kind: 'buyback' }] })
    expect(r.trades[0]).toMatchObject({ exit: 950 })
    const r2 = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-20', stocks: { 1111: { bars, ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111', kind: 'buyback' }] })
    expect(r2.trades[0]).toMatchObject({ exit: 975 })
  })
  it('練習口座：evPosPct があれば、企業の行動はその%まで買う（決算後のドリフトは maxPosPct のまま）', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c) + 5, l: Math.min(o, c) - 5, c, v: 1000 }]
    const st = paperNew({ slipPct: 0, maxPosPct: 30, evPosPct: 70 })
    const r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { bars: day(1000, 1010), ctx: { prevClose: 1000 } }, 2222: { bars: day(1000, 1010), ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111', kind: 'split' }, { code: '2222', kind: 'pead' }] })
    const q = Object.fromEntries(r.state.positions.map(x => [x.code, x.qty]))
    expect(q['1111']).toBe(700)
    expect(q['2222']).toBe(300)
  })
  it('練習口座：決算後のドリフトは、寄りが前の日の終値より低ければ買わない', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c) + 5, l: Math.min(o, c) - 5, c, v: 1000 }]
    const st = paperNew({})
    const r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { bars: day(990, 1000), ctx: { prevClose: 1000 } }, 2222: { bars: day(1000, 1010), ctx: { prevClose: 1000 } } }, buybacks: [{ code: '1111', kind: 'pead' }, { code: '2222', kind: 'pead' }] })
    expect(r.state.positions.map(x => [x.track, x.code])).toEqual([['pead', '2222']])
  })
  it('練習口座：決算後のドリフトは窓が大きくても15%までなら寄りで買い、5日目の引けで売る。上限は peadMax', () => {
    const day = (o, c) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const st = paperNew({ peadMax: 1 })
    const r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { bars: day(1080, 1100), ctx: { prevClose: 1000 } }, 2222: { bars: day(1200, 1210), ctx: { prevClose: 1000 } }, 3333: { bars: day(1050, 1060), ctx: { prevClose: 1000 } } }, buybacks: [{ code: '2222', kind: 'pead' }, { code: '1111', kind: 'pead' }, { code: '3333', kind: 'pead' }] })
    // 2222 は窓 +20% で見送り、1111 を買い、3333 は上限で見送り
    expect(r.state.positions.map(x => [x.track, x.code, x.entry])).toEqual([['pead', '1111', 1080]])
  })
  it('急落の合図：5日で −15% 以下・10日ぶり・300円以上', () => {
    const mk = (cs: number[]) => cs.map((c, i) => ({ date: 'd' + i, o: c, h: c, l: c, c, v: 1 }))
    const flat = Array(20).fill(1000)
    expect(crashSignal(mk([...flat, 1000, 1000, 1000, 1000, 800]))).toMatchObject({ hit: true, first: true, r5: -20 })
    // 300円未満は合図にしない
    expect(crashSignal(mk([...Array(20).fill(300), 280, 270, 260, 250, 240])).hit).toBe(false)
    // 10日以内にすでに合図が出ていれば最初ではない
    expect(crashSignal(mk([...flat, 800, 800, 800, 800, 800, 800, 800, 700, 650, 600, 550, 500])).first).toBe(false)
  })
  it('練習口座：急落の反発は寄りで買い、5日目の引けで売る。−20%で非常用の損切り', () => {
    const day = (o: number, c: number, l = Math.min(o, c)) => [{ m: 540, o, h: Math.max(o, c), l, c, v: 1 }]
    let st = paperNew({ slipPct: 0, crashPosPct: 10 })
    let r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { name: 'A', bars: day(1000, 1010), turnover: 5e8, crash: { hit: true, r5: -20 } } } })
    expect(r.state.positions[0]).toMatchObject({ track: 'crash', entry: 1000, stop: 800, held: 1 })
    st = r.state
    for (const d of ['2026-11-24', '2026-11-25', '2026-11-26']) st = paperStep(st, { date: d, stocks: { 1111: { bars: day(1010, 1020) } } }).state
    expect(st.positions).toHaveLength(1)
    r = paperStep(st, { date: '2026-11-27', stocks: { 1111: { bars: day(1020, 1050) } } })
    expect(r.trades[0]).toMatchObject({ track: 'crash', exit: 1050 })
    const s2 = paperStep(paperNew({ slipPct: 0, crashPosPct: 10 }), { date: '2026-11-20', stocks: { 1111: { bars: day(1000, 1010), turnover: 5e8, crash: { hit: true, r5: -20 } } } }).state
    const r2 = paperStep(s2, { date: '2026-11-24', stocks: { 1111: { bars: day(900, 850, 790) } } })
    expect(r2.trades[0]).toMatchObject({ track: 'crash', exit: 800 })
  })
  it('練習口座：急落の反発は、相場全体の急落（1306 の5日が −4% 以下）のときだけ、同時に crashOpenMax まで', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const crashStock = (n: string) => ({ [n]: { name: n, bars: day(400, 410), turnover: 5e8, crash: { hit: true, r5: -20 } } })
    const etf = (r5: number) => ({ 1306: { bars: day(3000, 3000), turnover: 1e9, crash: { hit: false, r5 } } })
    const calm = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-20', stocks: { ...crashStock('1111'), ...etf(-1) } })
    expect(calm.state.positions).toHaveLength(0)
    const wide = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-20', stocks: { ...crashStock('1111'), ...crashStock('2222'), ...etf(-6) } })
    expect(wide.state.positions.map(x => x.track)).toEqual(['crash', 'crash'])
    expect(wide.state.positions[0].qty).toBe(100)
    const next = paperStep(wide.state, { date: '2026-11-24', stocks: { ...crashStock('3333'), 1111: { bars: day(410, 410) }, 2222: { bars: day(410, 410) }, ...etf(-6) } })
    expect(next.state.positions.filter(x => x.track === 'crash').map(x => x.code)).toEqual(['1111', '2222'])
  })
  it('練習口座：swingMaxPrice があれば、終値がその値段以上のスイングの候補は買わない', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const cands = [{ code: '1111', date: '2026-11-19', close: 2000, stop: 1900, pass: true, score: 90 }, { code: '2222', date: '2026-11-19', close: 1000, stop: 950, pass: true, score: 80 }]
    const r = paperStep(paperNew({ slipPct: 0, swingMaxPrice: 1500 }), { date: '2026-11-20', stocks: { 1111: { bars: day(2000, 2010) }, 2222: { bars: day(1000, 1010) } }, cands })
    expect(r.state.positions.map(x => x.code)).toEqual(['2222'])
  })
  it('練習口座：つられ下げは、全体の窓の真ん中が −2.5% 以下の日だけ、窓 −5% 以下の株を寄りで買う', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const many = (g: number) => Object.fromEntries(Array.from({ length: 120 }, (_, i) => [String(5000 + i), { bars: day(1000 * (1 + g / 100), 1000), ctx: { prevClose: 1000 }, turnover: 1e7 }]))
    const target = { 1111: { name: 'A', bars: day(930, 950), ctx: { prevClose: 1000 }, turnover: 5e8 } }
    const r = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-24', stocks: { ...many(-3), ...target } })
    expect(r.state.positions.map(x => [x.track, x.code, x.holdDays])).toEqual([['tsurare', '1111', 5]])
    const r2 = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-24', stocks: { ...many(-1), ...target } })
    expect(r2.state.positions).toHaveLength(0)
  })
  it('練習口座：米国の下げ相場では usBearSwingMax までしか新しいスイングを買わない', () => {
    const day = (o, c) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const cands = ['1111', '2222'].map((code, i) => ({ code, date: '2026-11-19', pass: true, close: 1000, stop: 950, target: 1150, score: 90 - i }))
    const stocks = { 1111: { bars: day(1000, 1005) }, 2222: { bars: day(1000, 1005) } }
    const a = paperStep(paperNew({ usBearSwingMax: 1 }), { date: '2026-11-20', stocks, cands, usBear: true })
    const b = paperStep(paperNew({ usBearSwingMax: 1 }), { date: '2026-11-20', stocks, cands, usBear: false })
    expect(a.state.positions.filter(x => x.track === 'swing')).toHaveLength(1)
    expect(b.state.positions.filter(x => x.track === 'swing')).toHaveLength(2)
  })
  it('練習口座：swingTargetR で目標を置き直す（0 なら目標なし）', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const cands = [{ code: '1111', date: '2026-11-19', pass: true, close: 1000, stop: 950, target: 1150, score: 90 }]
    const stocks = { 1111: { bars: day(1000, 1005) } }
    expect(paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-20', stocks, cands }).state.positions[0].target).toBe(1150)
    expect(paperStep(paperNew({ slipPct: 0, swingTargetR: 5 }), { date: '2026-11-20', stocks, cands }).state.positions[0].target).toBe(1250)
    expect(paperStep(paperNew({ slipPct: 0, swingTargetR: 0 }), { date: '2026-11-20', stocks, cands }).state.positions[0].target).toBeNull()
  })
  it('練習口座：TOPIX 連動ETF が前の日に −3% 以下なら寄りで ETF を買い、20日持つ', () => {
    const day = (o: number, c: number) => [{ m: 540, o, h: Math.max(o, c), l: Math.min(o, c), c, v: 1 }]
    const r = paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-24', stocks: { 1306: { bars: day(380, 385), prevR1: -4 } } })
    expect(r.state.positions.map(x => [x.track, x.code, x.holdDays, x.qty])).toEqual([['etfdip', '1306', 20, 520]])
    expect(paperStep(paperNew({ slipPct: 0 }), { date: '2026-11-24', stocks: { 1306: { bars: day(380, 385), prevR1: -2 } } }).state.positions).toHaveLength(0)
  })
  it('世界の目安：前の夜の S&P500 −2% 以下と、米国の下げ相場を見分ける', () => {
    const ser = (vals: number[]) => vals.map((c, i) => ({ date: '2026-10-' + String(i + 1).padStart(2, '0'), c }))
    const spx = ser([...Array(20).fill(100), 96, 93])
    const w = worldBrief({ spx, sox: [], vix: [], jpy: [], tnx: [] }, '2026-10-23')
    expect(w.spx).toBeCloseTo(-3.13, 1)
    expect(w.usBear).toBe(true)
    expect(w.notes[0]).toMatch(/寄りで投げない/)
    expect(worldBrief({ spx, sox: [], vix: [], jpy: [], tnx: [] }, '2026-10-20').usBear).toBe(false)
  })
})

describe('引け前の目印・企業の行動・PTSの記録', () => {
  const b = (m: number, o: number, h: number, l: number, c: number) => ({ m, o, h, l, c, v: 1000 })
  it('低位株の強い引け：寄りの上放れ・場中の利確・損切り・13時', () => {
    expect(lowExit([b(540, 110, 112, 109, 111)], 100)).toEqual({ exit: 110, reason: '利確（寄り）' })
    expect(lowExit([b(540, 101, 106, 100, 104)], 100)).toEqual({ exit: 105, reason: '利確' })
    expect(lowExit([b(540, 99, 106, 91, 95)], 100)).toEqual({ exit: 92, reason: '損切り' })
    expect(lowExit([b(540, 100, 101, 99, 100), b(780, 102, 103, 101, 102)], 100)).toEqual({ exit: 102, reason: '翌日13時' })
  })
  it('翌日の5分足が無ければ数えない', () => {
    expect(marksOutcomes([{ code: '1111', date: '2026-11-19', day: [b(540, 1, 1, 1, 1)], next: [], ctx: {} }])).toEqual([])
  })
  it('目印の累計は同じ日を2回足さない', () => {
    const m = [{ mark: 'RECLAIM_PM', pct: 1, rC: 0.5 }, { mark: 'RECLAIM_PM', pct: -2, rC: 0 }]
    let st = mergeMarks(null, '2026-11-19', m)
    st = mergeMarks(st, '2026-11-19', m)
    expect(st.days).toEqual(['2026-11-19'])
    expect(st.groups.RECLAIM_PM).toEqual({ n: 2, sum: -1, win: 1, sumC: 0.5 })
  })
  const bars = [
    { date: '2026-11-19', o: 100, h: 101, l: 99, c: 100 },
    { date: '2026-11-20', o: 101, h: 104, l: 100, c: 103 },
    { date: '2026-11-21', o: 103, h: 105, l: 102, c: 104 },
    { date: '2026-11-24', o: 104, h: 106, l: 103, c: 105 }
  ]
  const bench = bars.map(x => ({ ...x, o: 100, c: 100 }))
  it('企業の行動：寄指で約定したか、寄り→引け、全体との差', () => {
    const r = nextDayOutcome(bars, { date: '2026-11-19', ref: 100, limit: 102 }, bench)
    expect(r).toMatchObject({ final: true, nextDate: '2026-11-20', gap_pct: 1, filled: true, oc_pct: 1.98, cc_pct: 3, ex_oc_pct: 1.98 })
    expect(nextDayOutcome(bars, { date: '2026-11-19', ref: 100, limit: 100 }).filled).toBe(false)
    expect(nextDayOutcome(bars, { date: '2026-11-24', ref: 105 })).toMatchObject({ final: false, pending: true })
    expect(nextDayOutcome(bars, { date: '2026-11-19', limitPct: 0.5 })).toMatchObject({ limit: 100, filled: false, cc_pct: 3 })
  })
  it('株式分割：5営業日目がまだ無ければ final にしない', () => {
    expect(nextDayOutcome(bars, { date: '2026-11-19', ref: 100, hold: 3 })).toMatchObject({ final: true, holdDate: '2026-11-24', hold_pct: 3.96 })
    expect(nextDayOutcome(bars, { date: '2026-11-19', ref: 100, hold: 5 }).final).toBe(false)
  })
  it('PTS：PTSの値段からの寄りの差', () => {
    expect(nextDayOutcome(bars, { date: '2026-11-19', ref: 100, ref2: 110 })).toMatchObject({ gap2_pct: -8.18, cc2_pct: -6.36 })
  })
  it('累計：約定しなかった分は寄り→引けに数えず、counted は足さない', () => {
    const st = mergeNextDay(null, [
      { group: 'buyback_s2', final: true, filled: true, oc_pct: 1, ex_oc_pct: 0.5, cc_pct: 2, gap_pct: 1 },
      { group: 'buyback_s2', final: true, filled: false, oc_pct: 3, cc_pct: 5, gap_pct: 3 },
      { group: 'buyback_s2', final: true, counted: true, filled: true, oc_pct: 9, cc_pct: 9, gap_pct: 0 },
      { group: 'buyback_s2', final: false }
    ])
    expect(st.groups.buyback_s2).toMatchObject({ n: 2, filled: 1, sumOC: 1, sumExOC: 0.5, winOC: 1, sumCC: 7, sumGap: 4 })
  })
})

describe('答えが出終わった記録をまとめる', () => {
  it('同じ id は新しいほうで上書きし、日付順に並べる', () => {
    const m = archiveMerge([{ id: 'a', date: '2026-10-02', v: 1 }, { id: 'b', date: '2026-10-01' }], [{ id: 'a', date: '2026-10-02', v: 2 }])
    expect(m.map(r => r.id)).toEqual(['b', 'a'])
    expect(m[1].v).toBe(2)
  })
})

describe('急騰した株の押し目（反発を確認）', () => {
  // 30日の助走（売買代金は十分）→ +20% の高値引け → 押し → 反発の陽線
  const mk = (closes: number[]) => closes.map((c, i) => ({ date: `2026-01-${String(i + 1).padStart(2, '0')}`, o: c, h: c, l: c, c, v: 1e6 }))
  const run = () => {
    const d: { date: string, o: number, h: number, l: number, c: number, v: number }[] = mk(Array(30).fill(1000))
    d.push({ date: 'S', o: 1010, h: 1200, l: 1005, c: 1200, v: 2e6 }) // 急騰（高値引け）
    d.push({ date: 'P1', o: 1190, h: 1220, l: 1150, c: 1160, v: 1e6 })
    d.push({ date: 'P2', o: 1150, h: 1160, l: 1100, c: 1110, v: 1e6 }) // 1220 から −9.8%
    return d
  }
  it('押したあと初めて前日の高値を超える陽線で引けた日に合図', () => {
    const d = run()
    expect(surgePullback(d)).toBeNull()
    d.push({ date: 'R', o: 1115, h: 1175, l: 1110, c: 1170, v: 1e6 })
    expect(surgePullback(d)).toMatchObject({ surgeDate: 'S', high: 1220, low: 1100, stop: 1089, dropPct: 9.8 })
  })
  it('合図の次の日はもう出さない（最初の反発だけ）', () => {
    const d = run()
    d.push({ date: 'R', o: 1115, h: 1175, l: 1110, c: 1170, v: 1e6 })
    d.push({ date: 'R2', o: 1170, h: 1200, l: 1165, c: 1195, v: 1e6 })
    expect(surgePullback(d)).toBeNull()
  })
  it('上げ幅の61.8%より深く下げたら崩れたとみる', () => {
    const d = run()
    d.push({ date: 'X', o: 1100, h: 1100, l: 1040, c: 1050, v: 1e6 })
    d.push({ date: 'R', o: 1055, h: 1120, l: 1050, c: 1115, v: 1e6 })
    expect(surgePullback(d)).toBeNull()
  })
  it('練習口座：寄りで買い、損切り・3R・10日目の引け', () => {
    const st = paperNew({ capital: 1000000 })
    const day = (o: number, h: number, l: number, c: number) => [{ m: 540, o, h, l, c, v: 1000 }]
    let r = paperStep(st, { date: '2026-02-02', stocks: { 1111: { name: 'テスト', bars: day(1000, 1010, 990, 1005), turnover: 1e9, surge: { stop: 950, surgeDate: '2026-01-20', dropPct: 10 } } } })
    expect(r.opened[0]).toMatchObject({ track: 'surge', code: '1111', entry: 1001, stop: 950, target: 1154, maxDays: 10 })
    r = paperStep(r.state, { date: '2026-02-03', stocks: { 1111: { bars: day(1010, 1160, 1005, 1150) } } })
    expect(r.trades[0]).toMatchObject({ track: 'surge', exit: 1154, reason: '目標' })
  })
})

describe('低位株の急騰の追いかけ（練習口座・攻めだけ）', () => {
  const bar = (m: number, o: number, h: number, l: number, c: number) => ({ m, o, h, l, c, v: 1000 })
  const ctx = { prevClose: 100, atrDay: 6 }
  it('基本の口座（chaseMax 0）では動かない', () => {
    const r = paperStep(paperNew(), { date: '2026-11-20', stocks: { 1111: { bars: [bar(570, 100, 112, 100, 111), bar(575, 111, 115, 110, 114), bar(895, 114, 120, 113, 118)], ctx } } })
    expect(r.trades.filter((t: { track: string }) => t.track === 'chase')).toHaveLength(0)
  })
  it('+10%で引けた足の次の足で買い、大引けで売る／−8%で損切り', () => {
    const st = paperNew({ chaseMax: 1, riskPct: 5, maxPosPct: 50 })
    let r = paperStep(st, { date: '2026-11-20', stocks: { 1111: { name: 'テスト', bars: [bar(570, 100, 112, 100, 111), bar(575, 111, 115, 110, 114), bar(895, 114, 120, 113, 118)], ctx } } })
    const t = r.trades.find((x: { track: string }) => x.track === 'chase')
    expect(t).toMatchObject({ entry: 111.1, exit: 117.9, reason: '大引け' })
    r = paperStep(st, { date: '2026-11-21', stocks: { 1111: { bars: [bar(570, 100, 112, 100, 111), bar(575, 111, 112, 100, 101), bar(895, 101, 103, 99, 100)], ctx } } })
    expect(r.trades.find((x: { track: string }) => x.track === 'chase')).toMatchObject({ reason: '損切り', exit: 102.1 })
  })
})

describe('現金と資金の自動計算', () => {
  it('基準の日より後の買いを引き、売りを足す。予定・見送りは数えない', () => {
    const r = cashNow({ cashBase: 100000, cashBaseAt: '2026-11-18' }, [
      { id: 'a', date: '2026-11-18', entry: 500, qty: 100, status: 'open', last: 520 },
      { id: 'b', date: '2026-11-20', entry: 300, qty: 100, status: 'closed', exit: 280, exitDate: '2026-11-21' },
      { id: 'c', date: '2026-11-20', entry: 400, qty: 100, status: 'skipped' },
      { id: 'd', date: '2026-11-21', entry: 200, qty: 100, status: 'open', last: 210 },
      { id: 'e', date: '2026-11-21', qty: 100, status: 'open' },
      { id: 'f', date: '2026-10-01', entry: 200, qty: 1000, status: 'open', last: 90, frozen: true }
    ])
    expect(r).toMatchObject({ cash: 100000 - 30000 + 28000 - 20000, invested: 52000 + 21000, unknown: ['e'], frozenValue: 90000 })
    expect(r.capital).toBe(r.cash + r.invested)
  })

  it('parseTanshin: 今期の累計・通期予想・修正の有無・自己資本比率・進み具合を読む（折り返し・△・令和の年も）', () => {
    const text = [
      '                 2027 年３月期 中間決算短信〔日本基準〕（連結）',
      '',
      '１．2027 年３月期中間期の連結業績（2026 年４月１日～2026 年９月 30 日）',
      '（１）連結経営成績（累計）',
      '                        売 上 高                           営業利益                     経常利益',
      '                        百万円              ％          百万円                ％        百万円             ％              百万円',
      '2027 年３月期中間期          1,647             0.7             32       △42.6           27       △46.6                  8',
      '                                                                                                                 △76.1',
      '2026 年３月期中間期          1,635             4.0             56        36.0           52        39.7                 36 51.8',
      '（２）連結財政状態',
      '                        総 資 産                           純 資 産                  自己資本比率                      １株当たり純',
      '2027 年３月期中間期                        1,376                             101                      7.3                        125.85',
      '３．2027 年３月期の連結業績予想（2026 年４月１日～2027 年３月 31 日）',
      '    通期      3,500 5.4 130 11.7 120 9.0 90 －   46.15',
      '（注）直近に公表されている業績予想からの修正の有無：有'
    ].join('\n')
    const r = parseTanshin(text)
    expect(r.kind).toBe('half')
    expect(r.actual).toEqual({ sales: 1647, salesYoY: 0.7, op: 32, opYoY: -42.6, ord: 27, ordYoY: -46.6, net: 8, netYoY: -76.1 })
    expect(r.forecast).toMatchObject({ sales: 3500, op: 130, netYoY: null })
    expect(r.revised).toBe(true)
    expect(r.eqRatio).toBe(7.3)
    expect(r.progressOp).toBe(24.6)
    const era = parseTanshin('2026年12月期 第３四半期決算短信\n（１）連結経営成績（累計）\n 百万円 ％\n ８年12月期第３四半期      13,044  0.7     438 △12.9   536 △10.4        593   69.7\n')
    expect(era.kind).toBe('quarter')
    expect(era.actual).toMatchObject({ sales: 13044, opYoY: -12.9, netYoY: 69.7 })
  })
})

describe('資金の下げの歯止め（11/21）', () => {
  it('一番高いときから25%以上下げたら止める。入金で高いときが更新される前提', () => {
    expect(drawdownStop({ capitalPeak: 600000 }, 460000).stop).toBe(false)
    expect(drawdownStop({ capitalPeak: 600000 }, 450000).stop).toBe(true)
    expect(drawdownStop({ capitalPeak: 600000, ddStopPct: 20 }, 470000).stop).toBe(true)
    expect(drawdownStop({}, 500000).stop).toBe(false)
    const c = cashNow({ cash: 100000, cashBase: 100000, cashBaseAt: '2026-11-20', capitalPeak: 200000 }, [])
    expect(c.capitalPeak).toBe(200000)
    expect(c.drawdown_pct).toBe(-50)
    expect(c.dd_stop).toBe(true)
    expect(cashNow({ cash: 300000, cashBase: 300000, cashBaseAt: '2026-11-20', capitalPeak: 200000 }, []).capitalPeak).toBe(300000)
  })
  it('買う前チェックも止める', () => {
    const r = preTradeCheck({ code: '1111', price: 1000, atr: 20, settings: { capital: 400000, capitalPeak: 600000, riskPct: 1, maxPosPct: 62, cash: 400000 }, positions: [] })
    expect(r.blocks.some((b: string) => b.includes('資金の下げの歯止め'))).toBe(true)
  })
})

describe('日経平均先物（11/21）', () => {
  it('先物の最新値と日経平均の終値の差', () => {
    const fut = { chart: { result: [{ meta: { regularMarketPrice: 54555, regularMarketTime: 1795211991 }, timestamp: [1795211100], indicators: { quote: [{ close: [54555] }] } }] } }
    const n = { chart: { result: [{ meta: { regularMarketPrice: 56436.65, regularMarketTime: 1795157103 }, timestamp: [1795156200], indicators: { quote: [{ close: [56436.6484375] }] } }] } }
    const r = nikkeiFutBrief(fut, n)
    expect(r.fut).toBe(54555)
    expect(r.vs_close_pct).toBe(-3.33)
    expect(r.n225Date).toBe('2026-11-20')
    expect(r.futTime.startsWith('2026-11-21 06:')).toBe(true)
    expect(nikkeiFutBrief(null, n)).toBeNull()
  })
})

describe('優待の廃止（記録だけ・11/21）', () => {
  it('15:00以降・決算と別の日・universe の銘柄の、優待の廃止・中止・休止だけ', () => {
    const rows = [
      { code: '1111', name: 'A', time: '15:30', title: '株主優待制度の廃止に関するお知らせ' },
      { code: '2222', name: 'B', time: '14:00', title: '株主優待制度の廃止に関するお知らせ' },
      { code: '3333', name: 'C', time: '15:00', title: '株主優待制度の拡充に関するお知らせ' },
      { code: '4444', name: 'D', time: '15:00', title: '株主優待制度の休止に関するお知らせ' },
      { code: '4444', name: 'D', time: '15:00', title: '2026年3月期 第2四半期決算短信' },
      { code: '5555', name: 'E', time: '16:00', title: '株主優待制度の中止のお知らせ' }
    ]
    expect(pickYutaiEnd(rows).map(r => r.code)).toEqual(['1111', '5555'])
    expect(pickYutaiEnd(rows, ['5555']).map(r => r.kind)).toEqual(['yutai_end'])
  })
})

describe('連休明けの ETF（練習口座・11/21）', () => {
  it('次の営業日まで4日以上あく日だけ（年末年始は除く）', () => {
    expect(nextTradingDate('2026-11-20')).toBe('2026-11-24')
    expect(isPreHoliday('2026-11-20')).toBe(true)
    expect(isPreHoliday('2026-11-19')).toBe(false)
    expect(isPreHoliday('2027-01-08')).toBe(true)
    expect(isPreHoliday('2026-12-30')).toBe(false)
    expect(isPreHoliday('2027-04-30')).toBe(true)
  })
  it('連休の前の日の引けで買い、明けの日の引けで売る', () => {
    const flat = (c: number) => [{ m: 540, o: c, h: c, l: c, c, v: 1000 }]
    const st0 = paperNew({ capital: 1000000, holidayEtfPct: 30 })
    const r1 = paperStep(st0, { date: '2027-01-08', stocks: { 1306: { bars: flat(400) } } })
    expect(r1.opened.some((o: any) => o.track === 'holiday')).toBe(true)
    const r2 = paperStep(r1.state, { date: '2027-01-12', stocks: { 1306: { bars: flat(404) } } })
    const t = r2.trades.find((x: any) => x.track === 'holiday')
    expect(t.reason).toBe('連休明けの引け')
    expect(t.pnl).toBeGreaterThan(0)
    expect(paperStep(paperNew({ capital: 1000000 }), { date: '2027-01-08', stocks: { 1306: { bars: flat(400) } } }).opened).toHaveLength(0)
  })
})

describe('isSmallHotBuyback', () => {
  it('取得の割合2%以上・売買代金3億円未満だけ true', async () => {
    const { isSmallHotBuyback } = await import('../../.claude/scripts/kabu-lens.mjs')
    expect(isSmallHotBuyback(2.5, 1e8)).toBe(true)
    expect(isSmallHotBuyback(2, 2.99e8)).toBe(true)
    expect(isSmallHotBuyback(1.9, 1e8)).toBe(false)
    expect(isSmallHotBuyback(3, 3e8)).toBe(false)
    expect(isSmallHotBuyback(null, 1e8)).toBe(false)
    expect(isSmallHotBuyback(3, null)).toBe(false)
  })
})

describe('今ためているデータで確かめること（11/25〜）', () => {
  // 終値1000・lim 1020。9:00 寄り1015、9:15 1018、10:00 以降に990まで下げる
  const bars = [
    [540, 1015, 1016, 1010, 1012, 1000],
    [555, 1018, 1019, 1012, 1013, 1000],
    [600, 1005, 1006, 995, 1000, 1000],
    [700, 995, 996, 989, 992, 1000],
    [870, 994, 1000, 993, 998, 1000],
    [925, 998, 1003, 997, 1001, 1000]
  ]
  it('スイングの買い方ごとの値段', () => {
    const r = swingEntryVariants(bars, { close: 1000, stop: 950 })
    expect(r.lim).toBe(1020)
    expect(r.v.open).toBe(1015)
    expect(r.v.base).toBe(1018)
    expect(r.v.pull1).toBe(990)
    expect(r.v.late).toBe(994)
    expect(r.v.vwap10).not.toBeNull()
    expect(r.dayClose).toBe(1001)
  })
  it('寄りが lim より上なら open は買えない', () => {
    const r = swingEntryVariants([[540, 1030, 1031, 1025, 1026, 100], [555, 1025, 1026, 1015, 1016, 100]], { close: 1000, stop: 950 })
    expect(r.v.open).toBeNull()
    expect(r.v.base).toBe(1020)
  })
  it('企業の行動の売る時ごとの%', () => {
    const r = eventExitVariants(bars, { prevClose: 1000 })
    expect(r.filled).toBe(true)
    expect(r.gap).toBe(1.5)
    expect(r.ret.close).toBeCloseTo((1001 / 1015 - 1) * 100, 2)
    expect(r.ret.trail1).toBeCloseTo((1000 / 1015 - 1) * 100, 2)
    expect(eventExitVariants([[540, 1050, 1050, 1040, 1045, 1]], { prevClose: 1000 }).filled).toBe(false)
  })
  it('liveStudyDay と累計（同じ日は2回足さない）', () => {
    const five = { date: '2026-11-25', bars: { 1111: bars, 2222: bars }, paper: { date: '2026-11-25', prevDate: '2026-11-24', cands: [{ code: '1111', date: '2026-11-24', close: 1000, stop: 950 }, { code: '1111', date: '2026-11-20', close: 1000, stop: 950 }], buybacks: [{ code: '2222', kind: 'buyback' }], ctx: { 2222: { prevClose: 1000 } } } }
    const d = liveStudyDay(five)
    expect(d.swing.length).toBe(1)
    expect(d.events.length).toBe(1)
    const st = mergeLiveStudy(null, d)
    expect(st.swing.n).toBe(1)
    expect(st.swing.v.pull1.filled).toBe(1)
    expect(st.swing.v.pull1.sumVsBaseR).toBeCloseTo((1018 - 990) / (1018 - 950), 3)
    expect(st.events.filled).toBe(1)
    expect(mergeLiveStudy(st, d).swing.n).toBe(1)
  })
})

describe('訂正の開示は企業の行動に数えない（11/25）', () => {
  it('訂正', () => {
    expect(isBuybackTitle('（訂正）「自己株式取得に係る事項の決定に関するお知らせ」の一部訂正について')).toBe(false)
    expect(isBuybackTitle('自己株式取得に係る事項の決定に関するお知らせ')).toBe(true)
    expect(isDividendUpTitle('（訂正）剰余金の配当（増配）に関するお知らせ')).toBe(false)
    expect(isSplitTitle('（訂正）株式分割に関するお知らせ')).toBe(false)
  })
})

describe('cashNow の損の合計（11/25）', () => {
  it('買値から損切りまで。損切りを買値より上げた株は0、放置とデイトレは数えない', () => {
    const st = { cash: 100000, cashBase: 100000, cashBaseAt: '2026-11-20', capitalAt: '2026-11-20', riskPct: 0.5, maxPosPct: 62, maxOpenRiskMult: 3 }
    const trades = [
      { id: 'a', status: 'open', style: 'swing', date: '2026-11-01', entry: 1000, stop: 1020, qty: 100, last: 1100 },
      { id: 'b', status: 'open', style: 'swing', date: '2026-11-01', entry: 500, stop: 470, qty: 100, last: 490 },
      { id: 'c', status: 'open', style: 'swing', date: '2026-11-01', entry: 300, qty: 200, last: 100, frozen: true },
      { id: 'd', status: 'open', style: 'day', date: '2026-11-01', entry: 500, stop: 400, qty: 100, last: 500 }
    ]
    const r = cashNow(st, trades)
    expect(r.positions_risk.find(x => x.id === 'a').risk).toBe(0)
    expect(r.positions_risk.find(x => x.id === 'b').risk).toBe(3000)
    expect(r.positions_risk.some(x => x.id === 'c' || x.id === 'd')).toBe(false)
    expect(r.open_risk).toBe(3000)
    expect(r.risk_one).toBe(Math.round(r.capital * 0.005))
    expect(r.risk_room).toBe(Math.round(r.risk_one * 3) - 3000)
  })
})

describe('orderPlan（夜の注文票の計算。11/25）', () => {
  const cn = { cash: 300000, risk_one: 3000, pos_cap: 370000, risk_room: 6000, positions_risk: [{ id: 'p1', risk: 2000 }] }
  const today = '2026-11-25'
  const scan = { date: today, rows: [
    { code: '1111', name: 'A', kind: 'PULLBACK', pass: true, date: today, close: 1000, stop: 990, target: 1060, score: 80 },
    { code: '2222', name: 'B', kind: 'GAP', pass: true, date: today, close: 500, stop: 495, target: 530, score: 30 },
    { code: '3333', name: 'C', kind: 'MOMENTUM', pass: true, date: today, close: 2000, stop: 1800, target: 2600, score: 90 },
    { code: '4444', name: 'D', kind: 'PULLBACK', pass: false, date: today, close: 100, stop: 99, score: 99 }
  ] }
  it('スイング：GAP を先に、100株で上限内のものだけ。空きと現金を引いていく', () => {
    const r = orderPlan({ cash: cn, settings: { dayTradeMax: 5 }, trades: [], events: [], scan, earnings: {}, today })
    expect(r.swing.map(x => x.code)).toEqual(['2222', '1111'])
    // B: limit 510、1株の損 15 → min(3000,6000)/15=200、A: limit 1020、損30 → min(3000, 6000-3000)/30=100
    expect(r.swing[0].qty).toBe(200)
    expect(r.swing[1].qty).toBe(100)
    expect(r.room_left).toBe(0)
    expect(r.stale).toEqual([])
  })
  it('明日が決算の候補は買わない', () => {
    const r = orderPlan({ cash: cn, settings: {}, trades: [], events: [], scan, earnings: { 2222: { date: '2026-11-26' } }, today })
    expect(r.swing.map(x => x.code)).toEqual(['1111'])
    expect(r.swing_blocked_earnings[0].code).toBe('2222')
  })
  it('企業の行動の株数（1銘柄の上限・売買代金の1.5%・現金の小さいほう）と、終値が古いときの注意', () => {
    const events = [{ code: '5555', name: 'E', kind: 'buyback', limit: 1000, skip: false, turnover_avg: 1e7, close_date: '2026-11-24', why: [] }, { code: '6666', name: 'F', kind: 'buyback', skip: true, why: ['取得の割合 1.2%（2%未満）'] }]
    const r = orderPlan({ cash: cn, settings: {}, trades: [], events, scan: null, earnings: {}, today })
    expect(r.events[0].qty).toBe(100) // 1e7×1.5%=15万 → 150株 → 100株
    expect(r.events_skipped[0].code).toBe('6666')
    expect(r.stale.length).toBe(2)
  })
  it('自社株買いの現金が足りなければ、含み益の小さいスイングをPTSで売る', () => {
    const small = { ...cn, cash: 50000 }
    const trades = [
      { id: 'p1', code: '7777', name: 'G', status: 'open', style: 'swing', date: '2026-11-01', entry: 1000, last: 950, qty: 100 },
      { id: 'p2', code: '8888', name: 'H', status: 'open', style: 'swing', date: '2026-11-01', entry: 1000, last: 1100, qty: 100 }
    ]
    const events = [{ code: '5555', name: 'E', kind: 'buyback', limit: 1000, skip: false, turnover_avg: 1e8, close_date: today, why: [] }]
    const r = orderPlan({ cash: small, settings: {}, trades, events, scan: null, earnings: {}, today })
    expect(r.pts_sells.map(x => x.code)).toEqual(['7777', '8888'])
    expect(r.pts_sells[0].price).toBe(940)
    expect(r.events[0].qty).toBe(200) // 現金 5万＋9.5万＋11万＝25.5万 → 200株
  })
})

describe('expectCheck（本番が検証の範囲に入っているか。11/25）', () => {
  it('件数が少ないとき・範囲内・下に外れ', () => {
    const nd = { groups: { buyback_s2: { n: 50, filled: 20, sumExOC: 14 }, divup: { n: 5, filled: 3, sumExOC: 1 }, split: { n: 40, filled: 15, nHold: 15, sumExHold: -150 } } }
    const r = expectCheck(nd, { pass_mtm: { count: 100, avg_r: -0.5 } })
    const by = Object.fromEntries(r.map(x => [x.key, x]))
    expect(by.buyback_s2.status).toBe('範囲内')
    expect(by.buyback_s2.fill_status).toBe('範囲内')
    expect(by.divup.status).toMatch('まだ少ない')
    expect(by.split.status).toMatch('下に外れ')
    expect(by.swing.status).toMatch('下に外れ')
    expect(by.buyback_s1.status).toBe('まだ無い')
  })
})

describe('parseBunbaiPage（立会外分売。11/25）', () => {
  it('申込受付中と今後の予定を読む', () => {
    const html = `<h2>申込受付中</h2><table><tr><th>銘柄</th><th>信用/貸借</th><th>分売価格[円]</th><th>前営業日終値[円]</th><th>割引率</th><th>申込単位数量</th><th>申込上限数量</th><th>分売実施日</th><th>詳細</th></tr>
<tr><td><a>テスト工業</a><br>9999 東証スタンダード</td><td>信用</td><td>1,940</td><td>2,000</td><td>3.00%</td><td>100株</td><td>500株</td><td>2026/12/1</td><td>詳細</td></tr>
<tr><td><a>ズレ商事</a><br>8888 東証グロース</td><td>-</td><td>500</td><td>480</td><td>3.00%</td><td>100株</td><td>100株</td><td>2026/12/1</td><td>詳細</td></tr></table>
<h2>今後の予定銘柄</h2><table><tr><td>クリエイト</td><td>3024 東証スタンダード</td><td>信用</td><td>2026/12/1～2026/12/3</td><td>100株</td><td>2,000株</td><td>詳細</td></tr></table>`
    const r = parseBunbaiPage(html)
    expect(r.open).toEqual([{ code: '9999', name: 'テスト工業', price: 1940, prev: 2000, disc: 3, unit: 100, max: 500, date: '2026-12-01' }])
    expect(r.bad.map(x => x.code)).toEqual(['8888'])
    expect(r.upcoming).toEqual([{ code: '3024', name: 'クリエイト', from: '2026-12-01', to: '2026-12-03', unit: 100, max: 2000 }])
  })
})

describe('orderPlan の立会外分売（11/25）', () => {
  it('現金があれば申込単位で入れ、先に現金を引く', () => {
    const cn = { cash: 300000, risk_one: 3000, pos_cap: 370000, risk_room: 6000, positions_risk: [] }
    const bunbai = { open: [{ code: '3024', name: 'テスト', price: 1000, prev: 1030, disc: 2.91, unit: 100, max: 2000, date: '2026-12-01' }, { code: '9999', name: '高い', price: 5000, prev: 5100, disc: 1.96, unit: 100, max: 100, date: '2026-12-01' }] }
    const r = orderPlan({ cash: cn, settings: {}, trades: [], events: [], scan: null, earnings: {}, today: '2026-11-30', bunbai })
    expect(r.bunbai.map(x => [x.code, x.qty])).toEqual([['3024', 100]])
    expect(r.bunbai_dropped.map(x => x.code)).toEqual(['9999'])
    expect(r.cash_left).toBe(200000)
  })
})

describe('受注の開示（11/25）', () => {
  it('受注の題名と pickEvents', () => {
    expect(isOrderTitle('大手半導体関連メーカーより大口受注のお知らせ')).toBe(true)
    expect(isOrderTitle('受注損失引当金の計上に関するお知らせ')).toBe(false)
    const rows = [{ code: '1111', name: 'A', time: '15:35', title: '大口受注のお知らせ' }, { code: '2222', name: 'B', time: '15:30', title: '大口受注のお知らせ' }, { code: '2222', name: 'B', time: '15:30', title: '2027年3月期 第2四半期決算短信' }]
    expect(pickEvents(rows).map(r => [r.code, r.kind])).toEqual([['1111', 'order']])
  })
  it('受注の PDF の中身（11/26）：金額・売上・月次', () => {
    const t = '２． 受注内容\n 受 注 金 額      約 12 億円\n（参考）当期業績予想 （単位：百万円）\n          売上高   営業利益\n 当期業績予想  20,000   1,500\n'
    const r = parseOrderPdf(t)
    expect(r.amount).toBe(12e8)
    expect(r.sales).toBe(20000e6)
    expect(parseOrderPdf('受注金額 取引先との守秘義務により非開示 ※2025年3月期連結売上高の10％以上').ratio_direct).toBe(10)
    expect(parseOrderPdf('受注金額 約 360 百万円').amount).toBe(360e6)
    expect(orderSizeNote(15)).toContain('大きい受注')
    expect(orderSizeNote(5)).toContain('3〜10%')
    expect(orderSizeNote(null)).toBe(null)
    expect(isMonthlyOrderTitle('月次受注実績のお知らせ')).toBe(true)
    expect(isMonthlyOrderTitle('大口受注に関するお知らせ')).toBe(false)
  })
})
