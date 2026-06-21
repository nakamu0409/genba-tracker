import { createError } from 'h3'
import { authFetch } from '../utils/authFetch'

/**
 ユーザー削除 API (Nuxt BFF)
 *
 フロント → Nuxt → Spring API
 の中継処理を行う
 */
export default defineEventHandler((event): Promise<unknown> => {
  // URLパラメータからIDを取得
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required'
    })
  }

  // Spring API の削除エンドポイントを呼び出す
  return authFetch(event, `/api/users/${id}`, {
    method: 'DELETE'
  })
})
