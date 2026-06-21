export type LoginUserResponse = {
  username: string
  role: string
}

/**
ログイン中ユーザー情報取得 composable
 *
【役割】
・/api/me を呼び出してログイン中ユーザー情報を取得する
・SSR時は Cookie を明示的に渡す
 */
export const useLoginUser = () => {
  const loginUser = ref('')
  const loginRole = ref('')

  /**
ログイン中ユーザー情報を取得する
   */
  const fetchLoginUser = async () => {
    const headers = import.meta.server
      ? useRequestHeaders(['cookie'])
      : undefined

    const data = await $fetch<LoginUserResponse>('/api/me', {
      headers
    })

    loginUser.value = data.username
    loginRole.value = data.role
  }

  /**
管理者ロールかどうか
   */
  const isAdmin = computed(() => loginRole.value === 'ROLE_ADMIN')

  return {
    loginUser,
    loginRole,
    isAdmin,
    fetchLoginUser
  }
}
