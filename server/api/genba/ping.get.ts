import { getGenbaDb } from '../../utils/genbaDb'

/**
死活監視・スリープ防止用のエンドポイント。
DBに軽いクエリを投げることで、Renderのスリープ防止に加えてTurso接続の健全性も確認する
（接続が一時的に壊れていても、この呼び出しが再接続のきっかけになる）
 */
export default defineEventHandler(async () => {
  const db = await getGenbaDb()
  await db.execute('SELECT 1')
  return { ok: true }
})
