/**
日本時間での今日の日付（YYYY-MM-DD）を返す。
サーバーがUTCで動いていても「予定」判定が日本のユーザーの感覚とずれないようにする
 */
export function genbaTodayString(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}
