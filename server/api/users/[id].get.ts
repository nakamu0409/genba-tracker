import { createError } from 'h3'
import { authFetch } from '../utils/authFetch'

/**
 ユーザー詳細取得 API (Nuxt BFF)
 *
 フロント → Nuxt → Spring API
 の中継処理を行う
 */
export default defineEventHandler((event): Promise<unknown> => {
  // URLパラメータからユーザーID取得
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required'
    })
  }
  // Spring API を呼び出してユーザー詳細取得
  return authFetch(event, `/api/users/${id}`)
})
