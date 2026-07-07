import { randomBytes } from 'node:crypto'
import { getGenbaDb } from './genbaDb'

const LOGIN_TOKEN_TTL_MS = 30 * 60 * 1000

export type GenbaUser = {
  id: number
  email: string
}

/**
メールアドレスに対応するユーザーを取得し、なければ新規作成する
 */
export async function findOrCreateUserByEmail(email: string): Promise<GenbaUser> {
  const db = await getGenbaDb()

  const existing = await db.execute({
    sql: 'SELECT id, email FROM genba_users WHERE email = ?',
    args: [email]
  })

  const existingRow = existing.rows[0] as unknown as GenbaUser | undefined
  if (existingRow) {
    return existingRow
  }

  const result = await db.execute({
    sql: 'INSERT INTO genba_users (email) VALUES (?)',
    args: [email]
  })

  return { id: Number(result.lastInsertRowid), email }
}

/**
ログイン用のワンタイムトークンを発行する（有効期限30分）
 */
export async function createLoginToken(userId: number): Promise<string> {
  const db = await getGenbaDb()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + LOGIN_TOKEN_TTL_MS).toISOString()

  await db.execute({
    sql: 'INSERT INTO genba_login_tokens (token, user_id, expires_at) VALUES (?, ?, ?)',
    args: [token, userId, expiresAt]
  })

  return token
}

/**
指定ユーザーに対して直近withinMs以内に発行された未使用トークンがあるか調べる（メール連投の抑制用）。
発行時刻カラムは持たないため、expires_at（発行時刻 + TTL）から逆算して判定する
 */
export async function hasRecentLoginToken(userId: number, withinMs: number): Promise<boolean> {
  const db = await getGenbaDb()

  const threshold = new Date(Date.now() + LOGIN_TOKEN_TTL_MS - withinMs).toISOString()
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM genba_login_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ?',
    args: [userId, threshold]
  })

  return Number((result.rows[0] as unknown as { count: number }).count) > 0
}

/**
ログイントークンを検証し、使用済みにしてユーザーを返す。無効・期限切れ・使用済みならundefined
 */
export async function consumeLoginToken(token: string): Promise<GenbaUser | undefined> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: `
      SELECT t.token, t.expires_at, t.used_at, u.id, u.email
      FROM genba_login_tokens t
      INNER JOIN genba_users u ON u.id = t.user_id
      WHERE t.token = ?
    `,
    args: [token]
  })

  const row = result.rows[0] as unknown as {
    token: string
    expires_at: string
    used_at: string | null
    id: number
    email: string
  } | undefined

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    return undefined
  }

  await db.execute({
    sql: 'UPDATE genba_login_tokens SET used_at = datetime(\'now\') WHERE token = ?',
    args: [token]
  })

  return { id: row.id, email: row.email }
}

/**
ユーザーのスコープID（端末識別子として使う文字列）からユーザー情報を取得する
 */
export async function getUserByScopeId(scopeId: string): Promise<GenbaUser | undefined> {
  const match = /^u(\d+)$/.exec(scopeId)
  if (!match) {
    return undefined
  }

  const db = await getGenbaDb()
  const result = await db.execute({
    sql: 'SELECT id, email FROM genba_users WHERE id = ?',
    args: [Number(match[1])]
  })

  return result.rows[0] as unknown as GenbaUser | undefined
}

export function userScopeId(userId: number): string {
  return `u${userId}`
}

/**
ログイン前に端末専用データとして保存されていた現場・マスタ・予算情報を、ログインしたユーザーのスコープへ引き継ぐ
 */
export async function migrateDeviceDataToUser(fromScopeId: string, toScopeId: string): Promise<void> {
  if (fromScopeId === toScopeId || !fromScopeId) {
    return
  }

  const db = await getGenbaDb()

  for (const table of ['genba_events', 'genba_photos']) {
    await db.execute({
      sql: `UPDATE ${table} SET device_id = ? WHERE device_id = ?`,
      args: [toScopeId, fromScopeId]
    })
  }

  // マスタはUNIQUE(name, device_id)、予算はPRIMARY KEY(device_id, year_month)があるため、
  // 移行先に同じ行が既にある場合（別端末で同じアカウントに再ログインした場合など）は移行先を優先して移行元を破棄する
  for (const table of ['genba_venues', 'genba_groups', 'genba_idols', 'genba_budgets']) {
    await db.execute({
      sql: `UPDATE OR IGNORE ${table} SET device_id = ? WHERE device_id = ?`,
      args: [toScopeId, fromScopeId]
    })
    await db.execute({
      sql: `DELETE FROM ${table} WHERE device_id = ?`,
      args: [fromScopeId]
    })
  }
}
