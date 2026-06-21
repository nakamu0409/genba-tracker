import { createError, getCookie } from 'h3'

type ApiErrorResponse = {
  message?: string
  errors?: Record<string, string>
}

type FetchErrorShape = {
  response?: {
    status?: number
    _data?: ApiErrorResponse
  }
  statusCode?: number
  data?: ApiErrorResponse
}

/**
Spring Boot API へ認証付きでリクエストを送る共通関数
 *
ログイン成功時に保存した auth_token を Cookie から取得し、
Authorization ヘッダに付与して Spring API へアクセスする。
 */
export async function authFetch<T>(
  event: Parameters<typeof getCookie>[0],
  path: string,
  options: Parameters<typeof $fetch<T>>[1] = {}
): Promise<T> {
  const authToken = getCookie(event, 'auth_token')

  if (!authToken) {
    throw createError({
      statusCode: 401,
      message: 'ログインが必要です'
    })
  }

  try {
    return await $fetch<T>(`http://localhost:8080${path}`, {
      ...options,
      headers: {
        Authorization: authToken,
        ...(options?.headers || {})
      }
    })
  } catch (e: unknown) {
    const err = e as FetchErrorShape

    throw createError({
      statusCode: err.response?.status || err.statusCode || 500,
      message:
        err.response?._data?.message
        || err.data?.message
        || 'API request failed',
      data: err.response?._data || err.data || null
    })
  }
}
