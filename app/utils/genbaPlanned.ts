/**
開催日が未来（明日以降）の現場を「予定」として扱うための判定
 */
export function isPlannedGenbaDate(eventDate: string | null): boolean {
  if (!eventDate) {
    return false
  }

  const today = new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`

  return eventDate > todayStr
}

/**
「予定」集計に使う残り見込み額。チケット代・交通費・宿泊費・チェキ/グッズは
先行抽選や事前予約で開催前に払い済みのことがあるため、支払い済みの費目は差し引く
（＝これから実際に払う／使う見込み額のみを残す）
 */
export function plannedRemainingAmount(event: {
  totalAmount: number
  ticketPrice: number
  ticketPaid: boolean
  transportFee: number
  transportPaid: boolean
  lodgingFee: number
  lodgingPaid: boolean
  chekiTotal: number
  goodsTotal: number
  itemsPaid: boolean
}): number {
  let remaining = event.totalAmount
  if (event.ticketPaid) remaining -= event.ticketPrice
  if (event.transportPaid) remaining -= event.transportFee
  if (event.lodgingPaid) remaining -= event.lodgingFee
  if (event.itemsPaid) remaining -= event.chekiTotal + event.goodsTotal
  return remaining
}
