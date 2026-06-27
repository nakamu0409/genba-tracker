import { getQuery } from 'h3'
import { getGenbaSummary } from '../../utils/genbaRepository'

/**
推し・グループ別の支出集計取得 API（端末ごとに分離）。year・monthクエリを指定するとその月だけに絞り込む
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const year = query.year ? Number(query.year) : undefined
  const month = query.month ? Number(query.month) : undefined

  const monthFilter = year && month ? { year, month } : undefined

  return await getGenbaSummary(event.context.deviceId!, monthFilter)
})
