<script setup lang="ts">
import GenbaEventForm from '../../../components/genba/GenbaEventForm.vue'
import type { GenbaEventDetail, GenbaEventInput } from '../../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const { data, pending, error } = await useFetch<GenbaEventDetail>(() => `/api/genba/events/${id}`)

const loading = ref(false)
const errorMessage = ref('')

const initialValue = computed(() => {
  if (!data.value) {
    return null
  }

  return {
    eventName: data.value.eventName,
    eventDate: data.value.eventDate,
    venueName: data.value.venueName,
    ticketPrice: data.value.ticketPrice,
    drinkFee: data.value.drinkFee,
    transportFee: data.value.transportFee,
    memo: data.value.memo,
    chekiItems: data.value.items
      .filter(item => item.category === 'cheki')
      .map(item => ({
        label: item.label,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        memberName: item.memberName,
        groupName: item.groupName
      })),
    goodsItems: data.value.items
      .filter(item => item.category === 'goods')
      .map(item => ({
        label: item.label,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        memberName: item.memberName,
        groupName: item.groupName
      }))
  }
})

const handleSubmit = async (value: GenbaEventInput) => {
  errorMessage.value = ''
  loading.value = true

  try {
    await $fetch(`/api/genba/events/${id}`, {
      method: 'put',
      body: value
    })

    router.push(`/genba/${id}`)
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '更新に失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center gap-2">
      <UButton
        :to="`/genba/${id}`"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
      />
      <h1 class="text-xl font-bold">
        現場を編集
      </h1>
    </div>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
      class="mb-4"
    />

    <div
      v-if="pending"
      class="py-10 text-center text-muted"
    >
      読み込み中...
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="soft"
      title="指定した現場は見つかりませんでした"
    />

    <GenbaEventForm
      v-else-if="initialValue"
      :initial-value="initialValue"
      submit-label="更新"
      :loading="loading"
      @submit="handleSubmit"
    />
  </div>
</template>
