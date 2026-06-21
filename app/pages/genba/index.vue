<script setup lang="ts">
import type { GenbaEvent, GenbaSummaryRow } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const router = useRouter()

const events = ref<GenbaEvent[]>([])
const summary = ref<GenbaSummaryRow[]>([])
const errorMessage = ref('')
const deletingId = ref<number | null>(null)

type ViewMode = 'list' | 'calendar' | 'summary'
const viewMode = ref<ViewMode>('list')

const viewModeOptions: { value: ViewMode, label: string, icon: string }[] = [
  { value: 'list', label: 'リスト', icon: 'i-lucide-list' },
  { value: 'calendar', label: 'カレンダー', icon: 'i-lucide-calendar' },
  { value: 'summary', label: '集計', icon: 'i-lucide-bar-chart-3' }
]

const memberFilter = ref('')
const groupFilter = ref('')

// 月表示・全体表示の切り替え用の状態（リスト・カレンダーで共通利用）
const today = new Date()
const calendarYear = ref(today.getFullYear())
const calendarMonth = ref(today.getMonth()) // 0始まり

type ListScope = 'all' | 'month'
const listScope = ref<ListScope>('all')
const summaryScope = ref<ListScope>('all')

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

const isInSelectedMonth = (eventDate: string | null) => {
  if (!eventDate) return false
  const [y, m] = eventDate.split('-').map(Number)
  return y === calendarYear.value && m === calendarMonth.value + 1
}

const memberOptions = computed(() => {
  const names = events.value.flatMap(e => e.memberNames)
  return [...new Set(names)].map(name => ({ label: name, value: name }))
})

const groupOptions = computed(() => {
  const names = events.value.flatMap(e => e.groupNames)
  return [...new Set(names)].map(name => ({ label: name, value: name }))
})

const filteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (memberFilter.value && !e.memberNames.includes(memberFilter.value)) return false
    if (groupFilter.value && !e.groupNames.includes(groupFilter.value)) return false
    if (listScope.value === 'month' && !isInSelectedMonth(e.eventDate)) return false
    return true
  })
})

const filteredTotal = computed(() => {
  return filteredEvents.value.reduce((sum, e) => sum + e.totalAmount, 0)
})

const filteredChekiCount = computed(() => {
  return filteredEvents.value.reduce((sum, e) => sum + e.chekiCount, 0)
})

// カレンダー表示用の算出値（フィルタは月で絞らず、推し・グループの絞り込みのみ反映する）
const calendarFilteredEvents = computed(() => {
  return events.value.filter((e) => {
    if (memberFilter.value && !e.memberNames.includes(memberFilter.value)) return false
    if (groupFilter.value && !e.groupNames.includes(groupFilter.value)) return false
    return true
  })
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

const fetchEvents = async () => {
  errorMessage.value = ''

  try {
    events.value = await $fetch<GenbaEvent[]>('/api/genba/events')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '一覧取得に失敗しました'
  }
}

const fetchSummary = async () => {
  try {
    summary.value = await $fetch<GenbaSummaryRow[]>('/api/genba/summary', {
      query: summaryScope.value === 'month'
        ? { year: calendarYear.value, month: calendarMonth.value + 1 }
        : {}
    })
  } catch (e) {
    console.error('集計取得に失敗しました', e)
  }
}

watch([summaryScope, calendarYear, calendarMonth], () => {
  if (viewMode.value === 'summary' || summaryScope.value === 'month') {
    fetchSummary()
  }
})

const goDetail = (id: number) => router.push(`/genba/${id}`)

const deleteEvent = async (id: number) => {
  const ok = confirm('この現場の記録を削除しますか？')
  if (!ok) return

  errorMessage.value = ''
  deletingId.value = id

  try {
    await $fetch(`/api/genba/events/${id}`, { method: 'delete' })
    await fetchEvents()
    await fetchSummary()
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '削除に失敗しました'
  } finally {
    deletingId.value = null
  }
}

onMounted(async () => {
  await fetchEvents()
  await fetchSummary()
})
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold">
        現場の記録
      </h1>

      <div class="flex gap-1">
        <UButton
          v-for="option in viewModeOptions"
          :key="option.value"
          :icon="option.icon"
          :variant="viewMode === option.value ? 'solid' : 'soft'"
          color="neutral"
          size="sm"
          @click="viewMode = option.value"
        >
          {{ option.label }}
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
      class="mb-4"
    />

    <template v-if="viewMode === 'list'">
      <div class="mb-4 flex flex-wrap gap-2">
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
      </div>

      <div class="mb-4 flex items-center justify-between">
        <div class="flex gap-1">
          <UButton
            :variant="listScope === 'all' ? 'solid' : 'soft'"
            color="neutral"
            size="sm"
            @click="listScope = 'all'"
          >
            全体
          </UButton>
          <UButton
            :variant="listScope === 'month' ? 'solid' : 'soft'"
            color="neutral"
            size="sm"
            @click="listScope = 'month'"
          >
            月別
          </UButton>
        </div>

        <div
          v-if="listScope === 'month'"
          class="flex items-center gap-1"
        >
          <UButton
            icon="i-lucide-chevron-left"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goPrevMonth"
          />
          <span class="text-sm font-semibold">{{ monthLabel }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goNextMonth"
          />
        </div>
      </div>

      <UCard
        class="mb-4"
        :ui="{ body: 'p-4 flex flex-col gap-1' }"
      >
        <div class="flex items-center justify-between text-sm text-muted">
          <span>チェキ枚数</span>
          <span>{{ filteredChekiCount }}枚</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-semibold">{{ listScope === 'month' ? `${monthLabel}の合計` : '全体の合計' }}</span>
          <span class="text-lg font-bold text-primary">¥{{ filteredTotal.toLocaleString() }}</span>
        </div>
      </UCard>

      <div
        v-if="filteredEvents.length === 0"
        class="py-10 text-center text-muted"
      >
        記録がありません
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <UCard
          v-for="e in filteredEvents"
          :key="e.id"
          class="cursor-pointer transition hover:shadow-md"
          :ui="{ body: 'p-4' }"
          @click="goDetail(e.id)"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex flex-col gap-1">
              <span class="font-semibold">{{ e.eventName }}</span>
              <span class="text-xs text-muted">
                {{ e.eventDate || '日付未設定' }}
                <template v-if="e.venueName"> ・ {{ e.venueName }}</template>
                <template v-if="e.chekiCount > 0"> ・ チェキ{{ e.chekiCount }}枚</template>
              </span>
              <div
                v-if="e.memberNames.length > 0 || e.groupNames.length > 0"
                class="mt-1 flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="name in e.memberNames"
                  :key="`member-${name}`"
                  color="primary"
                  variant="subtle"
                  size="sm"
                >
                  {{ name }}
                </UBadge>
                <UBadge
                  v-for="name in e.groupNames"
                  :key="`group-${name}`"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ name }}
                </UBadge>
              </div>
            </div>

            <div class="flex flex-col items-end gap-2">
              <span class="font-bold text-primary">¥{{ e.totalAmount.toLocaleString() }}</span>
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                :loading="deletingId === e.id"
                @click.stop="deleteEvent(e.id)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </template>

    <template v-else-if="viewMode === 'calendar'">
      <UCard :ui="{ body: 'p-3 sm:p-4' }">
        <div class="mb-3 flex items-center justify-between">
          <UButton
            icon="i-lucide-chevron-left"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goPrevMonth"
          />
          <span class="font-semibold">{{ monthLabel }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goNextMonth"
          />
        </div>

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
              v-if="cell.dayEvents.length > 0"
              class="calendarCellDot"
            />
          </button>
        </div>
      </UCard>

      <div
        v-if="selectedDate"
        class="mt-4 flex flex-col gap-3"
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
          :ui="{ body: 'p-4' }"
          @click="goDetail(e.id)"
        >
          <div class="flex items-center justify-between gap-2">
            <div class="flex flex-col gap-1">
              <span class="font-semibold">{{ e.eventName }}</span>
              <span class="text-xs text-muted">
                <template v-if="e.venueName">{{ e.venueName }}</template>
                <template v-if="e.chekiCount > 0"> ・ チェキ{{ e.chekiCount }}枚</template>
              </span>
            </div>
            <span class="font-bold text-primary">¥{{ e.totalAmount.toLocaleString() }}</span>
          </div>
        </UCard>
      </div>
    </template>

    <template v-else>
      <div class="mb-4 flex items-center justify-between">
        <div class="flex gap-1">
          <UButton
            :variant="summaryScope === 'all' ? 'solid' : 'soft'"
            color="neutral"
            size="sm"
            @click="summaryScope = 'all'"
          >
            累計
          </UButton>
          <UButton
            :variant="summaryScope === 'month' ? 'solid' : 'soft'"
            color="neutral"
            size="sm"
            @click="summaryScope = 'month'"
          >
            月別
          </UButton>
        </div>

        <div
          v-if="summaryScope === 'month'"
          class="flex items-center gap-1"
        >
          <UButton
            icon="i-lucide-chevron-left"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goPrevMonth"
          />
          <span class="text-sm font-semibold">{{ monthLabel }}</span>
          <UButton
            icon="i-lucide-chevron-right"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="goNextMonth"
          />
        </div>
      </div>

      <div
        v-if="summary.length === 0"
        class="py-10 text-center text-muted"
      >
        集計するデータがありません
      </div>

      <div
        v-else
        class="flex flex-col gap-3"
      >
        <UCard
          v-for="row in summary"
          :key="row.key"
          :ui="{ body: 'p-4 flex items-center justify-between' }"
        >
          <div class="flex flex-col gap-1">
            <span class="font-semibold">{{ row.memberName || '未設定' }}</span>
            <span class="text-xs text-muted">
              {{ row.groupName || '未設定' }} ・ {{ row.eventCount }}現場
              <template v-if="row.chekiCount > 0"> ・ チェキ{{ row.chekiCount }}枚</template>
            </span>
          </div>
          <span class="font-bold text-primary">¥{{ row.totalAmount.toLocaleString() }}</span>
        </UCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.calendarCell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
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

.calendarCellDot {
  position: absolute;
  bottom: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ui-primary);
}

.calendarCellSelected .calendarCellDot {
  background: white;
}
</style>
