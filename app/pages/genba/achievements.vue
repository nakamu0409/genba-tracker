<script setup lang="ts">
import type { GenbaEvent, GenbaSummaryRow } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const STORAGE_KEY = 'genba_achievements_unlocked_ids'

const loading = ref(true)
const errorMessage = ref('')
const achievements = ref<GenbaAchievement[]>([])
const newlyUnlocked = ref<GenbaAchievement[]>([])

const categoryLabels: Record<GenbaAchievementCategory, string> = {
  events: '現場回数',
  cheki: 'チェキ枚数',
  spending: '課金額',
  love: '推し愛',
  variety: 'バラエティ'
}

const categoryOrder: GenbaAchievementCategory[] = ['events', 'cheki', 'spending', 'love', 'variety']

const grouped = computed(() => {
  return categoryOrder.map(category => ({
    category,
    label: categoryLabels[category],
    items: achievements.value.filter(a => a.category === category)
  }))
})

const unlockedCount = computed(() => achievements.value.filter(a => a.unlocked).length)

onMounted(async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    const [events, ranking] = await Promise.all([
      $fetch<GenbaEvent[]>('/api/genba/events'),
      $fetch<GenbaSummaryRow[]>('/api/genba/summary')
    ])

    // 実績は「実際に行った現場」だけを対象にする（予定は含めない）
    const pastEvents = events.filter(e => !isPlannedGenbaDate(e.eventDate))

    const rankingWithMember = ranking.filter(r => r.memberName)
    const maxMemberRow = rankingWithMember.reduce(
      (top, r) => (!top || r.totalAmount > top.totalAmount ? r : top),
      null as GenbaSummaryRow | null
    )

    const stats: GenbaAchievementStats = {
      eventCount: pastEvents.length,
      chekiCount: pastEvents.reduce((sum, e) => sum + e.chekiCount, 0),
      totalAmount: pastEvents.reduce((sum, e) => sum + e.totalAmount, 0),
      venueCount: new Set(pastEvents.map(e => e.venueName).filter((v): v is string => !!v)).size,
      groupCount: new Set(pastEvents.flatMap(e => e.groupNames)).size,
      maxMemberAmount: maxMemberRow?.totalAmount ?? 0,
      maxMemberName: maxMemberRow?.memberName ?? null,
      hasFiveStarEvent: pastEvents.some(e => e.rating === 5)
    }

    achievements.value = computeGenbaAchievements(stats)

    const previouslyUnlocked = new Set<string>(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'))
    const currentUnlocked = achievements.value.filter(a => a.unlocked)
    newlyUnlocked.value = currentUnlocked.filter(a => !previouslyUnlocked.has(a.id))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentUnlocked.map(a => a.id)))
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '取得に失敗しました'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center gap-2">
      <UButton
        to="/genba"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
      <h1 class="text-xl font-bold">
        実績
      </h1>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
      class="mb-4"
    />

    <UAlert
      v-if="newlyUnlocked.length > 0"
      color="success"
      variant="soft"
      icon="i-lucide-party-popper"
      :title="`新しい実績を解除しました: ${newlyUnlocked.map(a => a.title).join('・')}`"
      class="mb-4"
    />

    <div
      v-if="loading"
      class="py-10 text-center text-muted"
    >
      読み込み中...
    </div>

    <template v-else>
      <UCard class="mb-4">
        <div class="flex items-center justify-between">
          <span class="text-sm text-muted">解除した実績</span>
          <span class="text-lg font-bold text-primary">{{ unlockedCount }} / {{ achievements.length }}</span>
        </div>
      </UCard>

      <div class="flex flex-col gap-5">
        <div
          v-for="group in grouped"
          :key="group.category"
        >
          <p class="mb-2 text-sm font-semibold text-muted">
            {{ group.label }}
          </p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <UCard
              v-for="item in group.items"
              :key="item.id"
              :ui="{ body: 'p-3 flex flex-col items-center gap-1 text-center' }"
              :class="item.unlocked ? '' : 'opacity-50'"
            >
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full"
                :class="item.unlocked ? 'bg-primary-500/15' : 'bg-elevated'"
              >
                <UIcon
                  :name="item.icon"
                  class="text-lg"
                  :class="item.unlocked ? 'text-primary' : 'text-muted'"
                />
              </div>
              <p class="text-xs font-semibold">
                {{ item.title }}
              </p>
              <p
                v-if="!item.unlocked"
                class="text-[10px] text-muted"
              >
                {{ item.current.toLocaleString() }} / {{ item.target.toLocaleString() }}
              </p>
              <p
                v-else
                class="text-[10px] text-primary"
              >
                達成済み
              </p>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
