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
  </div>
</template>
