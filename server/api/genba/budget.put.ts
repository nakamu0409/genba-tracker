import { createError, readBody } from 'h3'
import { setDefaultBudget, setMonthlyBudget } from '../../utils/genbaBudgetRepository'

/**
端末・ユーザーの指定月の予算を設定・更新する。monthlyAmountにnullを渡すと設定を削除する。
asDefaultをtrueにすると毎月共通のデフォルト予算として保存する
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const year = Number(body?.year)
  const month = Number(body?.month)
  const asDefault = body?.asDefault === true

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw createError({
      statusCode: 400,
      message: 'year・monthを正しく指定してください'
    })
  }

  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  const raw = body?.monthlyAmount

  const save = (amount: number | null) => asDefault
    ? setDefaultBudget(event.context.deviceId!, yearMonth, amount)
    : setMonthlyBudget(event.context.deviceId!, yearMonth, amount)

  if (raw === null || raw === undefined || raw === '') {
    await save(null)
    return { monthlyAmount: null, isDefault: false }
  }

  const amount = Number(raw)

  if (!Number.isFinite(amount) || amount < 0) {
    throw createError({
      statusCode: 400,
      message: '予算は0以上の数値で入力してください'
    })
  }

  const monthlyAmount = Math.round(amount)
  await save(monthlyAmount)
  return { monthlyAmount, isDefault: asDefault }
})
