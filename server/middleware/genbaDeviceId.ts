import { randomUUID } from 'node:crypto'
import { getCookie, setCookie } from 'h3'

export const GENBA_DEVICE_COOKIE_NAME = 'genba_device_id'
const COOKIE_NAME = GENBA_DEVICE_COOKIE_NAME
const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
ログイン不要で現場記録を端末ごとに分けるための匿名デバイスIDを発行する
 *
未発行の場合はCookieにランダムなIDを保存し、以後のリクエストでも同じデータを参照できるようにする
 */
export default defineEventHandler((event) => {
  const existing = getCookie(event, COOKIE_NAME)

  if (existing) {
    event.context.deviceId = existing
    return
  }

  const deviceId = randomUUID()

  setCookie(event, COOKIE_NAME, deviceId, {
    maxAge: ONE_YEAR_IN_SECONDS * 5,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  })

  event.context.deviceId = deviceId
})
