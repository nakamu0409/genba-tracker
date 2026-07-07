import { createError } from 'h3'
import { deleteGenbaEvent } from '../../../utils/genbaRepository'
import { listGenbaEventPhotoUrls } from '../../../utils/genbaPhotoRepository'
import { deleteGenbaPhoto } from '../../../utils/genbaStorage'

/**
現場削除 API（紐づくチェキフォトもR2から削除する）
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const deviceId = event.context.deviceId!

  const photoUrls = await listGenbaEventPhotoUrls(deviceId, id)
  const deleted = await deleteGenbaEvent(deviceId, id)

  if (!deleted) {
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  for (const url of photoUrls) {
    await deleteGenbaPhoto(url)
  }

  return { success: true }
})
