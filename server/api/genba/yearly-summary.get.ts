import { createError, getQuery } from 'h3'
import { getYearlyOverview } from '../../utils/genbaRepository'

/**
年間まとめ（総額・現場回数・チェキ枚数・月別支出・最高額/最多チェキの現場・推し別ランキング）取得 API
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const year = Number(query.year)

  if (!Number.isInteger(year)) {
    throw createError({
      statusCode: 400,
      message: 'yearを正しく指定してください'
    })
  }

  return await getYearlyOverview(event.context.deviceId!, year)
})
