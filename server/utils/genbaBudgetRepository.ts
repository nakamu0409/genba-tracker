import { getGenbaDb } from './genbaDb'

// year_month にこの値を持つ行を「毎月共通のデフォルト予算」として扱う
const DEFAULT_KEY = 'default'

export type MonthlyBudgetResult = {
  monthlyAmount: number | null
  isDefault: boolean
}

/**
端末・ユーザーごとの指定月の予算を取得する。
その月の設定がなければデフォルト予算（毎月共通）にフォールバックし、どちらもなければnull
 */
export async function getMonthlyBudget(deviceId: string, yearMonth: string): Promise<MonthlyBudgetResult> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: 'SELECT year_month, monthly_amount FROM genba_budgets WHERE device_id = ? AND year_month IN (?, ?)',
    args: [deviceId, yearMonth, DEFAULT_KEY]
  })

  const rows = result.rows as unknown as { year_month: string, monthly_amount: number }[]
  const monthRow = rows.find(r => r.year_month === yearMonth)

  if (monthRow) {
    return { monthlyAmount: monthRow.monthly_amount, isDefault: false }
  }

  const defaultRow = rows.find(r => r.year_month === DEFAULT_KEY)
  return { monthlyAmount: defaultRow?.monthly_amount ?? null, isDefault: defaultRow !== undefined }
}

/**
指定月の予算を設定・更新する。nullを渡すと設定を削除する
 */
export async function setMonthlyBudget(deviceId: string, yearMonth: string, monthlyAmount: number | null): Promise<void> {
  const db = await getGenbaDb()

  if (monthlyAmount === null) {
    await db.execute({ sql: 'DELETE FROM genba_budgets WHERE device_id = ? AND year_month = ?', args: [deviceId, yearMonth] })
    return
  }

  await db.execute({
    sql: `
      INSERT INTO genba_budgets (device_id, year_month, monthly_amount) VALUES (?, ?, ?)
      ON CONFLICT(device_id, year_month) DO UPDATE SET monthly_amount = excluded.monthly_amount
    `,
    args: [deviceId, yearMonth, monthlyAmount]
  })
}

/**
毎月共通のデフォルト予算を設定する。
その月専用の設定が残っているとデフォルトが隠れてしまうため、指定月の個別設定も同時に削除する
 */
export async function setDefaultBudget(deviceId: string, yearMonth: string, monthlyAmount: number | null): Promise<void> {
  await setMonthlyBudget(deviceId, DEFAULT_KEY, monthlyAmount)
  await setMonthlyBudget(deviceId, yearMonth, null)
}
