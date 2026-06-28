import { getUserByScopeId } from '../../../utils/genbaUserRepository'

/**
現在の端末がログイン済みユーザーのスコープかどうかを返す
 */
export default defineEventHandler(async (event) => {
  const deviceId = event.context.deviceId

  if (!deviceId) {
    return { email: null }
  }

  const user = await getUserByScopeId(deviceId)
  return { email: user?.email ?? null }
})
