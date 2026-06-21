<script setup lang="ts">
import GenbaMasterList from '../../../components/genba/GenbaMasterList.vue'

definePageMeta({
  layout: 'genba'
})

const tabItems = [
  { label: '会場', value: 'venues', icon: 'i-lucide-map-pin' },
  { label: 'アイドル', value: 'idols', icon: 'i-lucide-star' },
  { label: 'グループ', value: 'groups', icon: 'i-lucide-users' }
]

const activeTab = ref('venues')

const isAdmin = ref(false)
const adminKey = ref('')
const adminError = ref('')
const adminLoading = ref(false)

const fetchAdminStatus = async () => {
  const res = await $fetch<{ isAdmin: boolean }>('/api/genba/admin/status')
  isAdmin.value = res.isAdmin
}

onMounted(fetchAdminStatus)

const login = async () => {
  adminError.value = ''
  adminLoading.value = true

  try {
    await $fetch('/api/genba/admin/login', {
      method: 'post',
      body: { key: adminKey.value }
    })

    adminKey.value = ''
    await fetchAdminStatus()
  } catch (e) {
    adminError.value = (e as { data?: { message?: string } })?.data?.message ?? 'ログインに失敗しました'
  } finally {
    adminLoading.value = false
  }
}

const logout = async () => {
  await $fetch('/api/genba/admin/logout', { method: 'post' })
  isAdmin.value = false
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl px-4 py-5">
    <div class="mb-4 flex items-center justify-between">
      <h1 class="text-xl font-bold">
        マスタ管理
      </h1>

      <UBadge
        v-if="isAdmin"
        color="primary"
        variant="subtle"
        class="cursor-pointer"
        @click="logout"
      >
        管理者ログイン中（タップでログアウト）
      </UBadge>
    </div>

    <UCard
      v-if="!isAdmin"
      class="mb-4"
      :ui="{ body: 'p-3 sm:p-4' }"
    >
      <p class="mb-2 text-sm text-muted">
        ここで追加した会場・アイドル・グループは自分専用のデータとして保存されます。全員で共有するデータとして登録したい場合は管理者の合言葉でログインしてください。
      </p>

      <UAlert
        v-if="adminError"
        color="error"
        variant="soft"
        :title="adminError"
        class="mb-2"
      />

      <div class="flex gap-2">
        <UInput
          v-model="adminKey"
          type="password"
          placeholder="管理者の合言葉"
          class="flex-1"
          @keyup.enter="login"
        />
        <UButton
          :loading="adminLoading"
          @click="login"
        >
          ログイン
        </UButton>
      </div>
    </UCard>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      class="mb-4"
    />

    <GenbaMasterList
      v-if="activeTab === 'venues'"
      type="venues"
      :is-admin="isAdmin"
    />
    <GenbaMasterList
      v-else-if="activeTab === 'idols'"
      type="idols"
      show-group-field
      show-photo
      :is-admin="isAdmin"
    />
    <GenbaMasterList
      v-else
      type="groups"
      :is-admin="isAdmin"
    />
  </div>
</template>
