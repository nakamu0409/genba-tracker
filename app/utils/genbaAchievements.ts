export type GenbaAchievementCategory = 'events' | 'cheki' | 'spending' | 'love' | 'variety'

export type GenbaAchievement = {
  id: string
  category: GenbaAchievementCategory
  icon: string
  title: string
  description: string
  unlocked: boolean
  current: number
  target: number
}

export type GenbaAchievementStats = {
  eventCount: number
  chekiCount: number
  totalAmount: number
  venueCount: number
  groupCount: number
  maxMemberAmount: number
  maxMemberName: string | null
  hasFiveStarEvent: boolean
}

function tieredAchievements(
  idPrefix: string,
  category: GenbaAchievementCategory,
  icon: string,
  tiers: number[],
  current: number,
  titleFor: (target: number) => string,
  descriptionFor: (target: number) => string
): GenbaAchievement[] {
  return tiers.map(target => ({
    id: `${idPrefix}-${target}`,
    category,
    icon,
    title: titleFor(target),
    description: descriptionFor(target),
    unlocked: current >= target,
    current: Math.min(current, target),
    target
  }))
}

/**
現場記録の実績（バッジ）一覧を判定する。実績は保存せず、記録データから毎回その場で計算する
 */
export function computeGenbaAchievements(stats: GenbaAchievementStats): GenbaAchievement[] {
  const achievements: GenbaAchievement[] = [
    ...tieredAchievements(
      'events', 'events', 'i-lucide-flag',
      [1, 5, 10, 30, 50, 100],
      stats.eventCount,
      target => target === 1 ? '初めての現場' : `現場${target}回達成`,
      target => `現場に${target}回行くと解除`
    ),
    ...tieredAchievements(
      'cheki', 'cheki', 'i-lucide-camera',
      [10, 50, 100, 300, 500],
      stats.chekiCount,
      target => `チェキ${target}枚`,
      target => `チェキを合計${target}枚撮ると解除`
    ),
    ...tieredAchievements(
      'spending', 'spending', 'i-lucide-coins',
      [10000, 100000, 300000, 500000, 1000000],
      stats.totalAmount,
      target => `累計¥${target.toLocaleString()}`,
      target => `合計支出が¥${target.toLocaleString()}に到達すると解除`
    ),
    {
      id: 'love-100000',
      category: 'love',
      icon: 'i-lucide-heart',
      title: 'ガチ恋認定',
      description: '推し1人に¥100,000使うと解除',
      unlocked: stats.maxMemberAmount >= 100000,
      current: Math.min(stats.maxMemberAmount, 100000),
      target: 100000
    },
    {
      id: 'love-300000',
      category: 'love',
      icon: 'i-lucide-flame',
      title: '沼オタク認定',
      description: '推し1人に¥300,000使うと解除',
      unlocked: stats.maxMemberAmount >= 300000,
      current: Math.min(stats.maxMemberAmount, 300000),
      target: 300000
    },
    {
      id: 'variety-five-star',
      category: 'variety',
      icon: 'i-lucide-sparkles',
      title: '神現場デビュー',
      description: '満足度★5の現場が1件あると解除',
      unlocked: stats.hasFiveStarEvent,
      current: stats.hasFiveStarEvent ? 1 : 0,
      target: 1
    },
    {
      id: 'variety-venues-5',
      category: 'variety',
      icon: 'i-lucide-map-pin',
      title: '会場コンプリート',
      description: '5つの異なる会場に行くと解除',
      unlocked: stats.venueCount >= 5,
      current: Math.min(stats.venueCount, 5),
      target: 5
    },
    {
      id: 'variety-groups-3',
      category: 'variety',
      icon: 'i-lucide-users',
      title: '箱推し認定',
      description: '3つの異なるグループを記録すると解除',
      unlocked: stats.groupCount >= 3,
      current: Math.min(stats.groupCount, 3),
      target: 3
    }
  ]

  return achievements
}
