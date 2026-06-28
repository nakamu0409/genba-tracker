<script setup lang="ts">
import type { GenbaEvent, GenbaEventInput, GenbaItemInput } from '../../../shared/types/genba'
import GenbaItemEditor, { type GenbaItemFormState } from './GenbaItemEditor.vue'
import { useGenbaMasters } from '../../composables/useGenbaMasters'

type InitialItemInput = GenbaItemInput & { groupName?: string | null }

const props = defineProps<{
  initialValue: Omit<GenbaEventInput, 'chekiItems' | 'goodsItems'> & {
    chekiItems: InitialItemInput[]
    goodsItems: InitialItemInput[]
  }
  submitLabel: string
  loading: boolean
  eventId?: number
}>()

const emit = defineEmits<{
  submit: [value: GenbaEventInput]
}>()

const toFormState = (item: InitialItemInput): GenbaItemFormState => ({
  label: item.label,
  unitPrice: item.unitPrice,
  quantity: item.quantity,
  memberName: item.memberName,
  groupDraft: item.groupName ?? null
})

const eventName = ref(props.initialValue.eventName)
const eventDate = ref(props.initialValue.eventDate ?? '')
const venueName = ref(props.initialValue.venueName ?? '')
const ticketPrice = ref(props.initialValue.ticketPrice)
const drinkFee = ref(props.initialValue.drinkFee)
const transportFee = ref(props.initialValue.transportFee)
const memo = ref(props.initialValue.memo ?? '')
const rating = ref<number | null>(props.initialValue.rating ?? null)
const chekiItems = ref<GenbaItemFormState[]>(props.initialValue.chekiItems.map(toFormState))
const goodsItems = ref<GenbaItemFormState[]>(props.initialValue.goodsItems.map(toFormState))

const errorMessage = ref('')

const { venues, idols, groups, fetchMasters, ensureMasterEntry } = useGenbaMasters()

onMounted(fetchMasters)

const extraVenueNames = ref<string[]>([])
const venueItems = computed(() => [...new Set([...venues.value.map(v => v.name), ...extraVenueNames.value])])

const handleCreateVenue = (name: string) => {
  if (!extraVenueNames.value.includes(name)) {
    extraVenueNames.value = [...extraVenueNames.value, name]
  }
  venueName.value = name
}

const itemsTotal = computed(() => {
  const chekiTotal = chekiItems.value.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const goodsTotal = goodsItems.value.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  return chekiTotal + goodsTotal
})

const grandTotal = computed(() => {
  return (ticketPrice.value || 0) + (drinkFee.value || 0) + (transportFee.value || 0) + itemsTotal.value
})

const allEvents = ref<GenbaEvent[]>([])
const monthBudget = ref<number | null>(null)

const targetYearMonth = computed(() => {
  const today = new Date()
  if (!eventDate.value) {
    return { year: today.getFullYear(), month: today.getMonth() + 1 }
  }
  const [y, m] = eventDate.value.split('-').map(Number)
  return { year: y, month: m }
})

const fetchMonthBudget = async () => {
  const res = await $fetch<{ monthlyAmount: number | null }>('/api/genba/budget', {
    query: { year: targetYearMonth.value.year, month: targetYearMonth.value.month }
  })
  monthBudget.value = res.monthlyAmount
}

onMounted(async () => {
  allEvents.value = await $fetch<GenbaEvent[]>('/api/genba/events')
  await fetchMonthBudget()
})

watch(targetYearMonth, fetchMonthBudget)

const otherEventsMonthTotal = computed(() => {
  const prefix = `${targetYearMonth.value.year}-${String(targetYearMonth.value.month).padStart(2, '0')}-`
  return allEvents.value
    .filter(e => e.id !== props.eventId && e.eventDate?.startsWith(prefix))
    .reduce((sum, e) => sum + e.totalAmount, 0)
})

const budgetOverAmount = computed(() => {
  if (monthBudget.value === null) return 0
  return (otherEventsMonthTotal.value + grandTotal.value) - monthBudget.value
})

const setRating = (value: number) => {
  rating.value = rating.value === value ? null : value
}

const handleSubmit = async () => {
  errorMessage.value = ''

  if (!eventName.value.trim()) {
    errorMessage.value = 'イベント名を入力してください'
    return
  }

  const missingMember = chekiItems.value.some(item => !item.memberName?.trim())
  if (missingMember) {
    errorMessage.value = 'チェキは推し（メンバー）を入力してください'
    return
  }

  const allItems = [...chekiItems.value, ...goodsItems.value]

  await Promise.all([
    ensureMasterEntry('venues', venueName.value),
    ...allItems.map(item => ensureMasterEntry('idols', item.memberName ?? '', item.groupDraft)),
    ...allItems.map(item => ensureMasterEntry('groups', item.groupDraft ?? ''))
  ])

  const stripGroupDraft = ({ groupDraft, ...rest }: GenbaItemFormState) => {
    void groupDraft
    return rest
  }

  emit('submit', {
    eventName: eventName.value.trim(),
    eventDate: eventDate.value || null,
    venueName: venueName.value.trim() || null,
    ticketPrice: ticketPrice.value || 0,
    drinkFee: drinkFee.value || 0,
    transportFee: transportFee.value || 0,
    memo: memo.value || null,
    rating: rating.value,
    chekiItems: chekiItems.value.map(stripGroupDraft),
    goodsItems: goodsItems.value.map(stripGroupDraft)
  })
}
</script>

<template>
  <form
    class="flex flex-col gap-5"
    @submit.prevent="handleSubmit"
  >
    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
    />

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex items-center gap-2 font-semibold">
          <UIcon
            name="i-lucide-calendar-days"
            class="text-lg"
          />
          イベント情報
        </div>
      </template>

      <div class="flex flex-col gap-4">
        <UFormField label="イベント名">
          <UInput
            v-model="eventName"
            placeholder="例: ○○ライブ 大阪公演"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="開催日">
            <UInput
              v-model="eventDate"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField label="会場">
            <UInputMenu
              v-model="venueName"
              :items="venueItems"
              create-item="always"
              placeholder="会場名"
              class="w-full"
              @create="handleCreateVenue"
            />
          </UFormField>
        </div>

        <div>
          <p class="mb-2 text-xs font-semibold text-muted">
            費用
          </p>
          <div class="grid grid-cols-3 gap-3">
            <UFormField label="チケット代">
              <UInput
                v-model.number="ticketPrice"
                type="number"
                min="0"
                step="100"
                class="w-full"
              />
            </UFormField>

            <UFormField label="ドリンク代">
              <UInput
                v-model.number="drinkFee"
                type="number"
                min="0"
                step="100"
                class="w-full"
              />
            </UFormField>

            <UFormField label="交通費">
              <UInput
                v-model.number="transportFee"
                type="number"
                min="0"
                step="100"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </div>
    </UCard>

    <GenbaItemEditor
      v-model="chekiItems"
      label="チェキ"
      icon="i-lucide-camera"
      :idols="idols"
      :groups="groups"
      require-member
    />

    <GenbaItemEditor
      v-model="goodsItems"
      label="グッズ"
      icon="i-lucide-shopping-bag"
      :idols="idols"
      :groups="groups"
      show-label
    />

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex items-center gap-2 font-semibold">
          <UIcon
            name="i-lucide-star"
            class="text-lg"
          />
          満足度
        </div>
      </template>

      <div class="flex items-center gap-1">
        <button
          v-for="star in 5"
          :key="star"
          type="button"
          @click="setRating(star)"
        >
          <UIcon
            name="i-lucide-star"
            class="text-2xl"
            :class="rating !== null && star <= rating ? 'text-warning' : 'text-muted'"
          />
        </button>
      </div>
    </UCard>

    <UCard :ui="{ body: 'p-3 sm:p-4' }">
      <template #header>
        <div class="flex items-center gap-2 font-semibold">
          <UIcon
            name="i-lucide-sticky-note"
            class="text-lg"
          />
          メモ
        </div>
      </template>

      <UTextarea
        v-model="memo"
        placeholder="任意"
        class="w-full"
      />
    </UCard>

    <UAlert
      v-if="budgetOverAmount > 0"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      :title="`この内容だと${targetYearMonth.month}月の予算を¥${budgetOverAmount.toLocaleString()}超えます`"
    />

    <UCard :ui="{ body: 'p-4 flex items-center justify-between', root: 'border-2 border-primary' }">
      <span class="font-semibold">合計支出</span>
      <span class="text-xl font-bold text-primary">¥{{ grandTotal.toLocaleString() }}</span>
    </UCard>

    <UButton
      type="submit"
      block
      size="lg"
      :loading="loading"
      icon="i-lucide-check"
    >
      {{ submitLabel }}
    </UButton>
  </form>
</template>
