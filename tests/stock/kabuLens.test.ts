import { describe, expect, it } from 'vitest'
// @ts-expect-error 型定義のない .mjs スクリプト
import { analyze, atr, backtest, ema, evaluateSignal, isTseCode, parseYahoo, percentRank, rma, rsi, sma, summarize } from '../../.claude/scripts/kabu-lens.mjs'

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
