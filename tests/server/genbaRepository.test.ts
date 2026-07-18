import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync } from 'node:fs'
import { createClient, type Client } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenbaEventInput } from '../../shared/types/genba'

// getGenbaDbだけをテスト用のローカルファイルDBに差し替える（ensureSchema等は本物を使う）。
// :memory: は接続ごとに別DBになりトランザクションとテーブルを共有できないため、ファイルを使う
let testClient: Client
let testDbPath: string

vi.mock('../../server/utils/genbaDb', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../server/utils/genbaDb')>()
  return {
    ...mod,
    getGenbaDb: () => Promise.resolve(testClient)
  }
})

const { ensureSchema } = await import('../../server/utils/genbaDb')
const {
  createGenbaEvent,
  listGenbaEvents,
  getGenbaEventDetail,
  updateGenbaEvent,
  deleteGenbaEvent,
  getGenbaSummary,
  getYearlyOverview,
  getEventMemberBreakdown,
  setTicketPaid
} = await import('../../server/utils/genbaRepository')
const { getMonthlyBudget, setMonthlyBudget, setDefaultBudget } = await import('../../server/utils/genbaBudgetRepository')
const { migrateDeviceDataToUser } = await import('../../server/utils/genbaUserRepository')
const { addGenbaEventPhoto, listGenbaEventPhotos } = await import('../../server/utils/genbaPhotoRepository')

const TEST_DB_DIR = 'node_modules/.cache/genba-tests'

beforeEach(async () => {
  mkdirSync(TEST_DB_DIR, { recursive: true })
  testDbPath = `${TEST_DB_DIR}/${randomUUID()}.db`
  testClient = createClient({ url: `file:${testDbPath}` })
  await ensureSchema(testClient)
})

afterEach(() => {
  testClient.close()
  // Windowsではclose直後のファイルロックが残ることがあるため、削除失敗は無視する
  // （node_modules/.cache配下なのでゴミが残っても実害はない）
  try {
    rmSync(testDbPath, { force: true })
  } catch {
    // ignore
  }
})

const DEVICE_A = 'device-a'
const DEVICE_B = 'device-b'

const eventInput = (overrides: Partial<GenbaEventInput> = {}): GenbaEventInput => ({
  eventName: 'テストイベント',
  eventDate: '2020-01-10',
  venueName: 'テスト会場',
  ticketPrice: 1000,
  ticketPaid: true,
  drinkFee: 600,
  transportFee: 0,
  lodgingFee: 0,
  memo: null,
  rating: null,
  chekiItems: [],
  goodsItems: [],
  ...overrides
})

const insertIdol = async (deviceId: string, name: string, groupName: string | null) => {
  await testClient.execute({
    sql: 'INSERT INTO genba_idols (name, group_name, device_id) VALUES (?, ?, ?)',
    args: [name, groupName, deviceId]
  })
}

describe('genba_idolsとのJOINのデバイススコープ（チェキ増殖バグの再発防止）', () => {
  it('同じ推し名が複数デバイスに存在しても、チェキ枚数・金額が増幅されない', async () => {
    await insertIdol(DEVICE_A, '推しX', '自分のグループ')
    await insertIdol(DEVICE_B, '推しX', '他人のグループ')

    const created = await createGenbaEvent(DEVICE_A, eventInput({
      chekiItems: [{ label: '推しX', unitPrice: 1500, quantity: 2, memberName: '推しX' }]
    }))

    expect(created.chekiCount).toBe(2)
    expect(created.chekiTotal).toBe(3000)

    const listed = await listGenbaEvents(DEVICE_A)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.chekiCount).toBe(2)
    expect(listed[0]!.totalAmount).toBe(1000 + 600 + 3000)

    const detail = await getGenbaEventDetail(DEVICE_A, created.id)
    expect(detail!.items).toHaveLength(1)
  })

  it('グループ名は自分のデバイスのマスタから解決される', async () => {
    await insertIdol(DEVICE_A, '推しX', '自分のグループ')
    await insertIdol(DEVICE_B, '推しX', '他人のグループ')

    const created = await createGenbaEvent(DEVICE_A, eventInput({
      chekiItems: [{ label: '推しX', unitPrice: 1000, quantity: 1, memberName: '推しX' }]
    }))

    expect(created.groupNames).toEqual(['自分のグループ'])
  })

  it('チェキ単価の学習（last_unit_price）は自分のデバイスのマスタだけを更新する', async () => {
    await insertIdol(DEVICE_A, '推しX', null)
    await insertIdol(DEVICE_B, '推しX', null)

    await createGenbaEvent(DEVICE_A, eventInput({
      chekiItems: [{ label: '推しX', unitPrice: 1500, quantity: 1, memberName: '推しX' }]
    }))

    const rows = (await testClient.execute('SELECT device_id, last_unit_price FROM genba_idols ORDER BY device_id')).rows
    expect(rows.find(r => r.device_id === DEVICE_A)!.last_unit_price).toBe(1500)
    expect(rows.find(r => r.device_id === DEVICE_B)!.last_unit_price).toBeNull()
  })
})

describe('デバイス間のデータ分離', () => {
  it('他デバイスの現場は参照・更新・削除できない', async () => {
    const created = await createGenbaEvent(DEVICE_A, eventInput())

    expect(await listGenbaEvents(DEVICE_B)).toHaveLength(0)
    expect(await getGenbaEventDetail(DEVICE_B, created.id)).toBeUndefined()
    expect(await updateGenbaEvent(DEVICE_B, created.id, eventInput({ eventName: '乗っ取り' }))).toBeUndefined()
    expect(await deleteGenbaEvent(DEVICE_B, created.id)).toBe(false)
    expect(await setTicketPaid(DEVICE_B, created.id, false)).toBe(false)

    // 本人は操作できる
    expect(await setTicketPaid(DEVICE_A, created.id, false)).toBe(true)
    const detail = await getGenbaEventDetail(DEVICE_A, created.id)
    expect(detail!.ticketPaid).toBe(false)
  })
})

describe('集計と予定の除外', () => {
  it('未来日付（予定）の現場は集計・年間まとめに含まれない', async () => {
    await createGenbaEvent(DEVICE_A, eventInput({
      eventDate: '2020-03-01',
      chekiItems: [{ label: '推しX', unitPrice: 1000, quantity: 3, memberName: '推しX' }]
    }))
    await createGenbaEvent(DEVICE_A, eventInput({
      eventDate: '2099-12-01',
      chekiItems: [{ label: '推しX', unitPrice: 9999, quantity: 5, memberName: '推しX' }]
    }))

    const summary = await getGenbaSummary(DEVICE_A)
    const row = summary.find(r => r.memberName === '推しX')
    expect(row!.chekiCount).toBe(3)
    expect(row!.totalAmount).toBe(3000)

    const overview2020 = await getYearlyOverview(DEVICE_A, 2020)
    expect(overview2020.eventCount).toBe(1)
    expect(overview2020.chekiCount).toBe(3)
    expect(overview2020.venueCount).toBe(1)

    const overview2099 = await getYearlyOverview(DEVICE_A, 2099)
    expect(overview2099.eventCount).toBe(0)
    expect(overview2099.totalAmount).toBe(0)
  })

  it('現場ごとの推し別内訳が正しく分かれる', async () => {
    const created = await createGenbaEvent(DEVICE_A, eventInput({
      chekiItems: [
        { label: 'A', unitPrice: 2000, quantity: 1, memberName: '推しA' },
        { label: 'B', unitPrice: 1500, quantity: 2, memberName: '推しB' }
      ]
    }))

    const breakdown = await getEventMemberBreakdown(DEVICE_A)
    const rowA = breakdown.find(r => r.eventId === created.id && r.memberName === '推しA')
    const rowB = breakdown.find(r => r.eventId === created.id && r.memberName === '推しB')

    expect(rowA!.amount).toBe(2000)
    expect(rowA!.chekiCount).toBe(1)
    expect(rowB!.amount).toBe(3000)
    expect(rowB!.chekiCount).toBe(2)
  })
})

describe('月予算', () => {
  it('月別設定 > デフォルト予算 > 未設定 の順で解決される', async () => {
    expect((await getMonthlyBudget(DEVICE_A, '2026-07')).monthlyAmount).toBeNull()

    await setDefaultBudget(DEVICE_A, '2026-07', 30000)
    const fallback = await getMonthlyBudget(DEVICE_A, '2026-08')
    expect(fallback.monthlyAmount).toBe(30000)
    expect(fallback.isDefault).toBe(true)

    await setMonthlyBudget(DEVICE_A, '2026-08', 50000)
    const overridden = await getMonthlyBudget(DEVICE_A, '2026-08')
    expect(overridden.monthlyAmount).toBe(50000)
    expect(overridden.isDefault).toBe(false)

    // 他デバイスには影響しない
    expect((await getMonthlyBudget(DEVICE_B, '2026-08')).monthlyAmount).toBeNull()
  })
})

describe('ログイン時のデータ移行', () => {
  it('現場・写真・予算・マスタがユーザースコープへ移行される（重複は移行先を優先）', async () => {
    const USER = 'u1'

    const created = await createGenbaEvent(DEVICE_A, eventInput())
    await addGenbaEventPhoto(DEVICE_A, created.id, 'https://example.com/photo.png')
    await setMonthlyBudget(DEVICE_A, '2026-07', 10000)
    await setMonthlyBudget(USER, '2026-07', 99999) // 移行先に同月の予算が既にある
    await setMonthlyBudget(DEVICE_A, '2026-08', 20000)
    await insertIdol(DEVICE_A, '推しX', 'グループG')
    await insertIdol(USER, '推しX', 'グループG') // 移行先に同名マスタが既にある

    await migrateDeviceDataToUser(DEVICE_A, USER)

    expect(await listGenbaEvents(DEVICE_A)).toHaveLength(0)
    const migrated = await listGenbaEvents(USER)
    expect(migrated).toHaveLength(1)
    expect(await listGenbaEventPhotos(USER, migrated[0]!.id)).toHaveLength(1)

    // 重複した月は移行先の値を維持、重複しない月は移行される
    expect((await getMonthlyBudget(USER, '2026-07')).monthlyAmount).toBe(99999)
    expect((await getMonthlyBudget(USER, '2026-08')).monthlyAmount).toBe(20000)

    // マスタは重複が1件に収まり、旧デバイス側には残らない
    const idols = (await testClient.execute('SELECT device_id, name FROM genba_idols')).rows
    expect(idols.filter(r => r.name === '推しX')).toHaveLength(1)
    expect(idols[0]!.device_id).toBe(USER)
  })
})
