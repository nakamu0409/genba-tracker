import { createError } from 'h3'
import type { GenbaEventInput, GenbaItemInput, GenbaMasterEntryInput } from '../../shared/types/genba'

/**
数値項目を検証する（0以上の整数）
 */
function toNonNegativeInt(value: unknown, fieldLabel: string): number {
  const num = Number(value)

  if (!Number.isFinite(num) || num < 0) {
    throw createError({
      statusCode: 400,
      message: `${fieldLabel}は0以上の数値で入力してください`
    })
  }

  return Math.round(num)
}

/**
チェキ・グッズの明細リストを検証する
 *
チェキは項目名の入力を求めず推し（メンバー）の入力を必須とし、項目名は推し名から自動で補う。
グッズは逆に項目名の入力を必須とし、推しは任意とする。
 */
function parseItems(raw: unknown, categoryLabel: string, requireMember: boolean): GenbaItemInput[] {
  if (raw === undefined || raw === null) {
    return []
  }

  if (!Array.isArray(raw)) {
    throw createError({
      statusCode: 400,
      message: `${categoryLabel}の明細形式が不正です`
    })
  }

  return raw.map((item) => {
    const data = item as Record<string, unknown>
    const memberName = data?.memberName ? String(data.memberName).trim() : null

    if (requireMember && !memberName) {
      throw createError({
        statusCode: 400,
        message: `${categoryLabel}は推し（メンバー）を入力してください`
      })
    }

    const label = String(data?.label ?? '').trim() || memberName

    if (!label) {
      throw createError({
        statusCode: 400,
        message: `${categoryLabel}の項目名を入力してください`
      })
    }

    return {
      label,
      unitPrice: toNonNegativeInt(data?.unitPrice, `${categoryLabel}の単価`),
      quantity: Math.max(1, toNonNegativeInt(data?.quantity ?? 1, `${categoryLabel}の数量`)),
      memberName
    }
  })
}

/**
リクエストボディを現場登録・更新用の入力データに変換する
 */
export function parseGenbaEventInput(body: unknown): GenbaEventInput {
  const data = (body ?? {}) as Record<string, unknown>

  const eventName = String(data.eventName ?? '').trim()

  if (!eventName) {
    throw createError({
      statusCode: 400,
      message: 'イベント名を入力してください'
    })
  }

  const eventDate = data.eventDate ? String(data.eventDate) : null
  const venueName = data.venueName ? String(data.venueName).trim() : null
  const memo = data.memo ? String(data.memo) : null

  return {
    eventName,
    eventDate,
    venueName,
    ticketPrice: toNonNegativeInt(data.ticketPrice ?? 0, 'チケット代'),
    drinkFee: toNonNegativeInt(data.drinkFee ?? 0, 'ドリンク代'),
    transportFee: toNonNegativeInt(data.transportFee ?? 0, '交通費'),
    memo,
    chekiItems: parseItems(data.chekiItems, 'チェキ', true),
    goodsItems: parseItems(data.goodsItems, 'グッズ', false)
  }
}

/**
リクエストボディをマスタ登録・更新用の入力データに変換する
 */
export function parseGenbaMasterEntryInput(body: unknown): GenbaMasterEntryInput {
  const data = (body ?? {}) as Record<string, unknown>

  const name = String(data.name ?? '').trim()

  if (!name) {
    throw createError({
      statusCode: 400,
      message: '名前を入力してください'
    })
  }

  return {
    name,
    groupName: data.groupName ? String(data.groupName).trim() : null
  }
}

/**
複数行テキストをマスタの一括登録用データに変換する（1行: 「名前」または「名前,グループ名」）
 */
export function parseGenbaMasterBulkInput(body: unknown): GenbaMasterEntryInput[] {
  const data = (body ?? {}) as Record<string, unknown>
  const text = String(data.text ?? '')

  return text
    .split(/\r?\n/)
    .map((line) => {
      const [namePart, groupPart] = line.split(',')
      return {
        name: (namePart ?? '').trim(),
        groupName: groupPart?.trim() || null
      }
    })
    .filter(entry => entry.name)
}
