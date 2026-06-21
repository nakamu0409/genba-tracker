import { readBody } from 'h3'
import { createGenbaMasterEntry } from '../../../utils/genbaMasterRepository'
import { parseGenbaMasterEntryInput } from '../../../utils/genbaValidation'
import { isGenbaAdmin } from '../../../utils/genbaAuth'

/**
マスタ登録 API（会場・アイドル・グループ共通）。管理者は共有データ、それ以外は自分専用データとして登録する
 */
export default defineEventHandler(async (event) => {
  const type = String(event.context.params?.type)
  const body = await readBody(event)
  const input = parseGenbaMasterEntryInput(body)

  return createGenbaMasterEntry(type, input, event.context.deviceId!, isGenbaAdmin(event))
})
