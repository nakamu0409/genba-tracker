import { deleteCookie } from 'h3'

/**
ログアウトAPI
 *
【役割】
・認証用Cookie（auth_token）を削除する
・これにより未ログイン状態に戻る
 */
export default defineEventHandler((event) => {
  deleteCookie(event, 'auth_token', { path: '/' })

  return {
    message: 'ログアウトしました'
  }
})
