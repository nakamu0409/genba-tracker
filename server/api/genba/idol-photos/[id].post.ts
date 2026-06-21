import { createError, readMultipartFormData } from 'h3'
import { getGenbaIdolPhotoUrl, setGenbaIdolPhoto } from '../../../utils/genbaMasterRepository'
import { deleteGenbaPhoto, uploadGenbaPhoto } from '../../../utils/genbaStorage'
import { isGenbaAdmin } from '../../../utils/genbaAuth'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

/**
アイドルの写真をアップロードする（共有データは管理者のみ、個人データは登録した端末のみ）
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const deviceId = event.context.deviceId!
  const isAdmin = isGenbaAdmin(event)

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
      message: '対応していない画像形式です（JPEG/PNG/WebP/GIFのみ）'
    })
  }

  if (file.data.length > MAX_PHOTO_BYTES) {
    throw createError({
      statusCode: 400,
      message: '画像サイズは5MB以内にしてください'
    })
  }

  const previousPhotoUrl = getGenbaIdolPhotoUrl(id)
  const photoUrl = await uploadGenbaPhoto(file.data, file.type)
  const entry = setGenbaIdolPhoto(id, photoUrl, deviceId, isAdmin)

  if (previousPhotoUrl) {
    await deleteGenbaPhoto(previousPhotoUrl)
  }

  return entry
})
