/**
認証チェック用 middleware
 *
【役割】
・ログイン済みユーザーのみ画面アクセスを許可する
・未ログインの場合は /login へリダイレクトする
 */
export default defineNuxtRouteMiddleware((to) => {
  // ログイン画面は誰でもアクセス可能
  if (to.path === '/login') {
    return
  }

  // SSR時はスキップ（クライアントで判定する）
  if (import.meta.server) {
    return
  }

  /**
auth_token の存在でログイン状態を判定
   */
  const authToken = useCookie('auth_token')

  console.log('middleware path =', to.path)
  console.log('auth_token =', authToken.value)

  // トークンが無い場合はログイン画面へ
  if (!authToken.value) {
    return navigateTo('/login')
  }
})
