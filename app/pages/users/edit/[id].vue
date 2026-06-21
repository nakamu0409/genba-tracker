<script setup lang="ts">
import { ref, watchEffect } from 'vue'

/**
ユーザー更新画面
 *
・データ変更操作を行うため認証必須
・管理者ロールのみアクセス可能
 */
definePageMeta({
  middleware: ['auth', 'admin']
})

type UserResponse = {
  id: number
  name: string
  email: string
  status: string
  statusLabel: string
}

type UserStatusResponse = {
  id: number
  code: string
  label: string
}

const route = useRoute()
const router = useRouter()
const id = String(route.params.id)

// 共通 composable
const { loginUser, loginRole, fetchLoginUser } = useLoginUser()

// ユーザー詳細取得
const { data, refresh, pending, error } = await useFetch<UserResponse>(() => `/api/users/${id}`)

// 404 判定
const { isNotFound } = useNotFound(error)

const name = ref('')
const email = ref('')
const password = ref('')
const status = ref('')
const statuses = ref<UserStatusResponse[]>([])

const successMessage = ref('')
const globalErrors = ref<string[]>([])

const fieldErrors = ref({
  name: '',
  email: '',
  password: ''
})

const loading = ref(false)

const selectedFile = ref<File | null>(null)

/**
APIから取得した値を初期表示に反映する
 */
watchEffect(() => {
  if (data.value?.name != null) {
    name.value = data.value.name
  }

  if (data.value?.email != null) {
    email.value = data.value.email
  }

  if (data.value?.status != null) {
    status.value = data.value.status
  }
})

/**
ステータス一覧を取得する
 */
const fetchStatuses = async () => {
  try {
    statuses.value = await $fetch('/api/user-statuses')
  } catch (e: unknown) {
    console.error('ステータス取得に失敗しました', e)
  }
}

/**
エラー表示を初期化する
 */
const resetErrors = () => {
  globalErrors.value = []

  fieldErrors.value = {
    name: '',
    email: '',
    password: ''
  }
}

/**
パスワード入力欄を初期化する
 */
const resetPassword = () => {
  password.value = ''
}

/**
メール形式の簡易チェック
 */
const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
フロント側バリデーション
 */
const validateForm = () => {
  resetErrors()

  const trimmedName = name.value.trim()
  const trimmedEmail = email.value.trim()
  const rawPassword = password.value

  // 名前
  if (!trimmedName) {
    fieldErrors.value.name = '名前を入力してください'
  } else if (trimmedName.length > 50) {
    fieldErrors.value.name = '名前は50文字以内です'
  }

  // メール
  if (!trimmedEmail) {
    fieldErrors.value.email = 'メールアドレスを入力してください'
  } else if (!isValidEmail(trimmedEmail)) {
    fieldErrors.value.email = 'メールアドレス形式で入力してください'
  }

  // パスワード
  // 更新時は空欄OK、入力された場合のみ条件チェック
  if (rawPassword.trim() && (rawPassword.length < 8 || rawPassword.length > 100)) {
    fieldErrors.value.password = 'パスワードは8文字以上100文字以内です'
  }

  globalErrors.value = Object.values(fieldErrors.value).filter(Boolean) as string[]

  return globalErrors.value.length === 0
}

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] ?? null
}

const uploadFile = async () => {
  if (!selectedFile.value) {
    globalErrors.value = ['ファイルを選択してください。']
    return
  }

  const formData = new FormData()
  formData.append('file', selectedFile.value)

  try {
    await $fetch(`/api/users/${id}/upload`, {
      method: 'post',
      body: formData
    })

    successMessage.value = 'ファイルをアップロードしました'
    await refresh()
  } catch (e: unknown) {
    console.error('ファイルアップロードに失敗しました', e)
    globalErrors.value = ['ファイルアップロードに失敗しました。']
  }
}

/**
ユーザー更新処理
 */
const updateUser = async () => {
  successMessage.value = ''

  // 既に削除済みなら更新させない
  if (isNotFound.value) {
    globalErrors.value = ['指定したユーザーは削除されたか、存在しません。']
    return
  }

  const isValid = validateForm()
  if (!isValid) {
    return
  }

  loading.value = true

  try {
    await $fetch(`/api/users/${id}`, {
      method: 'put',
      body: {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        status: status.value
      }
    })

    await refresh()
    successMessage.value = '更新しました'
    resetPassword()
    resetErrors()
  } catch (e: unknown) {
    const apiError = e as {
      statusCode?: number
      data?: {
        statusCode?: number
        message?: string
        errors?: {
          name?: string
          email?: string
          password?: string
        }
      }
      response?: {
        _data?: {
          message?: string
          errors?: {
            name?: string
            email?: string
            password?: string
          }
        }
      }
    }

    // 更新時に別タブで削除されていた場合
    if (apiError.statusCode === 404 || apiError.data?.statusCode === 404) {
      globalErrors.value = ['指定したユーザーは削除されたか、存在しません。']
      return
    }

    const errors
      = apiError.data?.errors
        || apiError.response?._data?.errors

    const message
      = apiError.data?.message
        || apiError.response?._data?.message
        || '更新に失敗しました'

    if (errors) {
      fieldErrors.value = {
        name: errors.name ?? '',
        email: errors.email ?? '',
        password: errors.password ?? ''
      }

      globalErrors.value = Object.values(fieldErrors.value).filter(Boolean) as string[]

      if (globalErrors.value.length === 0) {
        globalErrors.value = [message]
      }
    } else {
      globalErrors.value = [message]
    }
  } finally {
    loading.value = false
  }
}

/**
参照画面へ戻る
 */
const goBack = () => {
  router.push(`/users/${id}`)
}

/**
一覧画面へ戻る
 */
const goList = () => {
  router.push('/')
}

// 初期表示時にログイン中ユーザー情報とステータス一覧を取得
await fetchLoginUser()
await fetchStatuses()
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="headerRow">
        <h1 class="title">
          ユーザー更新
        </h1>

        <div class="headerRight">
          <p
            v-if="loginUser"
            class="loginInfo"
          >
            ログイン中: {{ loginUser }}
            <template v-if="loginRole === 'ROLE_ADMIN'">
              （管理者）
            </template>
          </p>

          <div class="headerButtons">
            <button
              v-if="!isNotFound"
              class="btn btnGhost"
              @click="goBack"
            >
              参照へ戻る
            </button>

            <button
              v-if="!isNotFound"
              class="btn btnGhost"
              @click="goList"
            >
              一覧へ戻る
            </button>
          </div>
        </div>
      </div>

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
            @click="goList"
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
        class="contentArea"
      >
        <div class="messageArea">
          <div
            v-if="globalErrors.length > 0"
            class="errorBox"
          >
            <p
              v-for="message in globalErrors"
              :key="message"
              class="errorItem"
            >
              {{ message }}
            </p>
          </div>

          <p
            v-if="successMessage"
            class="success"
          >
            {{ successMessage }}
          </p>
        </div>

        <div class="formGrid">
          <div class="inputArea">
            <label class="label">名前</label>
            <input
              v-model="name"
              class="input"
              :class="{ inputError: fieldErrors.name }"
              placeholder="名前を入力（50文字以内）"
              maxlength="50"
            >
            <p class="hint">
              {{ name.length }}/50
            </p>
            <p
              v-if="fieldErrors.name"
              class="fieldError"
            >
              {{ fieldErrors.name }}
            </p>
          </div>

          <div class="inputArea">
            <label class="label">メールアドレス</label>
            <input
              v-model="email"
              class="input"
              :class="{ inputError: fieldErrors.email }"
              placeholder="メールアドレスを入力"
            >
            <p
              v-if="fieldErrors.email"
              class="fieldError"
            >
              {{ fieldErrors.email }}
            </p>
          </div>

          <div class="inputArea">
            <label class="label">ステータス</label>

            <select
              v-model="status"
              class="input"
            >
              <option value="">
                選択してください
              </option>

              <option
                v-for="s in statuses"
                :key="s.id"
                :value="s.code"
              >
                {{ s.label }}
              </option>
            </select>
          </div>

          <div class="inputArea">
            <label class="label">パスワード</label>
            <input
              v-model="password"
              class="input"
              :class="{ inputError: fieldErrors.password }"
              type="password"
              placeholder="変更する場合のみ入力"
            >
            <p class="hint">
              ※ 変更しない場合は空欄のままでOK
            </p>
            <p
              v-if="fieldErrors.password"
              class="fieldError"
            >
              {{ fieldErrors.password }}
            </p>
          </div>
        </div>

        <div class="inputArea">
          <label class="label">添付ファイル</label>
          <input
            type="file"
            class="input"
            @change="onFileChange"
          >
        </div>

        <div class="buttonRow">
          <button
            class="btn btnGhost"
            type="button"
            @click="uploadFile"
          >
            ファイルアップロード
          </button>

          <div class="buttonRow">
            <button
              class="btn"
              :disabled="loading"
              @click="updateUser"
            >
              {{ loading ? '更新中...' : '更新' }}
            </button>
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
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.title {
  margin: 0;
  font-size: 24px;
  white-space: nowrap;
}

.headerRight {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.headerButtons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.loginInfo {
  margin: 0;
  font-size: 14px;
  color: #64748b;
  white-space: nowrap;
}

.contentArea {
  display: grid;
  gap: 16px;
}

.messageArea {
  min-height: 56px;
}

.formGrid {
  display: grid;
  gap: 16px;
}

.inputArea {
  display: flex;
  flex-direction: column;
}

.label {
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
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

.inputError {
  border-color: #ef4444;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
}

.hint {
  margin: 6px 2px 0;
  font-size: 12px;
  color: #64748b;
}

.fieldError {
  margin: 6px 2px 0;
  font-size: 13px;
  color: #dc2626;
}

.buttonRow {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btnGhost {
  background: transparent;
  color: #2563eb;
  border: 1px solid #cbd5e1;
}

.success {
  margin: 0;
  color: #166534;
  background: #dcfce7;
  border: 1px solid #86efac;
  padding: 10px 12px;
  border-radius: 10px;
}

.errorBox {
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 10px 12px;
  border-radius: 10px;
}

.errorItem {
  margin: 0;
  color: #b91c1c;
  font-size: 14px;
}

.errorItem + .errorItem {
  margin-top: 6px;
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

.stateMessage {
  margin: 0;
}

@media (max-width: 640px) {
  .headerRow {
    flex-direction: column;
    align-items: stretch;
  }

  .headerRight {
    flex-direction: column;
    align-items: stretch;
  }

  .headerButtons {
    flex-direction: column;
  }

  .buttonRow {
    justify-content: stretch;
  }

  .btn {
    width: 100%;
  }

  .loginInfo {
    white-space: normal;
  }
}
</style>
