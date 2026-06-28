import { createError } from 'h3'
import { getGenbaDb } from './genbaDb'
import type { GenbaMasterEntry, GenbaMasterEntryInput, GenbaMasterType } from '../../shared/types/genba'

const TABLE_NAMES: Record<GenbaMasterType, string> = {
  venues: 'genba_venues',
  idols: 'genba_idols',
  groups: 'genba_groups'
}

const SHARED_DEVICE_ID = ''

/**
マスタ種別からテーブル名を取得する。不正な種別の場合は404を返す
 */
function resolveTableName(type: string): string {
  const tableName = TABLE_NAMES[type as GenbaMasterType]

  if (!tableName) {
    throw createError({
      statusCode: 404,
      message: '指定したマスタ種別は存在しません'
    })
  }

  return tableName
}

type MasterRow = {
  id: number
  name: string
  group_name?: string | null
  photo_url?: string | null
  last_unit_price?: number | null
  device_id: string
}

/**
登録者が共有(管理者)か自分の端末かに応じて、保存先となるdevice_idを決める。
アイドル・グループは各人ごとの興味が異なるため、管理者でも常に自分専用データとして保存する（会場のみ共有可）
 */
function resolveOwnerDeviceId(type: string, deviceId: string, isAdmin: boolean): string {
  if (type !== 'venues') {
    return deviceId
  }
  return isAdmin ? SHARED_DEVICE_ID : deviceId
}

function toGenbaMasterEntry(row: MasterRow, requestDeviceId: string): GenbaMasterEntry {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name ?? null,
    photoUrl: row.photo_url ?? null,
    lastUnitPrice: row.last_unit_price ?? null,
    scope: row.device_id === SHARED_DEVICE_ID ? 'shared' : (row.device_id === requestDeviceId ? 'mine' : 'shared')
  }
}

/**
マスタ一覧を取得する。全員共有のデータと、自分の端末が登録したデータのみを返す
 */
export async function listGenbaMasterEntries(type: string, deviceId: string): Promise<GenbaMasterEntry[]> {
  const db = await getGenbaDb()
  const tableName = resolveTableName(type)

  const result = await db.execute({
    sql: `
      SELECT * FROM ${tableName}
      WHERE device_id = ? OR device_id = ?
      ORDER BY name ASC
    `,
    args: [SHARED_DEVICE_ID, deviceId]
  })

  return (result.rows as unknown as MasterRow[]).map(row => toGenbaMasterEntry(row, deviceId))
}

/**
マスタを新規登録する。管理者なら共有データ、それ以外は自分の端末専用データとして登録する
 */
export async function createGenbaMasterEntry(type: string, input: GenbaMasterEntryInput, deviceId: string, isAdmin: boolean): Promise<GenbaMasterEntry> {
  const db = await getGenbaDb()
  const tableName = resolveTableName(type)
  const ownerDeviceId = resolveOwnerDeviceId(type, deviceId, isAdmin)

  try {
    const result = type === 'idols'
      ? await db.execute({ sql: `INSERT INTO ${tableName} (name, group_name, device_id) VALUES (?, ?, ?)`, args: [input.name, input.groupName, ownerDeviceId] })
      : await db.execute({ sql: `INSERT INTO ${tableName} (name, device_id) VALUES (?, ?)`, args: [input.name, ownerDeviceId] })

    const id = Number(result.lastInsertRowid)
    return {
      id,
      name: input.name,
      groupName: type === 'idols' ? input.groupName : null,
      photoUrl: null,
      lastUnitPrice: null,
      scope: ownerDeviceId === SHARED_DEVICE_ID ? 'shared' : 'mine'
    }
  } catch {
    throw createError({
      statusCode: 400,
      message: 'すでに同じ名前が登録されています'
    })
  }
}

/**
指定したマスタ行の所有権を確認する。共有データは管理者のみ、個人データは登録した端末のみ編集できる
 */
async function assertCanModify(db: Awaited<ReturnType<typeof getGenbaDb>>, tableName: string, id: number, deviceId: string, isAdmin: boolean): Promise<void> {
  const result = await db.execute({ sql: `SELECT device_id FROM ${tableName} WHERE id = ?`, args: [id] })
  const row = result.rows[0] as unknown as { device_id: string } | undefined

  if (!row) {
    throw createError({
      statusCode: 404,
      message: '指定したデータは見つかりませんでした'
    })
  }

  const isOwnEntry = row.device_id !== SHARED_DEVICE_ID && row.device_id === deviceId

  if (!isAdmin && !isOwnEntry) {
    throw createError({
      statusCode: 403,
      message: row.device_id === SHARED_DEVICE_ID
        ? '共有マスタの編集は管理者のみ行えます'
        : '他の人が登録したデータは編集できません'
    })
  }
}

/**
マスタを更新する
 */
export async function updateGenbaMasterEntry(type: string, id: number, input: GenbaMasterEntryInput, deviceId: string, isAdmin: boolean): Promise<GenbaMasterEntry> {
  const db = await getGenbaDb()
  const tableName = resolveTableName(type)

  await assertCanModify(db, tableName, id, deviceId, isAdmin)

  try {
    const result = type === 'idols'
      ? await db.execute({ sql: `UPDATE ${tableName} SET name = ?, group_name = ? WHERE id = ?`, args: [input.name, input.groupName, id] })
      : await db.execute({ sql: `UPDATE ${tableName} SET name = ? WHERE id = ?`, args: [input.name, id] })

    if (result.rowsAffected === 0) {
      throw createError({
        statusCode: 404,
        message: '指定したデータは見つかりませんでした'
      })
    }

    const row = (await db.execute({ sql: `SELECT * FROM ${tableName} WHERE id = ?`, args: [id] })).rows[0] as unknown as MasterRow
    return toGenbaMasterEntry(row, deviceId)
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode) {
      throw e
    }

    throw createError({
      statusCode: 400,
      message: 'すでに同じ名前が登録されています'
    })
  }
}

/**
マスタを削除する
 */
export async function deleteGenbaMasterEntry(type: string, id: number, deviceId: string, isAdmin: boolean): Promise<boolean> {
  const db = await getGenbaDb()
  const tableName = resolveTableName(type)

  await assertCanModify(db, tableName, id, deviceId, isAdmin)

  const result = await db.execute({ sql: `DELETE FROM ${tableName} WHERE id = ?`, args: [id] })
  return result.rowsAffected > 0
}

/**
マスタをまとめて登録する。同名などで失敗した行はスキップして件数を返す
 */
export async function createGenbaMasterEntriesBulk(type: string, inputs: GenbaMasterEntryInput[], deviceId: string, isAdmin: boolean): Promise<{ created: number, skipped: number }> {
  let created = 0
  let skipped = 0

  for (const input of inputs) {
    try {
      await createGenbaMasterEntry(type, input, deviceId, isAdmin)
      created += 1
    } catch {
      skipped += 1
    }
  }

  return { created, skipped }
}

/**
アイドルの写真URLを取得する（差し替え・削除時に旧ファイルをR2から消すために使う）
 */
export async function getGenbaIdolPhotoUrl(id: number): Promise<string | null> {
  const db = await getGenbaDb()
  const result = await db.execute({ sql: 'SELECT photo_url FROM genba_idols WHERE id = ?', args: [id] })
  const row = result.rows[0] as unknown as { photo_url: string | null } | undefined
  return row?.photo_url ?? null
}

/**
アイドルの写真URLを更新する（null を渡すと削除）。所有権チェックは共有マスタ更新と同じ規則
 */
export async function setGenbaIdolPhoto(id: number, photoUrl: string | null, deviceId: string, isAdmin: boolean): Promise<GenbaMasterEntry> {
  const db = await getGenbaDb()

  await assertCanModify(db, 'genba_idols', id, deviceId, isAdmin)

  const result = await db.execute({ sql: 'UPDATE genba_idols SET photo_url = ? WHERE id = ?', args: [photoUrl, id] })

  if (result.rowsAffected === 0) {
    throw createError({
      statusCode: 404,
      message: '指定したデータは見つかりませんでした'
    })
  }

  const row = (await db.execute({ sql: 'SELECT * FROM genba_idols WHERE id = ?', args: [id] })).rows[0] as unknown as MasterRow
  return toGenbaMasterEntry(row, deviceId)
}
