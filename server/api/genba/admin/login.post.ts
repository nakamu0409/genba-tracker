import { createError, readBody, setCookie } from 'h3'
import { useRuntimeConfig } from '#imports'
import { ADMIN_COOKIE_NAME } from '../../../utils/genbaAuth'

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
管理者の合言葉を確認し、一致すればCookieに保存して以後の書き込みを許可する
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)
  const key = String(body?.key ?? '')

  if (!config.genbaAdminKey || key !== config.genbaAdminKey) {
    throw createError({
      statusCode: 401,
      message: '合言葉が正しくありません'
    })
  }

  setCookie(event, ADMIN_COOKIE_NAME, key, {
    maxAge: ONE_YEAR_IN_SECONDS,
    httpOnly: true,
    sameSite: 'lax',
    path: '/'
  })

  return { success: true }
})
