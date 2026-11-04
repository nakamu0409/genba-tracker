import { describe, expect, it } from 'vitest'
// @ts-expect-error 型定義のない .mjs スクリプト
import { comps, dcf, sensitivity } from '../../.claude/scripts/stock-calc.mjs'

describe('dcf', () => {
  it('成長1年・永久成長0なら手計算と一致する', () => {
    // FCF 100 → 1年目 110、割引率10%。PV = 110/1.1 = 100、継続価値 = 110/0.1 = 1100 → PV 1000
    const r = dcf({ baseFcf: 100, growthRates: [0.1], wacc: 0.1, terminalGrowth: 0, netDebt: 100, shares: 10, price: 50 })
    expect(r.enterpriseValue).toBeCloseTo(1100)
    expect(r.equityValue).toBeCloseTo(1000)
    expect(r.perShare).toBeCloseTo(100)
    expect(r.marginOfSafety).toBeCloseTo(0.5)
  })

  it('割引率が永久成長率以下ならエラー', () => {
    expect(() => dcf({ baseFcf: 1, growthRates: [0], wacc: 0.01, terminalGrowth: 0.02, netDebt: 0, shares: 1 })).toThrow()
  })

  it('感応度表は割引率が高いほど理論株価が下がる', () => {
    const s = sensitivity({ baseFcf: 50, growthRates: [0.05, 0.05], wacc: 0.07, terminalGrowth: 0.01, netDebt: 0, shares: 1 })
    const row = s.waccVsTerminal.rows[1].values
    expect(row[0]).toBeGreaterThan(row[row.length - 1])
  })
})

describe('comps', () => {
  it('記事の例: さくら食品 PER10倍、同業中央値15倍なら目安1500円', () => {
    const r = comps({
      target: 'さくら食品',
      companies: [
        { name: 'さくら食品', price: 1000, shares: 1, netIncome: 100 },
        { name: 'もみじ製菓', price: 1600, shares: 1, netIncome: 100 },
        { name: 'つばき食品', price: 1400, shares: 1, netIncome: 100 }
      ]
    })
    expect(r.rows[0].per).toBeCloseTo(10)
    expect(r.peerMedian.per).toBeCloseTo(15)
    expect(r.implied.byPer).toBeCloseTo(1500)
    expect(r.implied.byPerUpside).toBeCloseTo(0.5)
  })
})
