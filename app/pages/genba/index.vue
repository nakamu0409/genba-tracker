<script setup lang="ts">
import type { GenbaEvent, GenbaEventMemberBreakdown, GenbaSummaryRow } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const router = useRouter()

const events = ref<GenbaEvent[]>([])
const summary = ref<GenbaSummaryRow[]>([])
const memberBreakdown = ref<GenbaEventMemberBreakdown[]>([])
const errorMessage = ref('')
const deletingId = ref<number | null>(null)

type ViewMode = 'list' | 'summary'
const viewMode = ref<ViewMode>('list')

const viewModeOptions: { value: ViewMode, label: string, icon: string }[] = [
  { value: 'list', label: 'リスト', icon: 'i-lucide-list' },
  { value: 'summary', label: '集計', icon: 'i-lucide-bar-chart-3' }
]

const memberFilter = ref('')
const groupFilter = ref('')

// 月表示・全体表示の切り替え用の状態
const today = new Date()
const calendarYear = ref(today.getFullYear())
const calendarMonth = ref(today.getMonth()) // 0始まり

type ListScope = 'all' | 'month'
const listScope = ref<ListScope>('all')
const summaryScope = ref<ListScope>('all')

const monthlyBudget = ref<number | null>(null)
const isDefaultBudget = ref(false)
const editingBudget = ref(false)
const budgetInput = ref<number | ''>('')
const budgetAsDefault = ref(false)

const fetchBudget = async () => {
  const res = await $fetch<{ monthlyAmount: number | null, isDefault: boolean }>('/api/genba/budget', {
    query: { year: calendarYear.value, month: calendarMonth.value + 1 }
  })
  monthlyBudget.value = res.monthlyAmount
  isDefaultBudget.value = res.isDefault
}

const startEditBudget = () => {
  budgetInput.value = monthlyBudget.value ?? ''
  budgetAsDefault.value = isDefaultBudget.value
  editingBudget.value = true
}

const saveBudget = async () => {
  const monthlyAmount = budgetInput.value === '' ? null : Number(budgetInput.value)
  await $fetch('/api/genba/budget', {
    method: 'put',
    body: { year: calendarYear.value, month: calendarMonth.value + 1, monthlyAmount, asDefault: budgetAsDefault.value }
  })
  monthlyBudget.value = monthlyAmount
  isDefaultBudget.value = monthlyAmount !== null && budgetAsDefault.value
  editingBudget.value = false
}

watch([listScope, calendarYear, calendarMonth], () => {
  if (listScope.value === 'month') {
    editingBudget.value = false
    fetchBudget()
  }
})

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

// 現場ごとの推し別内訳（推し・グループで絞り込んだときに「その推しだけの金額」を出すために使う）
const breakdownByEvent = computed(() => {
  const map = new Map<number, GenbaEventMemberBreakdown[]>()
  for (const row of memberBreakdown.value) {
    const list = map.get(row.eventId) ?? []
    list.push(row)
    map.set(row.eventId, list)
  }
  return map
})

const isFilteringByPerson = computed(() => !!memberFilter.value || !!groupFilter.value)

// 絞り込み中は、その現場の中でも指定した推し・グループの明細金額だけを合計する（チケット代等の共通費用は含まない）
const filteredMemberRows = (e: GenbaEvent) => {
  const rows = breakdownByEvent.value.get(e.id) ?? []
  return rows.filter(r =>
    (!memberFilter.value || r.memberName === memberFilter.value)
    && (!groupFilter.value || r.groupName === groupFilter.value)
  )
}

const eventDisplayAmount = (e: GenbaEvent) => {
  if (!isFilteringByPerson.value) return e.totalAmount
  return filteredMemberRows(e).reduce((sum, r) => sum + r.amount, 0)
}

const eventDisplayChekiCount = (e: GenbaEvent) => {
  if (!isFilteringByPerson.value) return e.chekiCount
  return filteredMemberRows(e).reduce((sum, r) => sum + r.chekiCount, 0)
}

const filteredTotal = computed(() => {
  return filteredEvents.value.reduce((sum, e) => sum + eventDisplayAmount(e), 0)
})

const filteredPlannedTotal = computed(() => {
  const plannedEvents = filteredEvents.value.filter(e => isPlannedGenbaDate(e.eventDate))

  if (isFilteringByPerson.value) {
    // 絞り込み中はチケット代等の共通費用を含めない金額と揃える（明細のみの合計にする）
    return plannedEvents.reduce((sum, e) => sum + eventDisplayAmount(e), 0)
  }

  return plannedEvents.reduce((sum, e) => sum + plannedRemainingAmount(e), 0)
})

const filteredChekiCount = computed(() => {
  return filteredEvents.value.reduce((sum, e) => sum + eventDisplayChekiCount(e), 0)
})

const totalLabel = computed(() => {
  const base = listScope.value === 'month' ? `${monthLabel.value}の合計` : '全体の合計'
  const personLabel = memberFilter.value || groupFilter.value
  return personLabel ? `${base}（${personLabel}）` : base
})

const togglingTicketId = ref<number | null>(null)

const markTicketPaid = async (id: number) => {
  togglingTicketId.value = id

  try {
    await $fetch(`/api/genba/events/${id}/ticket-paid`, {
      method: 'put',
      body: { ticketPaid: true }
    })
    const target = events.value.find(e => e.id === id)
    if (target) target.ticketPaid = true
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '更新に失敗しました'
  } finally {
    togglingTicketId.value = null
  }
}

const budgetOverAmount = computed(() => {
  if (monthlyBudget.value === null) return 0
  return filteredTotal.value - monthlyBudget.value
})

const fetchEvents = async () => {
  errorMessage.value = ''

  try {
    events.value = await $fetch<GenbaEvent[]>('/api/genba/events')
    memberBreakdown.value = await $fetch<GenbaEventMemberBreakdown[]>('/api/genba/events/member-breakdown')
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

const exportCsv = () => {
  const header = ['日付', 'イベント名', '会場', '推し', 'グループ', 'チケット代', 'ドリンク代', '交通費', '宿泊費', 'チェキ代', 'チェキ枚数', 'グッズ代', '合計', '満足度', '予定', 'メモ']

  const quote = (value: string | number | null) => `"${String(value ?? '').replace(/"/g, '""')}"`

  const rows = events.value.map(e => [
    e.eventDate ?? '',
    e.eventName,
    e.venueName ?? '',
    e.memberNames.join('、'),
    e.groupNames.join('、'),
    e.ticketPrice,
    e.drinkFee,
    e.transportFee,
    e.lodgingFee,
    e.chekiTotal,
    e.chekiCount,
    e.goodsTotal,
    e.totalAmount,
    e.rating ?? '',
    isPlannedGenbaDate(e.eventDate) ? '予定' : '',
    e.memo ?? ''
  ])

  const csv = [header, ...rows].map(row => row.map(quote).join(',')).join('\r\n')

  // ExcelでもUTF-8として開けるようにBOMを付ける
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = `genba-records-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()

  URL.revokeObjectURL(url)
}

const menuItems = computed(() => [
  { label: '月間まとめ', icon: 'i-lucide-calendar-heart', to: '/genba/monthly' },
  { label: '年間まとめ', icon: 'i-lucide-sparkles', to: '/genba/yearly' },
  { label: '実績', icon: 'i-lucide-trophy', to: '/genba/achievements' },
  { label: 'CSVエクスポート', icon: 'i-lucide-download', disabled: events.value.length === 0, onSelect: () => exportCsv() }
])

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
        <UDropdownMenu :items="menuItems">
          <UButton
            icon="i-lucide-ellipsis-vertical"
            variant="soft"
            color="neutral"
            size="sm"
          />
        </UDropdownMenu>
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

      <UAlert
        v-if="listScope === 'month' && budgetOverAmount > 0"
        color="error"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :title="`今月の予算を¥${budgetOverAmount.toLocaleString()}超えています`"
        class="mb-4"
      />

      <UCard
        class="mb-4"
        :ui="{ body: 'p-4 flex flex-col gap-1' }"
      >
        <div class="flex items-center justify-between text-sm text-muted">
          <span>チェキ枚数</span>
          <span>{{ filteredChekiCount }}枚</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-semibold">{{ totalLabel }}</span>
          <span class="text-lg font-bold text-primary">¥{{ filteredTotal.toLocaleString() }}</span>
        </div>
        <div
          v-if="filteredPlannedTotal > 0"
          class="flex items-center justify-between text-sm text-muted"
        >
          <span>これから使う予定分</span>
          <span>¥{{ filteredPlannedTotal.toLocaleString() }}</span>
        </div>

        <template v-if="listScope === 'month'">
          <div
            v-if="editingBudget"
            class="mt-2 flex flex-col gap-2"
          >
            <div class="flex items-center gap-2">
              <UInput
                v-model.number="budgetInput"
                type="number"
                min="0"
                step="100"
                placeholder="月予算"
                size="sm"
                class="flex-1"
              />
              <UButton
                size="sm"
                @click="saveBudget"
              >
                保存
              </UButton>
            </div>
            <UCheckbox
              v-model="budgetAsDefault"
              label="毎月の予算として使う"
              size="sm"
            />
          </div>
          <template v-else>
            <div
              v-if="monthlyBudget !== null"
              class="flex items-center justify-between text-sm text-muted"
            >
              <span>月予算{{ isDefaultBudget ? '（毎月）' : '' }} ¥{{ monthlyBudget.toLocaleString() }}（残り）</span>
              <span :class="(monthlyBudget - filteredTotal) < 0 ? 'text-error font-semibold' : 'text-primary font-semibold'">
                ¥{{ (monthlyBudget - filteredTotal).toLocaleString() }}
              </span>
            </div>
            <UButton
              variant="link"
              size="xs"
              class="mt-1 self-start px-0"
              @click="startEditBudget"
            >
              {{ monthlyBudget === null ? '月予算を設定' : '月予算を編集' }}
            </UButton>
          </template>
        </template>
      </UCard>

      <div
        v-if="filteredEvents.length === 0"
        class="flex flex-col items-center gap-3 py-10 text-center"
      >
        <span class="text-muted">{{ events.length === 0 ? 'まだ記録がありません' : '条件に合う記録がありません' }}</span>
        <UButton
          v-if="events.length === 0"
          icon="i-lucide-plus"
          to="/genba/new"
        >
          最初の現場を登録する
        </UButton>
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
                {{ e.eventDate || '日付未設定' }}
                <template v-if="e.venueName"> ・ {{ e.venueName }}</template>
                <template v-if="eventDisplayChekiCount(e) > 0"> ・ チェキ{{ eventDisplayChekiCount(e) }}枚</template>
                <template v-if="e.rating !== null"> ・ {{ '★'.repeat(e.rating) }}{{ '☆'.repeat(5 - e.rating) }}</template>
              </span>
              <UButton
                v-if="!e.ticketPaid && e.ticketPrice > 0"
                icon="i-lucide-check"
                color="warning"
                variant="soft"
                size="xs"
                class="mt-1 self-start"
                :loading="togglingTicketId === e.id"
                @click.stop="markTicketPaid(e.id)"
              >
                支払い済みにする
              </UButton>
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
              <div class="flex flex-col items-end">
                <span class="font-bold text-primary">¥{{ eventDisplayAmount(e).toLocaleString() }}</span>
                <span
                  v-if="isFilteringByPerson && eventDisplayAmount(e) !== e.totalAmount"
                  class="text-xs text-muted"
                >現場全体 ¥{{ e.totalAmount.toLocaleString() }}</span>
              </div>
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
