import { getQuery } from 'h3'
import { listGenbaEvents } from '../../utils/genbaRepository'

/**
現場一覧取得 API（推し名・グループ名で絞り込み可能、端末ごとに分離）
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  return await listGenbaEvents(event.context.deviceId!, {
    memberName: query.memberName ? String(query.memberName) : undefined,
    groupName: query.groupName ? String(query.groupName) : undefined
  })
})
