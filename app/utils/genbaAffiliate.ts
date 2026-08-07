/**
Trip.comの成果リンクを組み立てる。ID未設定の場合は通常のリンクのまま返す
 */
export function buildTripAffiliateUrl(baseUrl: string, allianceId: string, sid: string): string {
  if (!allianceId || !sid) return baseUrl
  return `${baseUrl}?Allianceid=${allianceId}&SID=${sid}`
}

/**
Amazonアソシエイトの成果リンクを組み立てる。トラッキングID(tag)が未設定の場合は通常のリンクのまま返す。
商品ページ・検索ページどちらのURLでも tag クエリを付与する
 */
export function buildAmazonAffiliateUrl(targetUrl: string, tag: string): string {
  if (!tag) return targetUrl
  try {
    const url = new URL(targetUrl)
    url.searchParams.set('tag', tag)
    return url.toString()
  } catch {
    return targetUrl
  }
}
