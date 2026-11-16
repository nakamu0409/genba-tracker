import { describe, expect, it } from 'vitest'
// @ts-expect-error 型定義のない .mjs スクリプト
import { afternoonResult, classifyKessan, parseKabutanKessanList, businessDaysBetween, parseKabutanEarningsDate, preTradeCheck, analyze, atr, backtest, chaseFeatures, chaseRisk, dipRisk, mergeMoverStats, parseKabutanNews, summarizeMoverStats, ema, evaluateSignal, isTseCode, parseKabutanMovers, parseKabutanRanking, parseKabutanStock, parseYahoo, parseYahooNow, percentRank, rma, rsi, sma, summarize } from '../../.claude/scripts/kabu-lens.mjs'

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
    expect(preTradeCheck({ ...base, earningsDate: '2026-11-19' }).blocks.some(b => b.includes('決算前'))).toBe(true)
    expect(preTradeCheck({ ...base, earningsDate: '2026-11-16' }).blocks).toEqual([])
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
