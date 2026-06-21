import { createError } from 'h3'
import { authFetch } from '../utils/authFetch'

/**
 ユーザー更新 API (Nuxt BFF)
 *
 フロント → Nuxt → Spring API
 の中継処理を行う
 */

export default defineEventHandler(async (event): Promise<unknown> => {
  // URLパラメータからユーザーID取得
  const id = event.context.params?.id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required'
    })
  }

  // フロントから送られてきた更新データを取得
  const body = await readBody(event)

  // Spring API の更新エンドポイントを呼び出す
  return authFetch(event, `/api/users/${id}`, {
    method: 'PUT',
    body
  })
})
