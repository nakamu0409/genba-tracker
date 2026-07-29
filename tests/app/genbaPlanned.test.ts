import { describe, expect, it } from 'vitest'
import { plannedRemainingAmount } from '../../app/utils/genbaPlanned'

const base = {
  totalAmount: 0,
  ticketPrice: 0,
  ticketPaid: false,
  transportFee: 0,
  transportPaid: false,
  lodgingFee: 0,
  lodgingPaid: false,
  chekiTotal: 0,
  goodsTotal: 0,
  unpaidItemsTotal: 0
}

describe('plannedRemainingAmount', () => {
  it('全部未払いなら合計そのまま', () => {
    const e = {
      ...base, totalAmount: 12000,
      ticketPrice: 3000, transportFee: 2000, lodgingFee: 5000,
      chekiTotal: 1500, goodsTotal: 500, unpaidItemsTotal: 2000
    }
    expect(plannedRemainingAmount(e)).toBe(12000)
  })

  it('支払い済みの費目と支払い済み明細が差し引かれる', () => {
    const e = {
      ...base,
      totalAmount: 12000,
      ticketPrice: 3000, ticketPaid: true,
      transportFee: 2000, transportPaid: true,
      lodgingFee: 5000, lodgingPaid: false,
      chekiTotal: 1500, goodsTotal: 500,
      // チェキ・グッズ計2000のうち未払いは500だけ（1500は支払い済み）
      unpaidItemsTotal: 500
    }
    // 12000 - 3000(ticket) - 2000(transport) - 1500(支払い済み明細) = 5500
    expect(plannedRemainingAmount(e)).toBe(5500)
  })

  it('明細が全部未払いなら明細分はそのまま残る', () => {
    const e = { ...base, totalAmount: 2000, chekiTotal: 1500, goodsTotal: 500, unpaidItemsTotal: 2000 }
    expect(plannedRemainingAmount(e)).toBe(2000)
  })

  it('全部支払い済みなら0', () => {
    const e = {
      totalAmount: 10000,
      ticketPrice: 3000, ticketPaid: true,
      transportFee: 2000, transportPaid: true,
      lodgingFee: 4000, lodgingPaid: true,
      chekiTotal: 800, goodsTotal: 200, unpaidItemsTotal: 0
    }
    expect(plannedRemainingAmount(e)).toBe(0)
  })
})
