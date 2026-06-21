import { createError } from 'h3'
import { deleteGenbaEvent } from '../../../utils/genbaRepository'

/**
現場削除 API
 */
export default defineEventHandler((event) => {
  const id = Number(event.context.params?.id)
  const deleted = deleteGenbaEvent(event.context.deviceId!, id)

  if (!deleted) {
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  return { success: true }
})
