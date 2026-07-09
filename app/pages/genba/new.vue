<script setup lang="ts">
import GenbaEventForm from '../../components/genba/GenbaEventForm.vue'
import type { GenbaEventDetail, GenbaEventInput } from '../../../shared/types/genba'

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
  ticketPrice: 0,
  drinkFee: 0,
  transportFee: 0,
  lodgingFee: 0,
  memo: null,
  rating: null,
  chekiItems: [],
  goodsItems: []
}

const handleSubmit = async (value: GenbaEventInput, photos: File[]) => {
  errorMessage.value = ''
  loading.value = true

  try {
    const created = await $fetch<GenbaEventDetail>('/api/genba/events', {
      method: 'post',
      body: value
    })

    // 写真は登録済みイベントに紐づけてアップロードする（失敗しても登録自体は完了している）
    let photoFailed = false
    for (const file of photos) {
      try {
        const blob = await resizeGenbaImage(file)
        const formData = new FormData()
        formData.append('photo', blob, 'photo.jpg')
        await $fetch(`/api/genba/events/${created.id}/photos`, {
          method: 'post',
          body: formData
        })
      } catch {
        photoFailed = true
      }
    }

    if (photoFailed) {
      alert('一部の写真をアップロードできませんでした。詳細ページから追加できます')
    }

    // 写真付きで登録したときは仕上がりが見える詳細ページへ
    router.push(photos.length > 0 ? `/genba/${created.id}` : '/genba')
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
