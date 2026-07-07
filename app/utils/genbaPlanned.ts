/**
開催日が未来（明日以降）の現場を「予定」として扱うための判定
 */
export function isPlannedGenbaDate(eventDate: string | null): boolean {
  if (!eventDate) {
    return false
  }

  const today = new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`

  return eventDate > todayStr
}
