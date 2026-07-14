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

const prLinks = computed(() => [
  {
    label: 'rakuten-travel',
    title: '楽天トラベル',
    subtitle: '遠征の宿をポイントも貯めながら探す',
    icon: 'i-lucide-bed-double',
    iconBg: 'bg-red-500/10',
    iconColor: 'text-red-500',
    url: buildRakutenAffiliateUrl('https://travel.rakuten.co.jp/', config.public.rakutenAffiliateId)
  },
  {
    label: 'trip-com',
    title: 'Trip.com',
    subtitle: '海外・国内ともに安いプランを比較',
    icon: 'i-lucide-plane',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-500',
    url: buildTripAffiliateUrl('https://jp.trip.com/hotels/', config.public.tripAllianceId, config.public.tripSid)
  },
  {
    label: 'rakuten-ichiba',
    title: '楽天市場',
    subtitle: 'チェキ帳・スリーブなど推し活グッズ',
    icon: 'i-lucide-shopping-bag',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-500',
    url: buildRakutenAffiliateUrl('https://search.rakuten.co.jp/search/mall/%E6%8E%A8%E3%81%97%E6%B4%BB%E3%82%B0%E3%83%83%E3%82%BA/', config.public.rakutenAffiliateId)
  }
])
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
      class="mt-4 overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <div class="bg-gradient-to-br from-primary-500/15 via-primary-500/5 to-transparent p-4 pb-3">
        <div class="flex items-center gap-2 font-semibold">
          <UIcon
            name="i-lucide-sparkles"
            class="text-primary"
          />
          オタ活のお供
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
          >
            PR
          </UBadge>
        </div>
        <p class="mt-1 text-xs text-muted">
          遠征の宿探し・グッズ探しはここから
        </p>
      </div>

      <div class="flex flex-col gap-2 p-4 pt-2">
        <a
          v-for="item in prLinks"
          :key="item.label"
          :href="item.url"
          target="_blank"
          rel="noopener"
          class="group flex items-center gap-3 rounded-xl border border-default p-3 transition hover:border-primary"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            :class="item.iconBg"
          >
            <UIcon
              :name="item.icon"
              class="text-lg"
              :class="item.iconColor"
            />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">
              {{ item.title }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ item.subtitle }}
            </p>
          </div>
          <UIcon
            name="i-lucide-chevron-right"
            class="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary"
          />
        </a>
      </div>
    </UCard>
  </div>
</template>
