import { createError } from 'h3'
import { deleteGenbaMasterEntry } from '../../../../utils/genbaMasterRepository'
import { isGenbaAdmin } from '../../../../utils/genbaAuth'

/**
マスタ削除 API（会場・アイドル・グループ共通）。共有データは管理者のみ、個人データは登録した端末のみ削除できる
 */
export default defineEventHandler(async (event) => {
  const type = String(event.context.params?.type)
  const id = Number(event.context.params?.id)
  const deleted = await deleteGenbaMasterEntry(type, id, event.context.deviceId!, isGenbaAdmin(event))

  if (!deleted) {
    throw createError({
      statusCode: 404,
      message: '指定したデータは見つかりませんでした'
    })
  }

  return { success: true }
})
