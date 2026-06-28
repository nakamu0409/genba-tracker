import { createError, readBody, setCookie } from 'h3'
import { GENBA_DEVICE_COOKIE_NAME } from '../../../middleware/genbaDeviceId'
import { consumeLoginToken, migrateDeviceDataToUser, userScopeId } from '../../../utils/genbaUserRepository'

const FIVE_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 5

/**
ユーザーの明示的な操作（ボタン押下）を起点にマジックリンクのトークンを検証し、ログインCookieを発行する。
メールセキュリティのリンクスキャナーによる事前アクセスでトークンが消費されてしまうのを避けるため、
GETでのリンクアクセスだけでは消費せず、このPOSTでのみ消費する
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const token = String(body?.token ?? '')

  const user = await consumeLoginToken(token)

  if (!user) {
    throw createError({
      statusCode: 400,
      message: 'ログインリンクが無効、または期限切れです'
    })
  }

  const previousScopeId = event.context.deviceId
  const newScopeId = userScopeId(user.id)

  if (previousScopeId) {
    await migrateDeviceDataToUser(previousScopeId, newScopeId)
  }

  setCookie(event, GENBA_DEVICE_COOKIE_NAME, newScopeId, {
    maxAge: FIVE_YEARS_IN_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  })

  return { success: true, email: user.email }
})
