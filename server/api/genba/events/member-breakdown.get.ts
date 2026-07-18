import { getEventMemberBreakdown } from '../../../utils/genbaRepository'

/**
現場ごとの推し別内訳を取得する API（端末ごとに分離）。
一覧を推し・グループで絞り込んだときに「その推しだけの金額」を出すために使う
 */
export default defineEventHandler(async (event) => {
  return await getEventMemberBreakdown(event.context.deviceId!)
})
