import type { Transaction } from '@libsql/client'
import { getGenbaDb } from './genbaDb'
import type {
  GenbaEvent,
  GenbaEventDetail,
  GenbaEventInput,
  GenbaItem,
  GenbaMemberTrend,
  GenbaSummaryRow,
  GenbaYearlyOverview
} from '../../shared/types/genba'

type EventRow = {
  id: number
  event_name: string
  event_date: string | null
  venue_name: string | null
  ticket_price: number
  drink_fee: number
  transport_fee: number
  memo: string | null
  rating: number | null
  created_at: string
  cheki_total: number
  cheki_count: number
  goods_total: number
  member_names: string | null
  group_names: string | null
}

type ItemRow = {
  id: number
  category: 'cheki' | 'goods'
  label: string
  unit_price: number
  quantity: number
  member_name: string | null
  group_name: string | null
}

/**
カンマ区切りの集約結果を配列に変換する（空文字は除外）
 */
function splitNames(value: string | null): string[] {
  if (!value) return []
  return [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))]
}

/**
イベント1行をレスポンス用の形式に変換する
 */
function toGenbaEvent(row: EventRow): GenbaEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    eventDate: row.event_date,
    venueName: row.venue_name,
    memberNames: splitNames(row.member_names),
    groupNames: splitNames(row.group_names),
    ticketPrice: row.ticket_price,
    drinkFee: row.drink_fee,
    transportFee: row.transport_fee,
    memo: row.memo,
    rating: row.rating,
    createdAt: row.created_at,
    chekiTotal: row.cheki_total,
    chekiCount: row.cheki_count,
    goodsTotal: row.goods_total,
    totalAmount: row.ticket_price + row.drink_fee + row.transport_fee + row.cheki_total + row.goods_total
  }
}

// グループはアイドルマスタに紐づく所属を常に正とするため、明細のmember_nameからgenba_idolsを参照して導出する
const EVENT_SELECT = `
  SELECT
    e.id, e.event_name, e.event_date, e.venue_name,
    e.ticket_price, e.drink_fee, e.transport_fee, e.memo, e.rating, e.created_at,
    COALESCE(SUM(CASE WHEN i.category = 'cheki' THEN i.unit_price * i.quantity ELSE 0 END), 0) AS cheki_total,
    COALESCE(SUM(CASE WHEN i.category = 'cheki' THEN i.quantity ELSE 0 END), 0) AS cheki_count,
    COALESCE(SUM(CASE WHEN i.category = 'goods' THEN i.unit_price * i.quantity ELSE 0 END), 0) AS goods_total,
    GROUP_CONCAT(DISTINCT NULLIF(i.member_name, '')) AS member_names,
    GROUP_CONCAT(DISTINCT NULLIF(gi.group_name, '')) AS group_names
  FROM genba_events e
  LEFT JOIN genba_items i ON i.event_id = e.id
  LEFT JOIN genba_idols gi ON gi.name = i.member_name
`

type ListFilter = {
  memberName?: string
  groupName?: string
}

/**
現場一覧を取得する（端末ごとに分離、推し名・グループ名の明細を含む現場のみで絞り込み可能）
 */
export async function listGenbaEvents(deviceId: string, filter: ListFilter = {}): Promise<GenbaEvent[]> {
  const db = await getGenbaDb()

  const conditions: string[] = ['e.device_id = ?']
  const params: string[] = [deviceId]

  if (filter.memberName) {
    conditions.push('e.id IN (SELECT event_id FROM genba_items WHERE member_name = ?)')
    params.push(filter.memberName)
  }

  if (filter.groupName) {
    conditions.push(`
      e.id IN (
        SELECT i2.event_id FROM genba_items i2
        INNER JOIN genba_idols gi2 ON gi2.name = i2.member_name
        WHERE gi2.group_name = ?
      )
    `)
    params.push(filter.groupName)
  }

  const result = await db.execute({
    sql: `
      ${EVENT_SELECT}
      WHERE ${conditions.join(' AND ')}
      GROUP BY e.id
      ORDER BY e.event_date DESC, e.id DESC
    `,
    args: params
  })

  return (result.rows as unknown as EventRow[]).map(toGenbaEvent)
}

/**
現場の詳細（チェキ・グッズの内訳を含む）を取得する。指定端末の記録のみ取得可能
 */
export async function getGenbaEventDetail(deviceId: string, id: number): Promise<GenbaEventDetail | undefined> {
  const db = await getGenbaDb()

  const eventResult = await db.execute({
    sql: `
      ${EVENT_SELECT}
      WHERE e.id = ? AND e.device_id = ?
      GROUP BY e.id
    `,
    args: [id, deviceId]
  })

  const eventRow = eventResult.rows[0] as unknown as EventRow | undefined

  if (!eventRow) {
    return undefined
  }

  const itemResult = await db.execute({
    sql: `
      SELECT i.id, i.category, i.label, i.unit_price, i.quantity, i.member_name,
        gi.group_name AS group_name
      FROM genba_items i
      LEFT JOIN genba_idols gi ON gi.name = i.member_name
      WHERE i.event_id = ?
      ORDER BY i.id ASC
    `,
    args: [id]
  })

  const items: GenbaItem[] = (itemResult.rows as unknown as ItemRow[]).map(row => ({
    id: row.id,
    category: row.category,
    label: row.label,
    unitPrice: row.unit_price,
    quantity: row.quantity,
    memberName: row.member_name,
    groupName: row.group_name
  }))

  return {
    ...toGenbaEvent(eventRow),
    items
  }
}

/**
チェキ・グッズの明細行をイベントに紐づけて登録する
 */
async function insertItems(tx: Transaction, eventId: number, input: GenbaEventInput): Promise<void> {
  const insertSql = `
    INSERT INTO genba_items (event_id, category, label, unit_price, quantity, member_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  const updateLastPriceSql = 'UPDATE genba_idols SET last_unit_price = ? WHERE name = ?'

  for (const item of [...input.chekiItems, ...input.goodsItems]) {
    const category = input.chekiItems.includes(item) ? 'cheki' : 'goods'
    await tx.execute({ sql: insertSql, args: [eventId, category, item.label, item.unitPrice, item.quantity, item.memberName] })

    if (item.memberName && item.unitPrice > 0) {
      await tx.execute({ sql: updateLastPriceSql, args: [item.unitPrice, item.memberName] })
    }
  }
}

/**
現場を新規登録する
 */
export async function createGenbaEvent(deviceId: string, input: GenbaEventInput): Promise<GenbaEventDetail> {
  const db = await getGenbaDb()
  const tx = await db.transaction('write')

  try {
    const result = await tx.execute({
      sql: `
        INSERT INTO genba_events (device_id, event_name, event_date, venue_name, ticket_price, drink_fee, transport_fee, memo, rating)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        deviceId,
        input.eventName,
        input.eventDate,
        input.venueName,
        input.ticketPrice,
        input.drinkFee,
        input.transportFee,
        input.memo,
        input.rating
      ]
    })

    const eventId = Number(result.lastInsertRowid)
    await insertItems(tx, eventId, input)

    await tx.commit()

    return (await getGenbaEventDetail(deviceId, eventId))!
  } catch (e) {
    await tx.rollback()
    throw e
  } finally {
    tx.close()
  }
}

/**
現場の内容を更新する（明細は一旦削除して入れ直す）。指定端末の記録のみ更新可能
 */
export async function updateGenbaEvent(deviceId: string, id: number, input: GenbaEventInput): Promise<GenbaEventDetail | undefined> {
  const db = await getGenbaDb()
  const tx = await db.transaction('write')

  try {
    const result = await tx.execute({
      sql: `
        UPDATE genba_events
        SET event_name = ?, event_date = ?, venue_name = ?,
            ticket_price = ?, drink_fee = ?, transport_fee = ?, memo = ?, rating = ?
        WHERE id = ? AND device_id = ?
      `,
      args: [
        input.eventName,
        input.eventDate,
        input.venueName,
        input.ticketPrice,
        input.drinkFee,
        input.transportFee,
        input.memo,
        input.rating,
        id,
        deviceId
      ]
    })

    if (result.rowsAffected === 0) {
      await tx.rollback()
      return undefined
    }

    await tx.execute({ sql: 'DELETE FROM genba_items WHERE event_id = ?', args: [id] })
    await insertItems(tx, id, input)

    await tx.commit()

    return await getGenbaEventDetail(deviceId, id)
  } catch (e) {
    await tx.rollback()
    throw e
  } finally {
    tx.close()
  }
}

/**
現場を削除する。指定端末の記録のみ削除可能（明細は外部キーのCASCADEに依存せず明示的に削除する）
 */
export async function deleteGenbaEvent(deviceId: string, id: number): Promise<boolean> {
  const db = await getGenbaDb()
  const tx = await db.transaction('write')

  try {
    const result = await tx.execute({ sql: 'DELETE FROM genba_events WHERE id = ? AND device_id = ?', args: [id, deviceId] })

    if (result.rowsAffected > 0) {
      await tx.execute({ sql: 'DELETE FROM genba_items WHERE event_id = ?', args: [id] })
    }

    await tx.commit()
    return result.rowsAffected > 0
  } catch (e) {
    await tx.rollback()
    throw e
  } finally {
    tx.close()
  }
}

export type GenbaSummaryFilter = {
  year: number
  month?: number // 1始まり、省略時は年間全体
}

/**
推し・グループ別の支出集計を取得する（指定端末の記録のみ。チケット代・ドリンク代・交通費は含まずチェキ・グッズの明細金額のみ集計。チェキ枚数は単価0円の特典分も含めて集計）
 *
filterを指定すると、その月（またはmonth省略時はその年全体）に開催された現場の明細だけに絞り込む
 */
export async function getGenbaSummary(deviceId: string, filter?: GenbaSummaryFilter): Promise<GenbaSummaryRow[]> {
  const db = await getGenbaDb()

  const conditions = ['e.device_id = ?']
  const params: (string | number)[] = [deviceId]

  if (filter) {
    const datePrefix = filter.month ? `${filter.year}-${String(filter.month).padStart(2, '0')}-` : `${filter.year}-`
    conditions.push('e.event_date LIKE ?')
    params.push(`${datePrefix}%`)
  }

  const result = await db.execute({
    sql: `
      SELECT
        COALESCE(i.member_name, '') AS member_name,
        COALESCE(gi.group_name, '') AS group_name,
        COUNT(DISTINCT i.event_id) AS event_count,
        COALESCE(SUM(CASE WHEN i.category = 'cheki' THEN i.quantity ELSE 0 END), 0) AS cheki_count,
        COALESCE(SUM(i.unit_price * i.quantity), 0) AS total_amount
      FROM genba_items i
      INNER JOIN genba_events e ON e.id = i.event_id
      LEFT JOIN genba_idols gi ON gi.name = i.member_name
      WHERE ${conditions.join(' AND ')}
      GROUP BY i.member_name, gi.group_name
      ORDER BY total_amount DESC
    `,
    args: params
  })

  const rows = result.rows as unknown as {
    member_name: string
    group_name: string
    event_count: number
    cheki_count: number
    total_amount: number
  }[]

  return rows.map(row => ({
    key: `${row.member_name}__${row.group_name}`,
    memberName: row.member_name || null,
    groupName: row.group_name || null,
    eventCount: row.event_count,
    chekiCount: row.cheki_count,
    totalAmount: row.total_amount
  }))
}

/**
指定年の年間まとめ（総額・現場回数・チェキ枚数・月別支出・最高額/最多チェキの現場・推し別ランキング）を取得する
 */
export async function getYearlyOverview(deviceId: string, year: number): Promise<GenbaYearlyOverview> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: `
      ${EVENT_SELECT}
      WHERE e.device_id = ? AND e.event_date LIKE ?
      GROUP BY e.id
    `,
    args: [deviceId, `${year}-%`]
  })

  const events = (result.rows as unknown as EventRow[]).map(toGenbaEvent)
  const ranking = await getGenbaSummary(deviceId, { year })

  const totalAmount = events.reduce((sum, e) => sum + e.totalAmount, 0)
  const chekiCount = events.reduce((sum, e) => sum + e.chekiCount, 0)

  const monthlyTotalsMap = new Map<number, number>()
  for (const e of events) {
    if (!e.eventDate) continue
    const month = Number(e.eventDate.slice(5, 7))
    monthlyTotalsMap.set(month, (monthlyTotalsMap.get(month) ?? 0) + e.totalAmount)
  }
  const monthlyTotals = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    totalAmount: monthlyTotalsMap.get(i + 1) ?? 0
  }))

  const monthlyRatingsMap = new Map<number, number[]>()
  for (const e of events) {
    if (!e.eventDate || e.rating === null) continue
    const month = Number(e.eventDate.slice(5, 7))
    const list = monthlyRatingsMap.get(month) ?? []
    list.push(e.rating)
    monthlyRatingsMap.set(month, list)
  }
  const monthlyAverageRatings = Array.from({ length: 12 }, (_, i) => {
    const ratings = monthlyRatingsMap.get(i + 1)
    return {
      month: i + 1,
      averageRating: ratings && ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null
    }
  })

  const topEventByAmount = events.length > 0
    ? events.reduce((top, e) => (e.totalAmount > top.totalAmount ? e : top))
    : null

  const chekiEvents = events.filter(e => e.chekiCount > 0)
  const topEventByChekiCount = chekiEvents.length > 0
    ? chekiEvents.reduce((top, e) => (e.chekiCount > top.chekiCount ? e : top))
    : null

  const ratedEvents = events.filter((e): e is GenbaEvent & { rating: number } => e.rating !== null)
  const topEventByRating = ratedEvents.length > 0
    ? ratedEvents.reduce((top, e) => (e.rating > top.rating ? e : top))
    : null
  const averageRating = ratedEvents.length > 0
    ? ratedEvents.reduce((sum, e) => sum + e.rating, 0) / ratedEvents.length
    : null

  return {
    year,
    totalAmount,
    eventCount: events.length,
    chekiCount,
    monthlyTotals,
    monthlyAverageRatings,
    averageRating,
    topEventByAmount,
    topEventByChekiCount,
    topEventByRating,
    ranking
  }
}

/**
指定した推しの、指定年における月別支出トレンドを取得する（チケット代等は含まずチェキ・グッズの明細金額のみ集計）
 */
export async function getMemberTrend(deviceId: string, year: number, memberName: string): Promise<GenbaMemberTrend> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: `
      SELECT
        CAST(strftime('%m', e.event_date) AS INTEGER) AS month,
        COALESCE(SUM(i.unit_price * i.quantity), 0) AS total_amount,
        COALESCE(SUM(CASE WHEN i.category = 'cheki' THEN i.quantity ELSE 0 END), 0) AS cheki_count
      FROM genba_items i
      INNER JOIN genba_events e ON e.id = i.event_id
      WHERE e.device_id = ? AND i.member_name = ? AND e.event_date LIKE ?
      GROUP BY month
    `,
    args: [deviceId, memberName, `${year}-%`]
  })

  const rows = result.rows as unknown as { month: number, total_amount: number, cheki_count: number }[]
  const rowByMonth = new Map(rows.map(r => [r.month, r]))

  const monthlyTotals = Array.from({ length: 12 }, (_, i) => {
    const row = rowByMonth.get(i + 1)
    return {
      month: i + 1,
      totalAmount: row?.total_amount ?? 0,
      chekiCount: row?.cheki_count ?? 0
    }
  })

  return {
    year,
    memberName,
    totalAmount: monthlyTotals.reduce((sum, m) => sum + m.totalAmount, 0),
    chekiCount: monthlyTotals.reduce((sum, m) => sum + m.chekiCount, 0),
    monthlyTotals
  }
}
