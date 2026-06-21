import { setCookie } from 'h3'
import { ADMIN_COOKIE_NAME } from '../../../utils/genbaAuth'

/**
管理者Cookieを破棄する
 */
export default defineEventHandler((event) => {
  setCookie(event, ADMIN_COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return { success: true }
})
