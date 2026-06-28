import { deleteCookie } from 'h3'
import { GENBA_DEVICE_COOKIE_NAME } from '../../../middleware/genbaDeviceId'

/**
ログイン状態を解除し、次回アクセス時に新しい匿名デバイスIDを発行させる
 */
export default defineEventHandler((event) => {
  deleteCookie(event, GENBA_DEVICE_COOKIE_NAME, { path: '/' })
  return { success: true }
})
