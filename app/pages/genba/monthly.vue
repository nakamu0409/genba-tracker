<script setup lang="ts">
import { toPng } from 'html-to-image'
import type { GenbaEvent, GenbaSummaryRow } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const today = new Date()
const year = ref(today.getFullYear())
const month = ref(today.getMonth() + 1) // 1始まり

const events = ref<GenbaEvent[]>([])
const ranking = ref<GenbaSummaryRow[]>([])
const errorMessage = ref('')
const sharing = ref(false)
const shareCardRef = ref<HTMLElement | null>(null)

const monthLabel = computed(() => `${year.value}年${month.value}月`)

const goPrevMonth = () => {
  if (month.value === 1) {
    year.value -= 1
    month.value = 12
  } else {
    month.value -= 1
  }
}

const goNextMonth = () => {
  if (month.value === 12) {
    year.value += 1
    month.value = 1
  } else {
    month.value += 1
  }
}

const fetchRanking = async () => {
  try {
    ranking.value = await $fetch<GenbaSummaryRow[]>('/api/genba/summary', {
      query: { year: year.value, month: month.value }
    })
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '集計の取得に失敗しました'
  }
}

watch([year, month], fetchRanking)

onMounted(async () => {
  try {
    events.value = await $fetch<GenbaEvent[]>('/api/genba/events')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '取得に失敗しました'
  }
  await fetchRanking()
})

// 実績のみ（予定は除外）で月の数字をまとめる
const monthEvents = computed(() => {
  const prefix = `${year.value}-${String(month.value).padStart(2, '0')}-`
  return events.value.filter(e => e.eventDate?.startsWith(prefix) && !isPlannedGenbaDate(e.eventDate))
})

const totalAmount = computed(() => monthEvents.value.reduce((sum, e) => sum + e.totalAmount, 0))
const chekiCount = computed(() => monthEvents.value.reduce((sum, e) => sum + e.chekiCount, 0))

const averageRating = computed(() => {
  const ratings = monthEvents.value.filter(e => e.rating !== null).map(e => e.rating as number)
  if (ratings.length === 0) return null
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length
})

const topEventByAmount = computed(() => {
  if (monthEvents.value.length === 0) return null
  return monthEvents.value.reduce((top, e) => (e.totalAmount > top.totalAmount ? e : top))
})

const topRanking = computed(() => ranking.value.slice(0, 3))

const shareImage = async () => {
  if (!shareCardRef.value) return
  sharing.value = true

  try {
    const dataUrl = await toPng(shareCardRef.value, { backgroundColor: '#ffffff', pixelRatio: 2 })

    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const file = new File([blob], `genba-${year.value}-${month.value}.png`, { type: 'image/png' })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${monthLabel.value}の現場まとめ` })
    } else {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `genba-${year.value}-${month.value}.png`
      link.click()
    }
  } finally {
    sharing.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold">
        月間まとめ
      </h1>
      <UButton
        icon="i-lucide-share-2"
        :loading="sharing"
        :disabled="monthEvents.length === 0"
        @click="shareImage"
      >
        シェア画像を作成
      </UButton>
    </div>

    <div class="mb-4 flex items-center justify-center gap-2">
      <UButton
        icon="i-lucide-chevron-left"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="goPrevMonth"
      />
      <span class="text-lg font-semibold">{{ monthLabel }}</span>
      <UButton
        icon="i-lucide-chevron-right"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="goNextMonth"
      />
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
      class="mb-4"
    />

    <div
      v-if="monthEvents.length === 0"
      class="py-10 text-center text-muted"
    >
      {{ monthLabel }}の記録はありません
    </div>

    <div
      v-else
      ref="shareCardRef"
      class="flex flex-col gap-4 bg-default p-1"
    >
      <UCard :ui="{ body: 'p-5' }">
        <p class="mb-3 text-center text-sm text-muted">
          {{ monthLabel }}の現場まとめ
        </p>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-2xl font-bold text-primary">
              ¥{{ totalAmount.toLocaleString() }}
            </p>
            <p class="text-xs text-muted">
              総支出
            </p>
          </div>
          <div>
            <p class="text-2xl font-bold text-primary">
              {{ monthEvents.length }}
            </p>
            <p class="text-xs text-muted">
              現場回数
            </p>
          </div>
          <div>
            <p class="text-2xl font-bold text-primary">
              {{ chekiCount }}
            </p>
            <p class="text-xs text-muted">
              チェキ枚数
            </p>
          </div>
        </div>
      </UCard>

      <UCard
        v-if="averageRating !== null"
        :ui="{ body: 'p-4 flex items-center justify-between' }"
      >
        <p class="text-sm text-muted">
          満足度の平均
        </p>
        <div class="flex items-center gap-1">
          <UIcon
            v-for="star in 5"
            :key="star"
            name="i-lucide-star"
            :class="star <= Math.round(averageRating) ? 'text-warning' : 'text-muted'"
          />
          <span class="ml-1 text-sm font-semibold">{{ averageRating.toFixed(1) }}</span>
        </div>
      </UCard>

      <UCard
        v-if="topRanking.length > 0"
        :ui="{ body: 'p-4' }"
      >
        <p class="mb-3 font-semibold">
          今月の推しランキング
        </p>
        <div class="flex flex-col gap-2">
          <div
            v-for="(row, i) in topRanking"
            :key="row.key"
            class="flex items-center justify-between text-sm"
          >
            <span>{{ ['🥇', '🥈', '🥉'][i] }} {{ row.memberName || '未設定' }}<span class="text-xs text-muted"> ・ {{ row.groupName || '未設定' }}</span></span>
            <span class="font-bold text-primary">¥{{ row.totalAmount.toLocaleString() }}</span>
          </div>
        </div>
      </UCard>

      <UCard
        v-if="topEventByAmount"
        :ui="{ body: 'p-4 flex items-center justify-between' }"
      >
        <div>
          <p class="text-xs text-muted">
            一番アツかった現場
          </p>
          <p class="font-semibold">
            {{ topEventByAmount.eventName }}
          </p>
        </div>
        <span class="font-bold text-primary">¥{{ topEventByAmount.totalAmount.toLocaleString() }}</span>
      </UCard>

      <p class="flex items-center justify-center gap-1 pb-1 text-xs text-muted">
        <UIcon name="i-lucide-receipt" />
        現場記録 — genbalog.com
      </p>
    </div>
  </div>
</template>
