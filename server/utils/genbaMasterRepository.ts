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
  device_id: string
}

/**
登録者が共有(管理者)か自分の端末かに応じて、保存先となるdevice_idを決める
 */
function resolveOwnerDeviceId(deviceId: string, isAdmin: boolean): string {
  return isAdmin ? SHARED_DEVICE_ID : deviceId
}

function toGenbaMasterEntry(row: MasterRow, requestDeviceId: string): GenbaMasterEntry {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name ?? null,
    photoUrl: row.photo_url ?? null,
    scope: row.device_id === SHARED_DEVICE_ID ? 'shared' : (row.device_id === requestDeviceId ? 'mine' : 'shared')
  }
}

/**
マスタ一覧を取得する。全員共有のデータと、自分の端末が登録したデータのみを返す
 */
export function listGenbaMasterEntries(type: string, deviceId: string): GenbaMasterEntry[] {
  const db = getGenbaDb()
  const tableName = resolveTableName(type)

  const rows = db.prepare(`
    SELECT * FROM ${tableName}
    WHERE device_id = ? OR device_id = ?
    ORDER BY name ASC
  `).all(SHARED_DEVICE_ID, deviceId) as unknown as MasterRow[]

  return rows.map(row => toGenbaMasterEntry(row, deviceId))
}

/**
マスタを新規登録する。管理者なら共有データ、それ以外は自分の端末専用データとして登録する
 */
export function createGenbaMasterEntry(type: string, input: GenbaMasterEntryInput, deviceId: string, isAdmin: boolean): GenbaMasterEntry {
  const db = getGenbaDb()
  const tableName = resolveTableName(type)
  const ownerDeviceId = resolveOwnerDeviceId(deviceId, isAdmin)

  try {
    const result = type === 'idols'
      ? db.prepare(`INSERT INTO ${tableName} (name, group_name, device_id) VALUES (?, ?, ?)`).run(input.name, input.groupName, ownerDeviceId)
      : db.prepare(`INSERT INTO ${tableName} (name, device_id) VALUES (?, ?)`).run(input.name, ownerDeviceId)

    const id = Number(result.lastInsertRowid)
    return {
      id,
      name: input.name,
      groupName: type === 'idols' ? input.groupName : null,
      photoUrl: null,
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
function assertCanModify(db: ReturnType<typeof getGenbaDb>, tableName: string, id: number, deviceId: string, isAdmin: boolean): void {
  const row = db.prepare(`SELECT device_id FROM ${tableName} WHERE id = ?`).get(id) as { device_id: string } | undefined

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
export function updateGenbaMasterEntry(type: string, id: number, input: GenbaMasterEntryInput, deviceId: string, isAdmin: boolean): GenbaMasterEntry {
  const db = getGenbaDb()
  const tableName = resolveTableName(type)

  assertCanModify(db, tableName, id, deviceId, isAdmin)

  try {
    const result = type === 'idols'
      ? db.prepare(`UPDATE ${tableName} SET name = ?, group_name = ? WHERE id = ?`).run(input.name, input.groupName, id)
      : db.prepare(`UPDATE ${tableName} SET name = ? WHERE id = ?`).run(input.name, id)

    if (result.changes === 0) {
      throw createError({
        statusCode: 404,
        message: '指定したデータは見つかりませんでした'
      })
    }

    const row = db.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).get(id) as unknown as MasterRow
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
export function deleteGenbaMasterEntry(type: string, id: number, deviceId: string, isAdmin: boolean): boolean {
  const db = getGenbaDb()
  const tableName = resolveTableName(type)

  assertCanModify(db, tableName, id, deviceId, isAdmin)

  const result = db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(id)
  return result.changes > 0
}

/**
マスタをまとめて登録する。同名などで失敗した行はスキップして件数を返す
 */
export function createGenbaMasterEntriesBulk(type: string, inputs: GenbaMasterEntryInput[], deviceId: string, isAdmin: boolean): { created: number, skipped: number } {
  let created = 0
  let skipped = 0

  for (const input of inputs) {
    try {
      createGenbaMasterEntry(type, input, deviceId, isAdmin)
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
export function getGenbaIdolPhotoUrl(id: number): string | null {
  const db = getGenbaDb()
  const row = db.prepare('SELECT photo_url FROM genba_idols WHERE id = ?').get(id) as { photo_url: string | null } | undefined
  return row?.photo_url ?? null
}

/**
アイドルの写真URLを更新する（null を渡すと削除）。所有権チェックは共有マスタ更新と同じ規則
 */
export function setGenbaIdolPhoto(id: number, photoUrl: string | null, deviceId: string, isAdmin: boolean): GenbaMasterEntry {
  const db = getGenbaDb()

  assertCanModify(db, 'genba_idols', id, deviceId, isAdmin)

  const result = db.prepare('UPDATE genba_idols SET photo_url = ? WHERE id = ?').run(photoUrl, id)

  if (result.changes === 0) {
    throw createError({
      statusCode: 404,
      message: '指定したデータは見つかりませんでした'
    })
  }

  const row = db.prepare('SELECT * FROM genba_idols WHERE id = ?').get(id) as unknown as MasterRow
  return toGenbaMasterEntry(row, deviceId)
}
