import { createError, getRequestURL, readBody } from 'h3'
import { sendMagicLinkEmail } from '../../../utils/genbaEmail'
import { createLoginToken, findOrCreateUserByEmail, hasRecentLoginToken } from '../../../utils/genbaUserRepository'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const RESEND_INTERVAL_MS = 2 * 60 * 1000

/**
入力されたメールアドレスにログイン用マジックリンクを送信する
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const email = String(body?.email ?? '').trim().toLowerCase()

  if (!EMAIL_PATTERN.test(email)) {
    throw createError({
      statusCode: 400,
      message: 'メールアドレスを正しく入力してください'
    })
  }

  const user = await findOrCreateUserByEmail(email)

  if (await hasRecentLoginToken(user.id, RESEND_INTERVAL_MS)) {
    throw createError({
      statusCode: 429,
      message: 'ログインメールを送信済みです。届かない場合は2分ほど待ってから再度お試しください'
    })
  }

  const token = await createLoginToken(user.id)

  const origin = getRequestURL(event).origin
  const loginUrl = `${origin}/genba/login-confirm?token=${token}`

  await sendMagicLinkEmail(email, loginUrl)

  return { success: true }
})
