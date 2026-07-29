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
「予定」集計に使う残り見込み額。チケット代・交通費・宿泊費は先行抽選や事前予約で
開催前に払い済みのことがあり、チェキ・グッズはメンバー（明細）ごとに払い済みのことがあるため、
支払い済みの分は差し引く（＝これから実際に払う／使う見込み額のみを残す）。
チェキ・グッズは明細ごとの未払い合計 unpaidItemsTotal を直接使う
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
  unpaidItemsTotal: number
}): number {
  let remaining = event.totalAmount
  if (event.ticketPaid) remaining -= event.ticketPrice
  if (event.transportPaid) remaining -= event.transportFee
  if (event.lodgingPaid) remaining -= event.lodgingFee
  // チェキ・グッズは支払い済みの明細分を差し引く（未払い明細ぶんだけ残す）
  remaining -= (event.chekiTotal + event.goodsTotal) - event.unpaidItemsTotal
  return remaining
}
