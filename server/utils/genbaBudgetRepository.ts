import { getGenbaDb } from './genbaDb'

/**
端末・ユーザーごとの指定月の予算を取得する。未設定の場合はnull
 */
export async function getMonthlyBudget(deviceId: string, yearMonth: string): Promise<number | null> {
  const db = await getGenbaDb()

  const result = await db.execute({
    sql: 'SELECT monthly_amount FROM genba_budgets WHERE device_id = ? AND year_month = ?',
    args: [deviceId, yearMonth]
  })

  const row = result.rows[0] as unknown as { monthly_amount: number } | undefined
  return row?.monthly_amount ?? null
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
