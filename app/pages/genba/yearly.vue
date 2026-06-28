<script setup lang="ts">
import { toPng } from 'html-to-image'
import type { GenbaMemberTrend, GenbaYearlyOverview } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const today = new Date()
const year = ref(today.getFullYear())

const overview = ref<GenbaYearlyOverview | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const sharing = ref(false)
const shareCardRef = ref<HTMLElement | null>(null)

const fetchOverview = async () => {
  loading.value = true
  errorMessage.value = ''

  try {
    overview.value = await $fetch<GenbaYearlyOverview>('/api/genba/yearly-summary', {
      query: { year: year.value }
    })
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '取得に失敗しました'
  } finally {
    loading.value = false
  }
}

watch(year, fetchOverview)
onMounted(fetchOverview)

const goPrevYear = () => {
  year.value -= 1
}

const goNextYear = () => {
  year.value += 1
}

const maxMonthlyAmount = computed(() => {
  if (!overview.value) return 0
  return Math.max(1, ...overview.value.monthlyTotals.map(m => m.totalAmount))
})

const topRanking = computed(() => overview.value?.ranking.slice(0, 5) ?? [])

const memberOptions = computed(() => {
  const names = (overview.value?.ranking ?? []).map(r => r.memberName).filter((n): n is string => !!n)
  return [...new Set(names)]
})

const selectedMember = ref<string | undefined>(undefined)
const memberTrend = ref<GenbaMemberTrend | null>(null)
const memberTrendLoading = ref(false)

const fetchMemberTrend = async () => {
  if (!selectedMember.value) {
    memberTrend.value = null
    return
  }

  memberTrendLoading.value = true
  try {
    memberTrend.value = await $fetch<GenbaMemberTrend>('/api/genba/member-trend', {
      query: { year: year.value, member: selectedMember.value }
    })
  } finally {
    memberTrendLoading.value = false
  }
}

watch([year, selectedMember], fetchMemberTrend)

const maxMemberMonthlyAmount = computed(() => {
  if (!memberTrend.value) return 0
  return Math.max(1, ...memberTrend.value.monthlyTotals.map(m => m.totalAmount))
})

const shareImage = async () => {
  if (!shareCardRef.value) return
  sharing.value = true

  try {
    const dataUrl = await toPng(shareCardRef.value, { backgroundColor: '#ffffff', pixelRatio: 2 })

    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const file = new File([blob], `genba-${year.value}.png`, { type: 'image/png' })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `${year.value}年の現場まとめ` })
    } else {
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `genba-${year.value}.png`
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
        年間まとめ
      </h1>
      <UButton
        icon="i-lucide-share-2"
        :loading="sharing"
        :disabled="!overview || overview.eventCount === 0"
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
        @click="goPrevYear"
      />
      <span class="text-lg font-semibold">{{ year }}年</span>
      <UButton
        icon="i-lucide-chevron-right"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="goNextYear"
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
      v-if="loading"
      class="py-10 text-center text-muted"
    >
      読み込み中...
    </div>

    <div
      v-else-if="overview && overview.eventCount === 0"
      class="py-10 text-center text-muted"
    >
      {{ year }}年の記録はありません
    </div>

    <div
      v-else-if="overview"
      ref="shareCardRef"
      class="flex flex-col gap-4 bg-default p-1"
    >
      <UCard :ui="{ body: 'p-5' }">
        <p class="mb-3 text-center text-sm text-muted">
          {{ year }}年の現場まとめ
        </p>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div>
            <p class="text-2xl font-bold text-primary">
              ¥{{ overview.totalAmount.toLocaleString() }}
            </p>
            <p class="text-xs text-muted">
              総支出
            </p>
          </div>
          <div>
            <p class="text-2xl font-bold text-primary">
              {{ overview.eventCount }}
            </p>
            <p class="text-xs text-muted">
              現場回数
            </p>
          </div>
          <div>
            <p class="text-2xl font-bold text-primary">
              {{ overview.chekiCount }}
            </p>
            <p class="text-xs text-muted">
              チェキ枚数
            </p>
          </div>
        </div>
      </UCard>

      <UCard :ui="{ body: 'p-4' }">
        <p class="mb-3 font-semibold">
          月別支出
        </p>
        <div
          class="flex items-end gap-1"
          style="height: 96px;"
        >
          <div
            v-for="m in overview.monthlyTotals"
            :key="m.month"
            class="flex flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              class="w-full rounded-t bg-primary"
              :style="{ height: `${Math.max(2, (m.totalAmount / maxMonthlyAmount) * 80)}px` }"
            />
            <span class="text-[10px] text-muted">{{ m.month }}月</span>
          </div>
        </div>
      </UCard>

      <UCard
        v-if="topRanking.length > 0"
        :ui="{ body: 'p-4' }"
      >
        <p class="mb-3 font-semibold">
          推し・グループ別ランキング
        </p>
        <div class="flex flex-col gap-2">
          <div
            v-for="(row, i) in topRanking"
            :key="row.key"
            class="flex items-center justify-between text-sm"
          >
            <span>{{ i + 1 }}. {{ row.memberName || '未設定' }}<span class="text-xs text-muted"> ・ {{ row.groupName || '未設定' }}</span></span>
            <span class="font-bold text-primary">¥{{ row.totalAmount.toLocaleString() }}</span>
          </div>
        </div>
      </UCard>

      <UCard
        v-if="overview.topEventByAmount"
        :ui="{ body: 'p-4 flex items-center justify-between' }"
      >
        <div>
          <p class="text-xs text-muted">
            一番高額だった現場
          </p>
          <p class="font-semibold">
            {{ overview.topEventByAmount.eventName }}
          </p>
        </div>
        <span class="font-bold text-primary">¥{{ overview.topEventByAmount.totalAmount.toLocaleString() }}</span>
      </UCard>

      <UCard
        v-if="overview.topEventByChekiCount"
        :ui="{ body: 'p-4 flex items-center justify-between' }"
      >
        <div>
          <p class="text-xs text-muted">
            一番チェキを買った現場
          </p>
          <p class="font-semibold">
            {{ overview.topEventByChekiCount.eventName }}
          </p>
        </div>
        <span class="font-bold text-primary">{{ overview.topEventByChekiCount.chekiCount }}枚</span>
      </UCard>
    </div>

    <UCard
      v-if="overview && memberOptions.length > 0"
      class="mt-4"
      :ui="{ body: 'p-4' }"
    >
      <p class="mb-3 font-semibold">
        推し別の月次トレンド
      </p>

      <USelectMenu
        v-model="selectedMember"
        :items="memberOptions"
        placeholder="推しを選択"
        class="mb-3 w-full"
        clear
      />

      <div
        v-if="memberTrendLoading"
        class="py-6 text-center text-sm text-muted"
      >
        読み込み中...
      </div>

      <template v-else-if="memberTrend">
        <div class="mb-3 flex items-center justify-between text-sm">
          <span class="text-muted">{{ year }}年の合計</span>
          <span class="font-bold text-primary">¥{{ memberTrend.totalAmount.toLocaleString() }}（チェキ{{ memberTrend.chekiCount }}枚）</span>
        </div>
        <div
          class="flex items-end gap-1"
          style="height: 96px;"
        >
          <div
            v-for="m in memberTrend.monthlyTotals"
            :key="m.month"
            class="flex flex-1 flex-col items-center justify-end gap-1"
          >
            <div
              class="w-full rounded-t bg-primary"
              :style="{ height: `${Math.max(2, (m.totalAmount / maxMemberMonthlyAmount) * 80)}px` }"
            />
            <span class="text-[10px] text-muted">{{ m.month }}月</span>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>
