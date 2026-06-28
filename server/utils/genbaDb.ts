import { createClient, type Client } from '@libsql/client'
import { createError } from 'h3'
import { useRuntimeConfig } from '#imports'

let clientPromise: Promise<Client> | null = null

/**
Turso(libSQL)クライアントを取得する（プロセス内シングルトン）。初回呼び出し時にスキーマを用意する
 */
export function getGenbaDb(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = initClient()
  }
  return clientPromise
}

async function initClient(): Promise<Client> {
  const config = useRuntimeConfig()

  if (!config.turso.databaseUrl || !config.turso.authToken) {
    throw createError({
      statusCode: 500,
      message: 'データベース接続(Turso)が設定されていません。TURSO_DATABASE_URL/TURSO_AUTH_TOKENを設定してください'
    })
  }

  const client = createClient({
    url: config.turso.databaseUrl,
    authToken: config.turso.authToken
  })

  await ensureSchema(client)

  return client
}

/**
テーブル・インデックスを用意し、既存DBには後方互換のマイグレーションを適用する
 */
async function ensureSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS genba_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL,
      event_date TEXT,
      venue_name TEXT,
      member_name TEXT,
      group_name TEXT,
      budget_amount INTEGER,
      ticket_price INTEGER NOT NULL DEFAULT 0,
      drink_fee INTEGER NOT NULL DEFAULT 0,
      transport_fee INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS genba_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES genba_events(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK (category IN ('cheki', 'goods')),
      label TEXT NOT NULL,
      unit_price INTEGER NOT NULL DEFAULT 0,
      quantity INTEGER NOT NULL DEFAULT 1,
      member_name TEXT,
      group_name TEXT
    )
  `)

  await migrateGenbaColumns(client)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS genba_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS genba_login_tokens (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES genba_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      used_at TEXT
    )
  `)

  await client.execute(`
    CREATE TABLE IF NOT EXISTS genba_budgets (
      device_id TEXT NOT NULL,
      year_month TEXT NOT NULL,
      monthly_amount INTEGER NOT NULL,
      PRIMARY KEY (device_id, year_month)
    )
  `)

  await migrateGenbaBudgetsTable(client)

  // マスタは device_id = '' が全員共有、それ以外は端末ごとの個人用データを表す
  await ensureMasterTable(client, 'genba_venues', false)
  await ensureMasterTable(client, 'genba_groups', false)
  await ensureMasterTable(client, 'genba_idols', true)

  const idolColumns = (await client.execute('PRAGMA table_info(genba_idols)')).rows as unknown as { name: string }[]
  if (!idolColumns.some(c => c.name === 'photo_url')) {
    await client.execute('ALTER TABLE genba_idols ADD COLUMN photo_url TEXT')
  }
  if (!idolColumns.some(c => c.name === 'last_unit_price')) {
    await client.execute('ALTER TABLE genba_idols ADD COLUMN last_unit_price INTEGER')
  }
}

/**
既存DBに後から追加したカラムを補う
 */
async function migrateGenbaColumns(client: Client): Promise<void> {
  const eventColumns = (await client.execute('PRAGMA table_info(genba_events)')).rows as unknown as { name: string }[]
  const eventColumnNames = new Set(eventColumns.map(c => c.name))

  if (!eventColumnNames.has('device_id')) {
    await client.execute('ALTER TABLE genba_events ADD COLUMN device_id TEXT NOT NULL DEFAULT \'\'')
  }

  if (!eventColumnNames.has('venue_name')) {
    await client.execute('ALTER TABLE genba_events ADD COLUMN venue_name TEXT')
  }

  if (!eventColumnNames.has('transport_fee')) {
    await client.execute('ALTER TABLE genba_events ADD COLUMN transport_fee INTEGER NOT NULL DEFAULT 0')
  }

  if (!eventColumnNames.has('budget_amount')) {
    await client.execute('ALTER TABLE genba_events ADD COLUMN budget_amount INTEGER')
  }

  const itemColumns = (await client.execute('PRAGMA table_info(genba_items)')).rows as unknown as { name: string }[]
  const itemColumnNames = new Set(itemColumns.map(c => c.name))

  if (!itemColumnNames.has('member_name')) {
    await client.execute('ALTER TABLE genba_items ADD COLUMN member_name TEXT')
  }

  if (!itemColumnNames.has('group_name')) {
    await client.execute('ALTER TABLE genba_items ADD COLUMN group_name TEXT')
  }
}

/**
genba_budgetsを月別キー（device_id, year_month）のスキーマに揃える。
旧スキーマ（device_id単独PK、月の区別なし）が残っていた場合は作り直す
 */
async function migrateGenbaBudgetsTable(client: Client): Promise<void> {
  const columns = (await client.execute('PRAGMA table_info(genba_budgets)')).rows as unknown as { name: string }[]

  if (columns.some(c => c.name === 'year_month')) {
    return
  }

  await client.batch([
    'DROP TABLE genba_budgets',
    `CREATE TABLE genba_budgets (
      device_id TEXT NOT NULL,
      year_month TEXT NOT NULL,
      monthly_amount INTEGER NOT NULL,
      PRIMARY KEY (device_id, year_month)
    )`
  ], 'write')
}

/**
マスタテーブルを最新スキーマ（device_id列・(name, device_id)のユニーク索引）で用意する。
未作成なら新規作成し、旧スキーマ（nameに単独UNIQUE）であれば作り直して既存データを共有データとして引き継ぐ
 */
async function ensureMasterTable(client: Client, tableName: string, hasGroupName: boolean): Promise<void> {
  const columns = (await client.execute(`PRAGMA table_info(${tableName})`)).rows as unknown as { name: string }[]
  const tableExists = columns.length > 0
  const hasDeviceId = columns.some(c => c.name === 'device_id')

  if (!tableExists) {
    await client.execute(hasGroupName
      ? `CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          group_name TEXT,
          device_id TEXT NOT NULL DEFAULT ''
        )`
      : `CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          device_id TEXT NOT NULL DEFAULT ''
        )`)
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`)
    return
  }

  if (hasDeviceId) {
    await client.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`)
    return
  }

  // 旧スキーマ（device_id列なし・nameに単独UNIQUE）からの移行: 既存データは共有データ(device_id='')として引き継ぐ
  const tmpName = `${tableName}_legacy`

  await client.batch([
    `ALTER TABLE ${tableName} RENAME TO ${tmpName}`,
    hasGroupName
      ? `CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          group_name TEXT,
          device_id TEXT NOT NULL DEFAULT ''
        )`
      : `CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          device_id TEXT NOT NULL DEFAULT ''
        )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`,
    hasGroupName
      ? `INSERT INTO ${tableName} (id, name, group_name, device_id) SELECT id, name, group_name, '' FROM ${tmpName}`
      : `INSERT INTO ${tableName} (id, name, device_id) SELECT id, name, '' FROM ${tmpName}`,
    `DROP TABLE ${tmpName}`
  ], 'write')
}
