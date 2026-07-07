import { getGenbaDb } from './genbaDb'
import type { GenbaPhoto } from '../../shared/types/genba'

/**
現場に紐づくチェキフォトの一覧を取得する（指定端末の記録のみ）
 */
export async function listGenbaEventPhotos(deviceId: string, eventId: number): Promise<GenbaPhoto[]> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: 'SELECT id, photo_url FROM genba_photos WHERE event_id = ? AND device_id = ? ORDER BY id ASC',
    args: [eventId, deviceId]
  })

  return (result.rows as unknown as { id: number, photo_url: string }[])
    .map(row => ({ id: row.id, url: row.photo_url }))
}

/**
現場にチェキフォトを追加する。現場が指定端末のものでない場合はundefined
 */
export async function addGenbaEventPhoto(deviceId: string, eventId: number, photoUrl: string): Promise<GenbaPhoto | undefined> {
  const db = await getGenbaDb()

  const owned = await db.execute({
    sql: 'SELECT id FROM genba_events WHERE id = ? AND device_id = ?',
    args: [eventId, deviceId]
  })

  if (owned.rows.length === 0) {
    return undefined
  }

  const result = await db.execute({
    sql: 'INSERT INTO genba_photos (event_id, device_id, photo_url) VALUES (?, ?, ?)',
    args: [eventId, deviceId, photoUrl]
  })

  return { id: Number(result.lastInsertRowid), url: photoUrl }
}

/**
チェキフォトを1枚削除し、削除した写真のURLを返す。指定端末の写真でない場合はundefined
 */
export async function deleteGenbaEventPhoto(deviceId: string, photoId: number): Promise<string | undefined> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: 'SELECT photo_url FROM genba_photos WHERE id = ? AND device_id = ?',
    args: [photoId, deviceId]
  })

  const row = result.rows[0] as unknown as { photo_url: string } | undefined

  if (!row) {
    return undefined
  }

  await db.execute({ sql: 'DELETE FROM genba_photos WHERE id = ?', args: [photoId] })
  return row.photo_url
}

/**
現場に紐づくチェキフォトのURL一覧を取得する（現場削除時のR2クリーンアップ用）
 */
export async function listGenbaEventPhotoUrls(deviceId: string, eventId: number): Promise<string[]> {
  const photos = await listGenbaEventPhotos(deviceId, eventId)
  return photos.map(p => p.url)
}
