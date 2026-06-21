import { getGenbaIdolPhotoUrl, setGenbaIdolPhoto } from '../../../utils/genbaMasterRepository'
import { deleteGenbaPhoto } from '../../../utils/genbaStorage'
import { isGenbaAdmin } from '../../../utils/genbaAuth'

/**
アイドルの写真を削除する
 */
export default defineEventHandler(async (event) => {
  const id = Number(event.context.params?.id)
  const deviceId = event.context.deviceId!
  const isAdmin = isGenbaAdmin(event)

  const previousPhotoUrl = getGenbaIdolPhotoUrl(id)
  const entry = setGenbaIdolPhoto(id, null, deviceId, isAdmin)

  if (previousPhotoUrl) {
    await deleteGenbaPhoto(previousPhotoUrl)
  }

  return entry
})
