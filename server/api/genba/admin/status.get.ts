import { isGenbaAdmin } from '../../../utils/genbaAuth'

/**
現在の端末が共有マスタを編集できる管理者かどうかを返す
 */
export default defineEventHandler((event) => {
  return { isAdmin: isGenbaAdmin(event) }
})
