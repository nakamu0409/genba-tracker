<script setup lang="ts">
import type { GenbaEventDetail } from '../../../shared/types/genba'
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

const goEdit = () => {
  router.push(`/genba/edit/${id}`)
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
          to="/genba"
          icon="i-lucide-arrow-left"
          variant="ghost"
          color="neutral"
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
            <span class="text-lg font-bold">{{ data.eventName }}</span>
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

      <UCard>
        <div class="flex flex-col gap-2 text-sm">
          <div class="flex justify-between">
            <span class="text-muted">チケット代</span>
            <span>¥{{ data.ticketPrice.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">ドリンク代</span>
            <span>¥{{ data.drinkFee.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted">交通費</span>
            <span>¥{{ data.transportFee.toLocaleString() }}</span>
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
