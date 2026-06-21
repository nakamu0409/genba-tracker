import { readBody } from 'h3'
import { createGenbaMasterEntriesBulk } from '../../../../utils/genbaMasterRepository'
import { parseGenbaMasterBulkInput } from '../../../../utils/genbaValidation'
import { isGenbaAdmin } from '../../../../utils/genbaAuth'

/**
マスタ一括登録 API（会場・アイドル・グループ共通）。管理者は共有データ、それ以外は自分専用データとして登録する
 */
export default defineEventHandler(async (event) => {
  const type = String(event.context.params?.type)
  const body = await readBody(event)
  const entries = parseGenbaMasterBulkInput(body)

  return createGenbaMasterEntriesBulk(type, entries, event.context.deviceId!, isGenbaAdmin(event))
})
