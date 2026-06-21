import { authFetch } from './utils/authFetch'

/**
 ユーザー登録 API (Nuxt BFF)
 *
 フロント → Nuxt → Spring API
 の中継処理を行う
 */
export default defineEventHandler(async (event): Promise<unknown> => {
  // フロントから送信された登録データを取得
  const body = await readBody(event)
  // Spring API のユーザー登録エンドポイントを呼び出す
  return authFetch(event, '/api/users', {
    method: 'POST',
    body
  })
})
