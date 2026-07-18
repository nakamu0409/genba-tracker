export type GenbaDiagnosisInput = {
  eventCount: number
  chekiCount: number
  averageRating: number | null
  venueCount: number
  ranking: { memberName: string | null, totalAmount: number }[]
}

export type GenbaDiagnosis = {
  emoji: string
  title: string
  tagline: string
  statLine: string
}

/**
現場記録から「オタ活診断」タイプを1つ判定する（Spotify Wrapped的な遊び要素）。
ルールは上から順に判定し、最初に条件を満たしたものを採用する
 */
export function computeGenbaDiagnosis(input: GenbaDiagnosisInput): GenbaDiagnosis {
  const { eventCount, chekiCount, averageRating, venueCount } = input

  if (eventCount === 0) {
    return {
      emoji: '🌱',
      title: 'これから型',
      tagline: '最初の現場を記録すると診断が始まります',
      statLine: '現場記録 0件'
    }
  }

  const rankingWithMember = input.ranking.filter(r => r.memberName && r.totalAmount > 0)
  const rankingTotal = rankingWithMember.reduce((sum, r) => sum + r.totalAmount, 0)
  const topRow = rankingWithMember.reduce((top, r) => (!top || r.totalAmount > top.totalAmount ? r : top), null as typeof rankingWithMember[number] | null)
  const topShare = rankingTotal > 0 && topRow ? topRow.totalAmount / rankingTotal : 0
  const distinctMembers = rankingWithMember.length
  const chekiPerEvent = chekiCount / eventCount

  if (chekiPerEvent >= 5) {
    return {
      emoji: '🎯',
      title: 'チェキ特攻隊長型',
      tagline: '現場に行けば必ずチェキ列へ。その勢いは伊達じゃない',
      statLine: `1現場あたり平均${chekiPerEvent.toFixed(1)}枚`
    }
  }

  if (topShare >= 0.6 && topRow) {
    return {
      emoji: '💘',
      title: '一途な推し一筋型',
      tagline: `${topRow.memberName}への愛が支出のほとんどを占めています`,
      statLine: `推し1人に支出の${Math.round(topShare * 100)}%`
    }
  }

  if (distinctMembers >= 5) {
    return {
      emoji: '🧭',
      title: '箱推しの探検家型',
      tagline: 'たくさんの推しに愛をまんべんなく分配するタイプ',
      statLine: `${distinctMembers}人の推しに課金`
    }
  }

  if (venueCount >= 5) {
    return {
      emoji: '🚄',
      title: '遠征王型',
      tagline: 'あちこちの会場に足を運ぶフットワークの軽さが武器',
      statLine: `${venueCount}会場を制覇`
    }
  }

  if (averageRating !== null && averageRating >= 4.5) {
    return {
      emoji: '😊',
      title: 'スマイル貯金型',
      tagline: '行った現場の満足度がとにかく高い、ハズレなしオタク',
      statLine: `満足度平均${averageRating.toFixed(1)}`
    }
  }

  if (eventCount <= 3) {
    return {
      emoji: '🐢',
      title: 'コツコツ貯蓄型',
      tagline: '少数精鋭で、行く現場を大切に選ぶタイプ',
      statLine: `現場${eventCount}件を厳選`
    }
  }

  return {
    emoji: '🎈',
    title: 'オールラウンダー型',
    tagline: 'バランスよく現場を楽しむタイプ',
    statLine: `現場${eventCount}件・チェキ${chekiCount}枚`
  }
}
