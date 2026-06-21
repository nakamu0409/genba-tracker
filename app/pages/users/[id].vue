<script setup lang="ts">
/**
ユーザー詳細参照画面
 *
・個人情報を扱うため認証済みユーザーのみアクセス可能とする
・一般社員も参照は可能
・更新操作は管理者のみ可能とする
 */
definePageMeta({
  middleware: 'auth'
})

type UserResponse = {
  id: number
  name: string
  email: string
  status: string
  statusLabel: string
}

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

// 共通 composable
const { loginUser, loginRole, isAdmin, fetchLoginUser } = useLoginUser()

// ユーザー詳細取得
const { data, pending, error } = await useFetch<UserResponse>(() => `/api/users/${id}`)

// 404 判定
const { isNotFound } = useNotFound(error)

// 初期表示時にログイン中ユーザー情報を取得
await fetchLoginUser()

const goBack = () => {
  router.push('/')
}

const goEdit = () => {
  router.push(`/users/edit/${id}`)
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="headerRow">
        <h1 class="title">
          ユーザー参照
        </h1>

        <div class="headerButtons">
          <button
            v-if="!isNotFound"
            class="btn btnGhost"
            @click="goBack"
          >
            一覧へ戻る
          </button>

          <button
            v-if="isAdmin && !isNotFound"
            class="btn"
            @click="goEdit"
          >
            更新画面へ
          </button>
        </div>
      </div>

      <p
        v-if="loginUser"
        class="loginInfo"
      >
        ログイン中: {{ loginUser }}
        <template v-if="loginRole === 'ROLE_ADMIN'">
          （管理者）
        </template>
        <template v-else-if="loginRole === 'ROLE_USER'">
          （一般社員）
        </template>
      </p>

      <div
        v-if="pending"
        class="state"
      >
        読み込み中...
      </div>

      <div
        v-else-if="isNotFound"
        class="state stateError"
      >
        <p class="stateMessage">
          指定したユーザーは削除されたか、存在しません。
        </p>

        <div class="buttonRow">
          <button
            class="btn"
            @click="goBack"
          >
            一覧へ戻る
          </button>
        </div>
      </div>

      <div
        v-else-if="error"
        class="state stateError"
      >
        エラー: {{ error.message }}
      </div>

      <div
        v-else
        class="detailArea"
      >
        <div class="detailRow">
          <div class="label">
            ID
          </div>
          <div class="value">
            {{ data?.id }}
          </div>
        </div>

        <div class="detailRow">
          <div class="label">
            名前
          </div>
          <div class="value">
            {{ data?.name }}
          </div>
        </div>

        <div class="detailRow">
          <div class="label">
            メールアドレス
          </div>
          <div class="detailRow">
            <div class="label">
              ステータス
            </div>
            <div class="value">
              {{ data?.statusLabel }}
            </div>
          </div>
          <div class="value">
            {{ data?.email || '未設定' }}
          </div>
        </div>
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
  width: min(820px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.headerRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.headerButtons {
  display: flex;
  gap: 10px;
}

.title {
  margin: 0;
  font-size: 24px;
}

.loginInfo {
  margin: 0 0 16px;
  font-size: 14px;
  color: #64748b;
}

.state {
  padding: 12px;
  border-radius: 10px;
  background: #f8fafc;
  color: #0f172a;
}

.stateError {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.detailArea {
  display: grid;
  gap: 14px;
}

.detailRow {
  display: grid;
  grid-template-columns: 180px 1fr;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  overflow: hidden;
}

.label {
  background: #f8fafc;
  padding: 14px 16px;
  font-weight: 600;
  color: #334155;
  border-right: 1px solid #e5e7eb;
}

.value {
  padding: 14px 16px;
  color: #0f172a;
  word-break: break-word;
}

.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  cursor: pointer;
}

.btn:hover {
  opacity: 0.9;
}

.btnGhost {
  background: transparent;
  color: #2563eb;
  border: 1px solid #cbd5e1;
}

@media (max-width: 640px) {
  .headerRow {
    flex-direction: column;
    align-items: stretch;
  }

  .headerButtons {
    flex-direction: column;
  }

  .detailRow {
    grid-template-columns: 1fr;
  }

  .label {
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
  }

  .btn {
    width: 100%;
  }
}
</style>
