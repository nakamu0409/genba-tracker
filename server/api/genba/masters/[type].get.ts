import { listGenbaMasterEntries } from '../../../utils/genbaMasterRepository'

/**
マスタ一覧取得 API（会場・アイドル・グループ共通。共有データ＋自分の端末のデータを返す）
 */
export default defineEventHandler((event) => {
  const type = String(event.context.params?.type)
  return listGenbaMasterEntries(type, event.context.deviceId!)
})
