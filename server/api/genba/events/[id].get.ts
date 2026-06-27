import { createError } from 'h3'
import { getGenbaEventDetail } from '../../../utils/genbaRepository'

/**
現場詳細取得 API
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const detail = await getGenbaEventDetail(event.context.deviceId!, id)

  if (!detail) {
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  return detail
})
