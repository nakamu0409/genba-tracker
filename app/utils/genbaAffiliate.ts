/**
楽天アフィリエイトの成果リンクを組み立てる。IDが未設定の場合は通常のリンクのまま返す
 */
export function buildRakutenAffiliateUrl(targetUrl: string, affiliateId: string): string {
  if (!affiliateId) return targetUrl
  return `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/?pc=${encodeURIComponent(targetUrl)}`
}

/**
Trip.comの成果リンクを組み立てる。ID未設定の場合は通常のリンクのまま返す
 */
export function buildTripAffiliateUrl(baseUrl: string, allianceId: string, sid: string): string {
  if (!allianceId || !sid) return baseUrl
  return `${baseUrl}?Allianceid=${allianceId}&SID=${sid}`
}
