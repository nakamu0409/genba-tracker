<script setup lang="ts">
import type { GenbaEventDetail, GenbaPhoto } from '../../../shared/types/genba'
import { useGenbaMasters } from '../../composables/useGenbaMasters'

definePageMeta({
  layout: 'genba'
})

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

const { data, pending, error } = await useFetch<GenbaEventDetail>(() => `/api/genba/events/${id}`)

const { idols, fetchMasters } = useGenbaMasters()
onMounted(fetchMasters)

const photoFor = (name: string | null) => {
  if (!name) return undefined
  return idols.value.find(idol => idol.name === name)?.photoUrl ?? undefined
}

const deleting = ref(false)
const errorMessage = ref('')

const chekiItems = computed(() => data.value?.items.filter(item => item.category === 'cheki') ?? [])
const goodsItems = computed(() => data.value?.items.filter(item => item.category === 'goods') ?? [])

// 0円の費目は表示しない（宿泊費など使わない現場でゼロ行が並ぶのを避ける）
const baseFees = computed(() => {
  if (!data.value) return []
  return [
    { label: 'チケット代', value: data.value.ticketPrice },
    { label: 'ドリンク代', value: data.value.drinkFee },
    { label: '交通費', value: data.value.transportFee },
    { label: '宿泊費', value: data.value.lodgingFee }
  ].filter(fee => fee.value > 0)
})

const goEdit = () => {
  router.push(`/genba/edit/${id}`)
}

// 予定の現場に出すホテル予約への導線（アフィリエイトID設定時は成果リンクにする）
const config = useRuntimeConfig()
const rakutenHotelUrl = computed(() => {
  const base = 'https://travel.rakuten.co.jp/'
  const affiliateId = config.public.rakutenAffiliateId
  if (!affiliateId) return base
  return `https://hb.afl.rakuten.co.jp/hgc/${affiliateId}/?pc=${encodeURIComponent(base)}`
})

const tripHotelUrl = computed(() => {
  const base = 'https://jp.trip.com/hotels/'
  const { tripAllianceId, tripSid } = config.public
  if (!tripAllianceId || !tripSid) return base
  return `${base}?Allianceid=${tripAllianceId}&SID=${tripSid}`
})

const photos = ref<GenbaPhoto[]>([])
watch(data, (d) => {
  photos.value = d?.photos ?? []
}, { immediate: true })

const uploadingPhotos = ref(false)
const deletingPhotoId = ref<number | null>(null)

const uploadPhotos = async (ev: Event) => {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''

  if (files.length === 0) return

  errorMessage.value = ''
  uploadingPhotos.value = true

  try {
    for (const file of files) {
      const blob = await resizeGenbaImage(file)
      const formData = new FormData()
      formData.append('photo', blob, 'photo.jpg')

      const photo = await $fetch<GenbaPhoto>(`/api/genba/events/${id}/photos`, {
        method: 'post',
        body: formData
      })
      photos.value = [...photos.value, photo]
    }
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '写真のアップロードに失敗しました'
  } finally {
    uploadingPhotos.value = false
  }
}

const deletePhoto = async (photoId: number) => {
  const ok = confirm('この写真を削除しますか？')
  if (!ok) return

  errorMessage.value = ''
  deletingPhotoId.value = photoId

  try {
    await $fetch(`/api/genba/photos/${photoId}`, { method: 'delete' })
    photos.value = photos.value.filter(p => p.id !== photoId)
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '写真の削除に失敗しました'
  } finally {
    deletingPhotoId.value = null
  }
}

const goBack = () => {
  if (window.history.state?.back) {
    router.back()
  } else {
    router.push('/genba')
  }
}

const deleteEvent = async () => {
  const ok = confirm('この現場の記録を削除しますか？')
  if (!ok) return

  errorMessage.value = ''
  deleting.value = true

  try {
    await $fetch(`/api/genba/events/${id}`, { method: 'delete' })
    router.push('/genba')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '削除に失敗しました'
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
          @click="goBack"
        />
        <h1 class="text-xl font-bold">
          現場の詳細
        </h1>
      </div>

      <div
        v-if="data"
        class="flex gap-2"
      >
        <UButton
          icon="i-lucide-pencil"
          variant="soft"
          @click="goEdit"
        />
        <UButton
          icon="i-lucide-trash-2"
          color="error"
          variant="soft"
          :loading="deleting"
          @click="deleteEvent"
        />
      </div>
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
      v-else-if="error || !data"
      color="error"
      variant="soft"
      title="指定した現場は見つかりませんでした"
    />

    <div
      v-else
      class="flex flex-col gap-4"
    >
      <UCard>
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-2 text-lg font-bold">
              {{ data.eventName }}
              <UBadge
                v-if="isPlannedGenbaDate(data.eventDate)"
                color="info"
                variant="subtle"
                size="sm"
              >
                予定
              </UBadge>
            </span>
            <div
              v-if="data.rating !== null"
              class="flex shrink-0 items-center"
            >
              <UIcon
                v-for="star in 5"
                :key="star"
                name="i-lucide-star"
                class="text-base"
                :class="star <= data.rating ? 'text-warning' : 'text-muted'"
              />
            </div>
          </div>
          <span class="text-sm text-muted">
            {{ data.eventDate || '開催日未設定' }}
            <template v-if="data.venueName"> ・ {{ data.venueName }}</template>
          </span>
          <div
            v-if="data.memberNames.length > 0 || data.groupNames.length > 0"
            class="mt-1 flex flex-wrap items-center gap-1"
          >
            <span
              v-for="name in data.memberNames"
              :key="`member-${name}`"
              class="inline-flex items-center gap-1"
            >
              <UAvatar
                :src="photoFor(name)"
                icon="i-lucide-star"
                size="3xs"
              />
              <UBadge
                color="primary"
                variant="subtle"
              >
                {{ name }}
              </UBadge>
            </span>
            <UBadge
              v-for="name in data.groupNames"
              :key="`group-${name}`"
              color="neutral"
              variant="subtle"
            >
              {{ name }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <UCard
        v-if="isPlannedGenbaDate(data.eventDate)"
        :ui="{ body: 'p-4' }"
      >
        <div class="flex flex-col gap-2">
          <div class="flex flex-col gap-0.5">
            <p class="flex items-center gap-2 text-sm font-semibold">
              遠征の準備
              <UBadge
                color="neutral"
                variant="subtle"
                size="sm"
              >
                PR
              </UBadge>
            </p>
            <p class="text-xs text-muted">
              泊まりの現場ならホテルは早めが安い
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="rakutenHotelUrl"
              external
              target="_blank"
              icon="i-lucide-bed-double"
              variant="soft"
              size="sm"
            >
              楽天トラベル
            </UButton>
            <UButton
              :to="tripHotelUrl"
              external
              target="_blank"
              icon="i-lucide-plane"
              variant="soft"
              size="sm"
            >
              Trip.com
            </UButton>
          </div>
        </div>
      </UCard>

      <UCard v-if="baseFees.length > 0">
        <div class="flex flex-col gap-2 text-sm">
          <div
            v-for="fee in baseFees"
            :key="fee.label"
            class="flex justify-between"
          >
            <span class="text-muted">{{ fee.label }}</span>
            <span>¥{{ fee.value.toLocaleString() }}</span>
          </div>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-semibold">
              <UIcon name="i-lucide-camera" />
              チェキ
            </div>
            <span class="text-sm text-muted">{{ data.chekiCount }}枚 ・ ¥{{ data.chekiTotal.toLocaleString() }}</span>
          </div>
        </template>

        <p
          v-if="chekiItems.length === 0"
          class="text-sm text-muted"
        >
          記録なし
        </p>

        <ul
          v-else
          class="flex flex-col gap-2 text-sm"
        >
          <li
            v-for="item in chekiItems"
            :key="item.id"
            class="flex items-start justify-between gap-2"
          >
            <div class="flex flex-col gap-1">
              <span>{{ item.label }} × {{ item.quantity }}</span>
              <div
                v-if="item.memberName || item.groupName"
                class="flex flex-wrap gap-1"
              >
                <span
                  v-if="item.memberName"
                  class="inline-flex items-center gap-1"
                >
                  <UAvatar
                    :src="photoFor(item.memberName)"
                    icon="i-lucide-star"
                    size="3xs"
                  />
                  <UBadge
                    color="primary"
                    variant="subtle"
                    size="sm"
                  >
                    {{ item.memberName }}
                  </UBadge>
                </span>
                <UBadge
                  v-if="item.groupName"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ item.groupName }}
                </UBadge>
              </div>
            </div>
            <span class="shrink-0">¥{{ (item.unitPrice * item.quantity).toLocaleString() }}</span>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-semibold">
              <UIcon name="i-lucide-shopping-bag" />
              グッズ
            </div>
            <span class="text-sm text-muted">¥{{ data.goodsTotal.toLocaleString() }}</span>
          </div>
        </template>

        <p
          v-if="goodsItems.length === 0"
          class="text-sm text-muted"
        >
          記録なし
        </p>

        <ul
          v-else
          class="flex flex-col gap-2 text-sm"
        >
          <li
            v-for="item in goodsItems"
            :key="item.id"
            class="flex items-start justify-between gap-2"
          >
            <div class="flex flex-col gap-1">
              <span>{{ item.label }} × {{ item.quantity }}</span>
              <div
                v-if="item.memberName || item.groupName"
                class="flex flex-wrap gap-1"
              >
                <span
                  v-if="item.memberName"
                  class="inline-flex items-center gap-1"
                >
                  <UAvatar
                    :src="photoFor(item.memberName)"
                    icon="i-lucide-star"
                    size="3xs"
                  />
                  <UBadge
                    color="primary"
                    variant="subtle"
                    size="sm"
                  >
                    {{ item.memberName }}
                  </UBadge>
                </span>
                <UBadge
                  v-if="item.groupName"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                >
                  {{ item.groupName }}
                </UBadge>
              </div>
            </div>
            <span class="shrink-0">¥{{ (item.unitPrice * item.quantity).toLocaleString() }}</span>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2 font-semibold">
              <UIcon name="i-lucide-image" />
              チェキフォト
            </div>
            <span
              v-if="photos.length > 0"
              class="text-sm text-muted"
            >{{ photos.length }}枚</span>
          </div>
        </template>

        <div class="grid grid-cols-3 gap-2">
          <div
            v-for="p in photos"
            :key="p.id"
            class="relative"
          >
            <a
              :href="p.url"
              target="_blank"
              rel="noopener"
            >
              <img
                :src="p.url"
                alt="チェキフォト"
                loading="lazy"
                class="aspect-square w-full rounded-lg object-cover"
              >
            </a>
            <UButton
              icon="i-lucide-x"
              color="error"
              variant="solid"
              size="xs"
              class="absolute top-1 right-1"
              :loading="deletingPhotoId === p.id"
              @click="deletePhoto(p.id)"
            />
          </div>

          <label class="flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-default text-muted transition hover:border-primary hover:text-primary">
            <UIcon
              :name="uploadingPhotos ? 'i-lucide-loader-circle' : 'i-lucide-plus'"
              class="text-2xl"
              :class="{ 'animate-spin': uploadingPhotos }"
            />
            <span class="text-xs">{{ uploadingPhotos ? 'アップロード中' : '写真を追加' }}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              :disabled="uploadingPhotos"
              @change="uploadPhotos"
            >
          </label>
        </div>
      </UCard>

      <UCard v-if="data.memo">
        <template #header>
          <span class="font-semibold">メモ</span>
        </template>
        <p class="text-sm whitespace-pre-wrap">
          {{ data.memo }}
        </p>
      </UCard>

      <UCard :ui="{ body: 'p-4 flex flex-col gap-2' }">
        <div class="flex items-center justify-between text-sm text-muted">
          <span>チェキ枚数</span>
          <span>{{ data.chekiCount }}枚</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="font-semibold">合計支出</span>
          <span class="text-xl font-bold text-primary">¥{{ data.totalAmount.toLocaleString() }}</span>
        </div>
      </UCard>
    </div>
  </div>
</template>
