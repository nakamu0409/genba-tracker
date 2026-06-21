import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

let db: DatabaseSync | undefined

/**
genba用SQLiteの接続を取得する（プロセス内シングルトン）
 */
export function getGenbaDb(): DatabaseSync {
  if (db) {
    return db
  }

  const dataDir = join(process.cwd(), '.data')
  mkdirSync(dataDir, { recursive: true })

  db = new DatabaseSync(join(dataDir, 'genba.db'))
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS genba_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL DEFAULT '',
      event_name TEXT NOT NULL,
      event_date TEXT,
      venue_name TEXT,
      member_name TEXT,
      group_name TEXT,
      ticket_price INTEGER NOT NULL DEFAULT 0,
      drink_fee INTEGER NOT NULL DEFAULT 0,
      transport_fee INTEGER NOT NULL DEFAULT 0,
      memo TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
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

  migrateGenbaColumns(db)

  // マスタは device_id = '' が全員共有、それ以外は端末ごとの個人用データを表す
  ensureMasterTable(db, 'genba_venues', false)
  ensureMasterTable(db, 'genba_groups', false)
  ensureMasterTable(db, 'genba_idols', true)

  const idolColumns = db.prepare('PRAGMA table_info(genba_idols)').all() as { name: string }[]
  if (!idolColumns.some(c => c.name === 'photo_url')) {
    db.exec('ALTER TABLE genba_idols ADD COLUMN photo_url TEXT')
  }

  return db
}

/**
既存DBに後から追加したカラムを補う
 */
function migrateGenbaColumns(db: DatabaseSync): void {
  const eventColumns = db.prepare('PRAGMA table_info(genba_events)').all() as { name: string }[]
  const eventColumnNames = new Set(eventColumns.map(c => c.name))

  if (!eventColumnNames.has('device_id')) {
    db.exec('ALTER TABLE genba_events ADD COLUMN device_id TEXT NOT NULL DEFAULT \'\'')
  }

  if (!eventColumnNames.has('venue_name')) {
    db.exec('ALTER TABLE genba_events ADD COLUMN venue_name TEXT')
  }

  if (!eventColumnNames.has('transport_fee')) {
    db.exec('ALTER TABLE genba_events ADD COLUMN transport_fee INTEGER NOT NULL DEFAULT 0')
  }

  const itemColumns = db.prepare('PRAGMA table_info(genba_items)').all() as { name: string }[]
  const itemColumnNames = new Set(itemColumns.map(c => c.name))

  if (!itemColumnNames.has('member_name')) {
    db.exec('ALTER TABLE genba_items ADD COLUMN member_name TEXT')
  }

  if (!itemColumnNames.has('group_name')) {
    db.exec('ALTER TABLE genba_items ADD COLUMN group_name TEXT')
  }
}

/**
マスタテーブルを最新スキーマ（device_id列・(name, device_id)のユニーク索引）で用意する。
未作成なら新規作成し、旧スキーマ（nameに単独UNIQUE）であれば作り直して既存データを共有データとして引き継ぐ
 */
function ensureMasterTable(db: DatabaseSync, tableName: string, hasGroupName: boolean): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]
  const tableExists = columns.length > 0
  const hasDeviceId = columns.some(c => c.name === 'device_id')

  if (!tableExists) {
    db.exec(hasGroupName
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
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`)
    return
  }

  if (hasDeviceId) {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`)
    return
  }

  // 旧スキーマ（device_id列なし・nameに単独UNIQUE）からの移行: 既存データは共有データ(device_id='')として引き継ぐ
  db.exec('BEGIN')

  try {
    const tmpName = `${tableName}_legacy`
    db.exec(`ALTER TABLE ${tableName} RENAME TO ${tmpName}`)

    db.exec(hasGroupName
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

    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${tableName}_name_device ON ${tableName}(name, device_id)`)

    db.exec(hasGroupName
      ? `INSERT INTO ${tableName} (id, name, group_name, device_id) SELECT id, name, group_name, '' FROM ${tmpName}`
      : `INSERT INTO ${tableName} (id, name, device_id) SELECT id, name, '' FROM ${tmpName}`)

    db.exec(`DROP TABLE ${tmpName}`)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
