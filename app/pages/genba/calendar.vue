<script setup lang="ts">
import type { GenbaEvent } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const router = useRouter()

const events = ref<GenbaEvent[]>([])
const errorMessage = ref('')

const memberFilter = ref('')
const groupFilter = ref('')

const today = new Date()
const calendarYear = ref(today.getFullYear())
const calendarMonth = ref(today.getMonth()) // 0始まり

const pad2 = (n: number) => String(n).padStart(2, '0')
const toDateStr = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const monthLabel = computed(() => `${calendarYear.value}年${calendarMonth.value + 1}月`)

const goPrevMonth = () => {
  if (calendarMonth.value === 0) {
    calendarYear.value -= 1
    calendarMonth.value = 11
  } else {
    calendarMonth.value -= 1
  }
}

const goNextMonth = () => {
  if (calendarMonth.value === 11) {
    calendarYear.value += 1
    calendarMonth.value = 0
  } else {
    calendarMonth.value += 1
  }
}

const memberOptions = computed(() => {
  const names = events.value.flatMap(e => e.memberNames)
  return [...new Set(names)].map(name => ({ label: name, value: name }))
})

const groupOptions = computed(() => {
  const names = events.value.flatMap(e => e.groupNames)
  return [...new Set(names)].map(name => ({ label: name, value: name }))
})

const calendarFilteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (memberFilter.value && !e.memberNames.includes(memberFilter.value)) return false
    if (groupFilter.value && !e.groupNames.includes(groupFilter.value)) return false
    return true
  })
})

const monthlyBudget = ref<number | null>(null)

const fetchBudget = async () => {
  const res = await $fetch<{ monthlyAmount: number | null }>('/api/genba/budget', {
    query: { year: calendarYear.value, month: calendarMonth.value + 1 }
  })
  monthlyBudget.value = res.monthlyAmount
}

watch([calendarYear, calendarMonth], fetchBudget)

// 予算との比較なので、推し・グループの絞り込みは無視して月全体の支出で計算する
const monthTotal = computed(() => {
  const prefix = `${calendarYear.value}-${pad2(calendarMonth.value + 1)}-`
  return events.value
    .filter(e => e.eventDate?.startsWith(prefix))
    .reduce((sum, e) => sum + e.totalAmount, 0)
})

const monthPlannedTotal = computed(() => {
  const prefix = `${calendarYear.value}-${pad2(calendarMonth.value + 1)}-`
  return events.value
    .filter(e => e.eventDate?.startsWith(prefix) && isPlannedGenbaDate(e.eventDate))
    .reduce((sum, e) => sum + plannedRemainingAmount(e), 0)
})

const budgetOverAmount = computed(() => {
  if (monthlyBudget.value === null) return 0
  return monthTotal.value - monthlyBudget.value
})

// 予算バーの表示割合（0〜100%、予算超過時は満タンにする）
const budgetUsageRatio = computed(() => {
  if (!monthlyBudget.value) return monthTotal.value > 0 ? 100 : 0
  return Math.min(100, (monthTotal.value / monthlyBudget.value) * 100)
})

const monthAverageRating = computed(() => {
  const prefix = `${calendarYear.value}-${pad2(calendarMonth.value + 1)}-`
  const ratings = calendarFilteredEvents.value
    .filter(e => e.eventDate?.startsWith(prefix) && e.rating !== null)
    .map(e => e.rating as number)

  if (ratings.length === 0) return null
  return ratings.reduce((sum, r) => sum + r, 0) / ratings.length
})

const selectedDate = ref<string | null>(null)

const eventsByDate = computed(() => {
  const map = new Map<string, GenbaEvent[]>()

  for (const e of calendarFilteredEvents.value) {
    if (!e.eventDate) continue
    const list = map.get(e.eventDate) ?? []
    list.push(e)
    map.set(e.eventDate, list)
  }

  return map
})

const calendarWeeks = computed(() => {
  const year = calendarYear.value
  const month = calendarMonth.value

  const firstDay = new Date(year, month, 1)
  const startOffset = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7

  const cells = []

  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, i - startOffset + 1)
    const dateStr = toDateStr(date)

    cells.push({
      date,
      dateStr,
      inCurrentMonth: date.getMonth() === month,
      isToday: dateStr === toDateStr(today),
      dayEvents: eventsByDate.value.get(dateStr) ?? []
    })
  }

  const weeks = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  return weeks
})

const selectedDateEvents = computed(() => {
  if (!selectedDate.value) return []
  return eventsByDate.value.get(selectedDate.value) ?? []
})

const selectedDateChekiCount = computed(() => {
  return selectedDateEvents.value.reduce((sum, e) => sum + e.chekiCount, 0)
})

const selectDate = (dateStr: string) => {
  selectedDate.value = selectedDate.value === dateStr ? null : dateStr
}

const goNewWithDate = (dateStr: string) => router.push(`/genba/new?date=${dateStr}`)
const goDetail = (id: number) => router.push(`/genba/${id}`)

const fetchEvents = async () => {
  errorMessage.value = ''

  try {
    events.value = await $fetch<GenbaEvent[]>('/api/genba/events')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '一覧取得に失敗しました'
  }
}

onMounted(async () => {
  await fetchEvents()
  await fetchBudget()
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-4">
    <div class="mb-3 flex items-center justify-between">
      <UButton
        icon="i-lucide-chevron-left"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="goPrevMonth"
      />
      <span class="text-lg font-bold">{{ monthLabel }}</span>
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
      class="mb-3"
    />

    <div class="mb-2 flex flex-wrap items-center gap-2">
      <USelectMenu
        v-model="memberFilter"
        :items="memberOptions"
        value-key="value"
        placeholder="推しで絞り込み"
        class="w-40"
        clear
      />
      <USelectMenu
        v-model="groupFilter"
        :items="groupOptions"
        value-key="value"
        placeholder="グループで絞り込み"
        class="w-40"
        clear
      />
      <div
        v-if="monthAverageRating !== null"
        class="ml-auto flex items-center gap-0.5"
      >
        <UIcon
          v-for="star in 5"
          :key="star"
          name="i-lucide-star"
          class="text-sm"
          :class="star <= Math.round(monthAverageRating) ? 'text-warning' : 'text-muted'"
        />
        <span class="ml-1 text-xs font-semibold text-muted">{{ monthAverageRating.toFixed(1) }}</span>
      </div>
    </div>

    <UCard
      v-if="monthlyBudget !== null"
      class="mb-2"
      :ui="{ body: 'px-4 py-3 flex flex-col gap-1.5' }"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold">{{ budgetOverAmount > 0 ? '予算超過' : '残り' }}</span>
        <span
          class="text-lg font-bold"
          :class="budgetOverAmount > 0 ? 'text-error' : 'text-primary'"
        >¥{{ Math.abs(monthlyBudget - monthTotal).toLocaleString() }}</span>
      </div>

      <div class="h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div
          class="h-full rounded-full transition-all"
          :class="budgetOverAmount > 0 ? 'bg-error' : 'bg-primary'"
          :style="{ width: `${budgetUsageRatio}%` }"
        />
      </div>

      <div class="flex items-center justify-between text-xs text-muted">
        <span>予算 ¥{{ monthlyBudget.toLocaleString() }}</span>
        <span>使用 ¥{{ monthTotal.toLocaleString() }}</span>
        <span v-if="monthPlannedTotal > 0">予定分 ¥{{ monthPlannedTotal.toLocaleString() }}</span>
      </div>
    </UCard>

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <div class="grid grid-cols-7 gap-1 text-center text-xs text-muted">
        <span
          v-for="w in ['日', '月', '火', '水', '木', '金', '土']"
          :key="w"
        >{{ w }}</span>
      </div>

      <div
        v-for="(week, wi) in calendarWeeks"
        :key="wi"
        class="grid grid-cols-7 gap-1"
      >
        <button
          v-for="cell in week"
          :key="cell.dateStr"
          type="button"
          class="calendarCell"
          :class="{
            calendarCellOutside: !cell.inCurrentMonth,
            calendarCellToday: cell.isToday,
            calendarCellSelected: selectedDate === cell.dateStr,
            calendarCellHasEvents: cell.dayEvents.length > 0
          }"
          @click="selectDate(cell.dateStr)"
        >
          <span class="calendarCellDay">{{ cell.date.getDate() }}</span>
          <span
            v-if="cell.dayEvents[0]"
            class="calendarCellLabel"
            :class="{ calendarCellLabelPlanned: isPlannedGenbaDate(cell.dateStr) }"
          >
            {{ cell.dayEvents[0].eventName }}<template v-if="cell.dayEvents.length > 1"> +{{ cell.dayEvents.length - 1 }}</template>
          </span>
        </button>
      </div>
    </UCard>

    <div
      v-if="selectedDate"
      class="mt-3 flex flex-col gap-2"
    >
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-muted">
          {{ selectedDate }}
          <template v-if="selectedDateChekiCount > 0"> ・ チェキ{{ selectedDateChekiCount }}枚</template>
        </span>
        <UButton
          icon="i-lucide-plus"
          variant="soft"
          size="xs"
          @click="goNewWithDate(selectedDate)"
        >
          この日に登録
        </UButton>
      </div>

      <p
        v-if="selectedDateEvents.length === 0"
        class="text-sm text-muted"
      >
        この日の記録はありません
      </p>

      <UCard
        v-for="e in selectedDateEvents"
        :key="e.id"
        class="cursor-pointer transition hover:shadow-md"
        :ui="{ body: 'p-3' }"
        @click="goDetail(e.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex flex-col gap-1">
            <span class="flex items-center gap-2 font-semibold">
              {{ e.eventName }}
              <UBadge
                v-if="isPlannedGenbaDate(e.eventDate)"
                color="info"
                variant="subtle"
                size="sm"
              >
                予定
              </UBadge>
              <UBadge
                v-if="!e.ticketPaid && e.ticketPrice > 0"
                color="warning"
                variant="subtle"
                size="sm"
              >
                チケット未払い
              </UBadge>
            </span>
            <span class="text-xs text-muted">
              <template v-if="e.venueName">{{ e.venueName }}</template>
              <template v-if="e.chekiCount > 0"> ・ チェキ{{ e.chekiCount }}枚</template>
              <template v-if="e.rating !== null"> ・ {{ '★'.repeat(e.rating) }}{{ '☆'.repeat(5 - e.rating) }}</template>
            </span>
          </div>
          <span class="font-bold text-primary">¥{{ e.totalAmount.toLocaleString() }}</span>
        </div>
      </UCard>
    </div>
  </div>
</template>

<style scoped>
.calendarCell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 50px;
  padding-top: 4px;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
}

.calendarCell:hover {
  background: var(--ui-bg-elevated);
}

.calendarCellOutside {
  color: var(--ui-text-dimmed);
}

.calendarCellToday {
  font-weight: 700;
  color: var(--ui-primary);
}

.calendarCellSelected {
  background: var(--ui-primary);
  color: white;
}

.calendarCellLabel {
  margin-top: 2px;
  width: 100%;
  max-width: 100%;
  padding: 0 2px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 9px;
  line-height: 1.2;
  color: var(--ui-primary);
  text-align: center;
}

.calendarCellLabelPlanned {
  color: var(--ui-info);
}

.calendarCellSelected .calendarCellLabel {
  color: white;
}
</style>
