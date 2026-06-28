export type GenbaItemCategory = 'cheki' | 'goods'

export type GenbaItem = {
  id: number
  category: GenbaItemCategory
  label: string
  unitPrice: number
  quantity: number
  memberName: string | null
  groupName: string | null
}

export type GenbaItemInput = {
  label: string
  unitPrice: number
  quantity: number
  memberName: string | null
}

export type GenbaEvent = {
  id: number
  eventName: string
  eventDate: string | null
  venueName: string | null
  memberNames: string[]
  groupNames: string[]
  ticketPrice: number
  drinkFee: number
  transportFee: number
  memo: string | null
  createdAt: string
  chekiTotal: number
  chekiCount: number
  goodsTotal: number
  totalAmount: number
}

export type GenbaEventDetail = GenbaEvent & {
  items: GenbaItem[]
}

export type GenbaEventInput = {
  eventName: string
  eventDate: string | null
  venueName: string | null
  ticketPrice: number
  drinkFee: number
  transportFee: number
  memo: string | null
  chekiItems: GenbaItemInput[]
  goodsItems: GenbaItemInput[]
}

export type GenbaBudget = {
  monthlyAmount: number | null
}

export type GenbaSummaryRow = {
  key: string
  memberName: string | null
  groupName: string | null
  eventCount: number
  chekiCount: number
  totalAmount: number
}

export type GenbaYearlyOverview = {
  year: number
  totalAmount: number
  eventCount: number
  chekiCount: number
  monthlyTotals: { month: number, totalAmount: number }[]
  topEventByAmount: GenbaEvent | null
  topEventByChekiCount: GenbaEvent | null
  ranking: GenbaSummaryRow[]
}

export type GenbaMemberTrend = {
  year: number
  memberName: string
  totalAmount: number
  chekiCount: number
  monthlyTotals: { month: number, totalAmount: number, chekiCount: number }[]
}

export type GenbaMasterType = 'venues' | 'idols' | 'groups'

export type GenbaMasterScope = 'shared' | 'mine'

export type GenbaMasterEntry = {
  id: number
  name: string
  groupName: string | null
  photoUrl: string | null
  lastUnitPrice: number | null
  scope: GenbaMasterScope
}

export type GenbaMasterEntryInput = {
  name: string
  groupName: string | null
}
