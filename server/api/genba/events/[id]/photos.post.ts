import { createError, readMultipartFormData } from 'h3'
import { addGenbaEventPhoto } from '../../../../utils/genbaPhotoRepository'
import { deleteGenbaPhoto, uploadGenbaPhoto } from '../../../../utils/genbaStorage'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
現場にチェキフォトをアップロードする（登録した端末・ユーザーのみ）
 */
export default defineEventHandler(async (event) => {
  const eventId = Number(event.context.params?.id)
  const deviceId = event.context.deviceId!

  const formData = await readMultipartFormData(event)
  const file = formData?.find(part => part.name === 'photo')

  if (!file || !file.data || !file.type) {
    throw createError({
      statusCode: 400,
      message: '画像ファイルを選択してください'
    })
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    throw createError({
      statusCode: 400,
      message: '対応していない画像形式です（JPEG/PNG/WebPのみ）'
    })
  }

  if (file.data.length > MAX_PHOTO_BYTES) {
    throw createError({
      statusCode: 400,
      message: '画像サイズは5MB以内にしてください'
    })
  }

  const photoUrl = await uploadGenbaPhoto(file.data, file.type, 'genba-events')
  const photo = await addGenbaEventPhoto(deviceId, eventId, photoUrl)

  if (!photo) {
    // 現場の持ち主でなかった場合はアップロード済みのオブジェクトを残さない
    await deleteGenbaPhoto(photoUrl)
    throw createError({
      statusCode: 404,
      message: '指定した現場は見つかりませんでした'
    })
  }

  return photo
})
