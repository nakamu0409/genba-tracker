import { authFetch } from './utils/authFetch'

/**
ユーザーステータス一覧取得 API（Nuxt BFF）
 *
【役割】
・フロントからのリクエストを受ける
・Spring Boot の /api/user-statuses へ中継する
・認証情報は authFetch で共通的に付与する
 */
export default defineEventHandler((event): Promise<unknown> => {
  return authFetch(event, '/api/user-statuses')
})
