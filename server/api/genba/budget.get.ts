import { createError, getQuery } from 'h3'
import { getMonthlyBudget } from '../../utils/genbaBudgetRepository'

/**
端末・ユーザーの指定月の予算を取得する（year, monthクエリ必須）
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const year = Number(query.year)
  const month = Number(query.month)

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw createError({
      statusCode: 400,
      message: 'year・monthを正しく指定してください'
    })
  }

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  return await getMonthlyBudget(event.context.deviceId!, yearMonth)
})
