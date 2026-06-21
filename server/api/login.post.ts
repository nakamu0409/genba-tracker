import { setCookie, createError, readBody } from 'h3'

/**
ログイン API（Nuxt BFF）
 *
【役割】
・ログイン画面から送られた username / password を受け取る
・Basic認証ヘッダを生成する
・Spring Boot 側の認証付きAPIを呼び出して、認証可否を確認する
・認証成功時は Cookie に認証情報を保存する
・Cookie の有効時間を 1時間 に設定する
・1時間を過ぎると Cookie が無効になり、再ログインが必要になる
 */
export default defineEventHandler(async (event) => {
  /**
リクエストボディからログイン情報を取得する
   */
  const body = await readBody<{
    username?: string
    password?: string
  }>(event)

  const username = body.username?.trim()
  const password = body.password

  /**
未入力チェック
   */
  if (!username || !password) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ユーザー名とパスワードを入力してください'
    })
  }

  /**
Basic認証ヘッダを生成する
   *
形式：
Authorization: Basic base64(username:password)
   */
  const basicAuth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

  try {
    /**
Spring Boot 側の認証付きAPIを呼び出して認証確認を行う
     *
今回は /api/users を試しに呼び出し、
認証が通るかどうかでログイン成功/失敗を判定する
     */
    await $fetch('http://localhost:8080/api/users', {
      headers: {
        Authorization: basicAuth
      }
    })

    /**
認証成功時、Cookie に認証情報を保存する
     *
【保存するもの】
・auth_token : Spring Boot 呼び出し用の Basic認証文字列
・logged_in  : フロント側でログイン状態を扱うためのフラグ
・login_user : 画面表示用のログインユーザー名
     *
【有効時間】
・maxAge は秒単位
・60 * 60 = 3600秒 = 1時間
     *
【補足】
・1時間経過後は Cookie が無効になり、再ログインが必要になる
     */
    setCookie(event, 'auth_token', basicAuth, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60
    })

    setCookie(event, 'logged_in', 'true', {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60
    })

    setCookie(event, 'login_user', username, {
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60
    })

    /**
ログイン成功レスポンス
     */
    return {
      message: 'ログインしました'
    }
  } catch {
    /**
Spring Boot 側の認証に失敗した場合
     */
    throw createError({
      statusCode: 401,
      statusMessage: 'ユーザー名またはパスワードが正しくありません'
    })
  }
})
