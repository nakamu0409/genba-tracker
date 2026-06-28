<script setup lang="ts">
import GenbaEventForm from '../../components/genba/GenbaEventForm.vue'
import type { GenbaEventInput } from '../../../shared/types/genba'

definePageMeta({
  layout: 'genba'
})

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const errorMessage = ref('')

const initialValue: GenbaEventInput = {
  eventName: '',
  eventDate: typeof route.query.date === 'string' ? route.query.date : null,
  venueName: null,
  budgetAmount: null,
  ticketPrice: 0,
  drinkFee: 0,
  transportFee: 0,
  memo: null,
  chekiItems: [],
  goodsItems: []
}

const handleSubmit = async (value: GenbaEventInput) => {
  errorMessage.value = ''
  loading.value = true

  try {
    await $fetch('/api/genba/events', {
      method: 'post',
      body: value
    })

    router.push('/genba')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '登録に失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <h1 class="mb-4 text-xl font-bold">
      現場を登録
    </h1>

    <UAlert
      v-if="errorMessage"
      color="error"
      variant="soft"
      :title="errorMessage"
      class="mb-4"
    />

    <GenbaEventForm
      :initial-value="initialValue"
      submit-label="登録"
      :loading="loading"
      @submit="handleSubmit"
    />
  </div>
</template>
