<script setup lang="ts">
definePageMeta({
  layout: 'genba'
})

const email = ref('')
const loggedInEmail = ref<string | null>(null)
const pending = ref(true)
const sending = ref(false)
const sent = ref(false)
const errorMessage = ref('')

const fetchStatus = async () => {
  pending.value = true
  try {
    const res = await $fetch<{ email: string | null }>('/api/genba/auth/me')
    loggedInEmail.value = res.email
  } finally {
    pending.value = false
  }
}

onMounted(fetchStatus)

const sendLoginLink = async () => {
  errorMessage.value = ''
  sending.value = true

  try {
    await $fetch('/api/genba/auth/request-login', {
      method: 'post',
      body: { email: email.value.trim() }
    })
    sent.value = true
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? '送信に失敗しました'
  } finally {
    sending.value = false
  }
}

const logout = async () => {
  await $fetch('/api/genba/auth/logout', { method: 'post' })
  loggedInEmail.value = null
  sent.value = false
  email.value = ''
}

// 遠征・グッズ探しの導線（アフィリエイトID設定時は成果リンクになる）
const config = useRuntimeConfig()
const rakutenTravelUrl = computed(() => buildRakutenAffiliateUrl('https://travel.rakuten.co.jp/', config.public.rakutenAffiliateId))
const tripComUrl = computed(() => buildTripAffiliateUrl('https://jp.trip.com/hotels/', config.public.tripAllianceId, config.public.tripSid))
const rakutenIchibaUrl = computed(() => buildRakutenAffiliateUrl('https://search.rakuten.co.jp/search/mall/%E6%8E%A8%E3%81%97%E6%B4%BB%E3%82%B0%E3%83%83%E3%82%BA/', config.public.rakutenAffiliateId))
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <h1 class="mb-4 text-xl font-bold">
      アカウント
    </h1>

    <div
      v-if="pending"
      class="py-10 text-center text-muted"
    >
      読み込み中...
    </div>

    <UCard v-else-if="loggedInEmail">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          ログイン中
        </p>
        <p class="font-semibold">
          {{ loggedInEmail }}
        </p>
        <p class="text-sm text-muted">
          別の端末でこのメールアドレスを使ってログインすると、同じ記録を見ることができます。
        </p>
        <UButton
          color="neutral"
          variant="soft"
          @click="logout"
        >
          ログアウト
        </UButton>
      </div>
    </UCard>

    <UCard v-else>
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          メールアドレスでログインすると、他の端末でも同じ記録を見られるようになります。パスワードの入力は不要です。
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
        />

        <template v-if="sent">
          <UAlert
            color="primary"
            variant="soft"
            title="ログイン用のリンクを送信しました"
            description="メール内のリンクをタップすると、この端末でログインできます（30分以内に有効）。"
          />
        </template>

        <div
          v-else
          class="flex gap-2"
        >
          <UInput
            v-model="email"
            type="email"
            placeholder="メールアドレス"
            class="flex-1"
            @keyup.enter="sendLoginLink"
          />
          <UButton
            :loading="sending"
            @click="sendLoginLink"
          >
            送信
          </UButton>
        </div>
      </div>
    </UCard>

    <UCard
      class="mt-4"
      :ui="{ body: 'p-4 flex flex-col gap-3' }"
    >
      <div class="flex items-center gap-2 font-semibold">
        <UIcon name="i-lucide-sparkles" />
        オタ活のお供
        <UBadge
          color="neutral"
          variant="subtle"
          size="sm"
        >
          PR
        </UBadge>
      </div>

      <div class="flex flex-col gap-2">
        <UButton
          :to="rakutenTravelUrl"
          external
          target="_blank"
          icon="i-lucide-bed-double"
          variant="soft"
          color="neutral"
          block
          class="justify-start"
        >
          楽天トラベルで遠征の宿を探す
        </UButton>
        <UButton
          :to="tripComUrl"
          external
          target="_blank"
          icon="i-lucide-plane"
          variant="soft"
          color="neutral"
          block
          class="justify-start"
        >
          Trip.comで遠征の宿を探す
        </UButton>
        <UButton
          :to="rakutenIchibaUrl"
          external
          target="_blank"
          icon="i-lucide-shopping-bag"
          variant="soft"
          color="neutral"
          block
          class="justify-start"
        >
          楽天市場で推し活グッズを探す
        </UButton>
      </div>
    </UCard>
  </div>
</template>
