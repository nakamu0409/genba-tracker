import { authFetch } from './utils/authFetch'

/**
ユーザー一覧取得 API（BFF）
 *
フロントエンドからのリクエストを受け取り、
Spring Boot の /api/users エンドポイントへ中継する。
 *
・Cookie に保存された認証情報（auth_token）を取得
・Authorization ヘッダに付与して Spring API にリクエスト
・未ログインの場合は 401 エラーを返却
 */
export default defineEventHandler((event): Promise<unknown> => {
  return authFetch(event, '/api/users')
})
