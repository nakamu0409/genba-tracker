<script setup>
// Vue
import { computed, onMounted, ref } from 'vue'

/**
認証制御
 *
一覧画面は認証済みユーザーのみアクセス可能とする。
未ログインの場合は middleware/auth.ts により
/login へリダイレクトされる。
 */
definePageMeta({
  middleware: 'auth'
})

// 一覧データ
const users = ref([])

// 画面入力・表示用
const keyword = ref('')
const errorMessage = ref('')
const successMessage = ref('')

// 行選択・削除状態
const selectedUserId = ref(null)
const deletingId = ref(null)

const router = useRouter()

// ログイン中ユーザー情報
const loginUser = ref('')
const loginRole = ref('')

/**
ログイン中ユーザー情報を取得する
 */
const fetchLoginUser = async () => {
  try {
    const data = await $fetch('/api/me')
    loginUser.value = data.username
    loginRole.value = data.role
  } catch {
    loginUser.value = ''
    loginRole.value = ''
  }
}

/**
管理者ロールかどうか
 */
const isAdmin = computed(() => loginRole.value === 'ROLE_ADMIN')

// 一覧データを取得する
const fetchUsers = async () => {
  errorMessage.value = ''

  try {
    const data = await $fetch('/api/users')

    // ID昇順で表示する
    users.value = data.sort((a, b) => a.id - b.id)
  } catch (e) {
    errorMessage.value
      = e?.data?.message
        ?? '一覧取得に失敗しました'
  }
}

// 検索条件に一致するユーザー一覧を返す
const filteredUsers = computed(() => {
  const q = keyword.value.trim().toLowerCase()

  if (!q) {
    return users.value
  }

  return users.value.filter((user) => {
    return (
      user.name?.toLowerCase().includes(q)
      || user.email?.toLowerCase().includes(q)
    )
  })
})

// 一覧の行を選択する
const selectUser = (id) => {
  selectedUserId.value = id
}

// 登録画面へ遷移する
const goNew = () => {
  router.push('/users/new')
}

// 参照画面へ遷移する
const goDetail = () => {
  if (!selectedUserId.value) return

  router.push(`/users/${selectedUserId.value}`)
}

// 更新画面へ遷移する
const goEdit = () => {
  if (!selectedUserId.value) return

  router.push(`/users/edit/${selectedUserId.value}`)
}

// 指定したユーザーを削除する
const deleteUser = async (id) => {
  const ok = confirm('削除しますか？')
  if (!ok) return

  errorMessage.value = ''
  successMessage.value = ''
  deletingId.value = id

  try {
    await $fetch(`/api/users/${id}`, { method: 'delete' })
    await fetchUsers()

    successMessage.value = '削除しました'

    // 削除した行が選択中だった場合は選択解除する
    if (selectedUserId.value === id) {
      selectedUserId.value = null
    }
  } catch (e) {
    errorMessage.value
      = e?.data?.message
        ?? '削除に失敗しました'
  } finally {
    deletingId.value = null
  }
}

// 選択中ユーザーを削除する
const deleteSelectedUser = async () => {
  if (!selectedUserId.value) return

  await deleteUser(selectedUserId.value)
}

// ログアウト処理
const logout = async () => {
  await $fetch('/api/logout', {
    method: 'post'
  })

  // ログイン状態のCookieをフロント側でもクリアする
  useCookie('auth_token').value = null
  useCookie('logged_in').value = null
  useCookie('login_user').value = null

  router.push('/login')
}

// 初期表示時に一覧を取得する
onMounted(async () => {
  await fetchLoginUser()
  await fetchUsers()
})
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="headerRow">
        <h1 class="title">
          ユーザー一覧
        </h1>

        <div class="headerRight">
          <span
            v-if="loginUser"
            class="loginUser"
          >
            ログイン中: {{ loginUser }}
            <template v-if="loginRole === 'ROLE_ADMIN'">
              （管理者）
            </template>
            <template v-else-if="loginRole === 'ROLE_USER'">
              （一般社員）
            </template>
          </span>

          <NuxtLink
            to="/genba"
            class="logoutBtn"
          >
            現場の記録へ
          </NuxtLink>

          <button
            class="logoutBtn"
            @click="logout"
          >
            ログアウト
          </button>
        </div>
      </div>

      <!-- 選択情報は下に分離 -->
      <div class="selectedInfo">
        <span v-if="selectedUserId">
          選択中 ID: {{ selectedUserId }}
        </span>
        <span v-else>
          一覧から1件選択してください
        </span>
      </div>
      <div class="searchRow">
        <input
          v-model="keyword"
          class="input"
          placeholder="名前・メールアドレスで検索"
        >
      </div>

      <p
        v-if="successMessage"
        class="success"
      >
        {{ successMessage }}
      </p>

      <p
        v-if="errorMessage"
        class="error"
      >
        {{ errorMessage }}
      </p>

      <div class="tableWrap">
        <table class="table">
          <thead>
            <tr>
              <th class="colId">
                ID
              </th>
              <th>名前</th>
              <th>メールアドレス</th>
              <th>ステータス</th>
            </tr>
          </thead>

          <tbody v-if="filteredUsers.length > 0">
            <tr
              v-for="user in filteredUsers"
              :key="user.id"
              :class="{ selectedRow: selectedUserId === user.id }"
              @click="selectUser(user.id)"
            >
              <td class="muted">
                {{ user.id }}
              </td>

              <td
                class="nameCell"
                :title="user.name"
              >
                {{ user.name }}
              </td>

              <td
                class="emailCell"
                :title="user.email || ''"
              >
                <span v-if="user.email">{{ user.email }}</span>
                <span
                  v-else
                  class="emptyValue"
                >
                  未設定
                </span>
              </td>
              <td>
                {{ user.statusLabel }}
              </td>
            </tr>
          </tbody>

          <tbody v-else>
            <tr>
              <td
                colspan="4"
                class="emptyRow"
              >
                表示するユーザーがありません
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bottomActionBar">
        <button
          v-if="isAdmin"
          class="actionBtn primary"
          @click="goNew"
        >
          登録画面へ
        </button>

        <button
          class="actionBtn"
          :disabled="!selectedUserId"
          @click="goDetail"
        >
          参照画面へ
        </button>

        <button
          v-if="isAdmin"
          class="actionBtn"
          :disabled="!selectedUserId"
          @click="goEdit"
        >
          更新画面へ
        </button>

        <button
          v-if="isAdmin"
          class="actionBtn danger"
          :disabled="!selectedUserId || (deletingId !== null && deletingId === selectedUserId)"
          @click="deleteSelectedUser"
        >
          {{
            selectedUserId && deletingId === selectedUserId
              ? '削除中...'
              : '削除'
          }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 24px;
  display: flex;
  justify-content: center;
}

.card {
  width: min(1100px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.headerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.title {
  margin: 0;
  font-size: 24px;
}

.selectedInfo {
  font-size: 14px;
  color: #64748b;
}

.searchRow {
  margin-bottom: 12px;
}

.input {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  outline: none;
}

.input:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.success {
  margin-top: 10px;
  color: #166534;
  background: #dcfce7;
  border: 1px solid #86efac;
  padding: 10px 12px;
  border-radius: 10px;
}

.error {
  margin-top: 10px;
  color: #b91c1c;
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 10px 12px;
  border-radius: 10px;
}

.tableWrap {
  overflow-x: auto;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  margin-top: 16px;
}

.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

.table th,
.table td {
  padding: 12px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: middle;
}

.table thead th {
  background: #f9fafb;
  text-align: left;
  font-weight: 600;
  color: #111827;
}

.colId {
  width: 90px;
}

.muted {
  color: #6b7280;
}

.nameCell,
.emailCell {
  max-width: 300px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.emptyValue {
  color: #9ca3af;
  font-style: italic;
}

.emptyRow {
  text-align: center;
  color: #64748b;
  padding: 24px 12px;
}

.selectedRow {
  background: #e0f2fe;
  cursor: pointer;
}

tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: #f8fafc;
}

.bottomActionBar {
  position: sticky;
  bottom: 0;
  z-index: 20;
  margin-top: 20px;
  padding: 14px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(4px);
  border-radius: 12px;
}

.actionBtn {
  min-width: 140px;
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: #38bdf8;
  color: #fff;
  cursor: pointer;
  font-weight: 600;
}

.actionBtn:hover {
  opacity: 0.9;
}

.actionBtn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.actionBtn.primary {
  background: #2563eb;
}

.actionBtn.danger {
  background: #ef4444;
}

@media (max-width: 640px) {
  .headerRow {
    flex-direction: column;
    align-items: stretch;
  }

  .bottomActionBar {
    flex-wrap: wrap;
    justify-content: stretch;
  }

  .actionBtn {
    width: 100%;
  }
}
.headerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

/* ログアウト専用ボタン */
.logoutBtn {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: #38BDF8;
  color: white;
  cursor: pointer;
  font-weight: 600;
}

.logoutBtn:hover {
  opacity: 0.9;
}

/* 選択情報を下に */
.selectedInfo {
  font-size: 14px;
  color: #64748B;
  margin-bottom: 12px;
}
.headerRight {
  display: flex;
  align-items: center;
  gap: 12px;
}

.loginUser {
  font-size: 14px;
  color: #64748b;
}
</style>
