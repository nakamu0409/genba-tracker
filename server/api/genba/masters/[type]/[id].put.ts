import { readBody } from 'h3'
import { updateGenbaMasterEntry } from '../../../../utils/genbaMasterRepository'
import { parseGenbaMasterEntryInput } from '../../../../utils/genbaValidation'
import { isGenbaAdmin } from '../../../../utils/genbaAuth'

/**
マスタ更新 API（会場・アイドル・グループ共通）。共有データは管理者のみ、個人データは登録した端末のみ編集できる
 */
export default defineEventHandler(async (event) => {
  const type = String(event.context.params?.type)
  const id = Number(event.context.params?.id)
  const body = await readBody(event)
  const input = parseGenbaMasterEntryInput(body)

  return await updateGenbaMasterEntry(type, id, input, event.context.deviceId!, isGenbaAdmin(event))
})
