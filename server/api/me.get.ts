import { authFetch } from './utils/authFetch'

/**
ログイン中ユーザー情報取得 API（Nuxt BFF）
 *
・Spring Boot の /api/users/me へ GET リクエストを中継する
・ログイン中の username と role を取得する
 */
export default defineEventHandler((event): Promise<unknown> => {
  return authFetch(event, '/api/users/me')
})
