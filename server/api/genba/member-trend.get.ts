import { createError, getQuery } from 'h3'
import { getMemberTrend } from '../../utils/genbaRepository'

/**
推し別の月次支出トレンド取得 API（year・memberクエリ必須）
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const year = Number(query.year)
  const memberName = String(query.member ?? '').trim()

  if (!Number.isInteger(year) || !memberName) {
    throw createError({
      statusCode: 400,
      message: 'year・memberを正しく指定してください'
    })
  }

  return await getMemberTrend(event.context.deviceId!, year, memberName)
})
