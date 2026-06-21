import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { useRuntimeConfig } from '#imports'

const ADMIN_COOKIE_NAME = 'genba_admin_key'

/**
リクエストが管理者として認証されているかを判定する
 *
GENBA_ADMIN_KEY未設定の場合は誰も管理者になれない（安全側に倒す）
 */
export function isGenbaAdmin(event: H3Event): boolean {
  const config = useRuntimeConfig()
  const adminKey = config.genbaAdminKey

  if (!adminKey) {
    return false
  }

  return getCookie(event, ADMIN_COOKIE_NAME) === adminKey
}

/**
共有マスタへの書き込み操作の前に管理者であることを確認する。管理者でなければ403を返す
 */
export function requireGenbaAdmin(event: H3Event): void {
  if (!isGenbaAdmin(event)) {
    throw createError({
      statusCode: 403,
      message: '共有マスタの編集は管理者のみ行えます'
    })
  }
}

export { ADMIN_COOKIE_NAME }
