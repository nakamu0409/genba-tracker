import { createError } from 'h3'
import { deleteGenbaEventPhoto } from '../../../utils/genbaPhotoRepository'
import { deleteGenbaPhoto } from '../../../utils/genbaStorage'

/**
チェキフォトを削除する（登録した端末・ユーザーのみ）
 */
export default defineEventHandler(async (event) => {
  const photoId = Number(event.context.params?.id)
  const photoUrl = await deleteGenbaEventPhoto(event.context.deviceId!, photoId)

  if (!photoUrl) {
    throw createError({
      statusCode: 404,
      message: '指定した写真は見つかりませんでした'
    })
  }

  await deleteGenbaPhoto(photoUrl)
  return { success: true }
})
