<script setup lang="ts">
definePageMeta({
  layout: 'genba'
})

const route = useRoute()
const router = useRouter()
const token = String(route.query.token ?? '')

const loading = ref(false)
const errorMessage = ref('')

const confirmLogin = async () => {
  errorMessage.value = ''
  loading.value = true

  try {
    await $fetch('/api/genba/auth/confirm', {
      method: 'post',
      body: { token }
    })
    router.push('/genba/account')
  } catch (e) {
    errorMessage.value = (e as { data?: { message?: string } })?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <h1 class="mb-4 text-xl font-bold">
      ログイン確認
    </h1>

    <UCard>
      <div class="flex flex-col gap-3">
        <p class="text-sm text-muted">
          このボタンを押すと、この端末でログインします（リンクは1回だけ有効です）。
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="soft"
          :title="errorMessage"
        />

        <UButton
          :loading="loading"
          block
          @click="confirmLogin"
        >
          ログインする
        </UButton>
      </div>
    </UCard>
  </div>
</template>
