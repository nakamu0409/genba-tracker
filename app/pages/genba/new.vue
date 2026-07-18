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

const duplicateFromId = typeof route.query.duplicateFrom === 'string' ? route.query.duplicateFrom : null
const sourceEvent = ref<GenbaEventDetail | null>(null)
const loadingSource = ref(!!duplicateFromId)

onMounted(async () => {
  if (!duplicateFromId) return

  try {
    sourceEvent.value = await $fetch<GenbaEventDetail>(`/api/genba/events/${duplicateFromId}`)
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '複製元の取得に失敗しました'
  } finally {
    loadingSource.value = false
  }
})

// 複製時は日付・満足度・メモは新しい現場用に空にし、会場・費用・推しの明細はそのまま引き継ぐ
const initialValue = computed<GenbaEventInput>(() => {
  const src = sourceEvent.value

  if (!src) {
    return {
      eventName: '',
      eventDate: typeof route.query.date === 'string' ? route.query.date : null,
      venueName: null,
      ticketPrice: 0,
      ticketPaid: true,
      drinkFee: 0,
      transportFee: 0,
      lodgingFee: 0,
      memo: null,
      rating: null,
      chekiItems: [],
      goodsItems: []
    }
  }

  const toItemInput = (item: GenbaEventDetail['items'][number]) => ({
    label: item.label,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    memberName: item.memberName,
    groupName: item.groupName
  })

  return {
    eventName: src.eventName,
    eventDate: typeof route.query.date === 'string' ? route.query.date : null,
    venueName: src.venueName,
    ticketPrice: src.ticketPrice,
    ticketPaid: true,
    drinkFee: src.drinkFee,
    transportFee: src.transportFee,
    lodgingFee: src.lodgingFee,
    memo: null,
    rating: null,
    chekiItems: src.items.filter(item => item.category === 'cheki').map(toItemInput),
    goodsItems: src.items.filter(item => item.category === 'goods').map(toItemInput)
  }
})

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

    <UAlert
      v-if="duplicateFromId && sourceEvent"
      color="primary"
      variant="soft"
      icon="i-lucide-copy"
      title="複製した内容です。日付を選び直して登録してください"
      class="mb-4"
    />

    <div
      v-if="loadingSource"
      class="py-10 text-center text-muted"
    >
      読み込み中...
    </div>

    <GenbaEventForm
      v-else
      :initial-value="initialValue"
      submit-label="登録"
      :loading="loading"
      @submit="handleSubmit"
    />
  </div>
</template>
