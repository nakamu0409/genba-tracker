<script setup lang="ts">
// Vue
import { ref } from 'vue'

/**
ユーザー登録画面
 *
・認証済みユーザーのみアクセス可能
・管理者ロールのみ利用可能
 */
definePageMeta({
  middleware: ['auth', 'admin']
})

type LoginUserResponse = {
  username: string
  role: string
}

const name = ref('')
const email = ref('')
const password = ref('')

// ステータス一覧
const statuses = ref<
  {
    id: number
    code: string
    label: string
  }[]
>([])

// 選択中のステータス
const status = ref('')

const successMessage = ref('')
const globalErrors = ref<string[]>([])

const fieldErrors = ref({
  name: '',
  email: '',
  password: ''
})

const loading = ref(false)
const router = useRouter()

// ログイン中ユーザー情報
const loginUser = ref('')
const loginRole = ref('')

/**
ログイン中ユーザー情報を取得する
 *
・取得だけを担当する
・リダイレクトはこの関数の外で行う
 */
const fetchLoginUser = async () => {
  const headers = import.meta.server
    ? useRequestHeaders(['cookie'])
    : undefined

  const data = await $fetch<LoginUserResponse>('/api/me', {
    headers
  })

  loginUser.value = data.username
  loginRole.value = data.role
}

/**
入力欄を初期化する
 */
const resetForm = () => {
  name.value = ''
  email.value = ''
  password.value = ''
  status.value = ''
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
  if (!rawPassword.trim()) {
    fieldErrors.value.password = 'パスワードを入力してください'
  } else if (rawPassword.length < 8 || rawPassword.length > 100) {
    fieldErrors.value.password = 'パスワードは8文字以上100文字以内です'
  }

  globalErrors.value = Object.values(fieldErrors.value).filter(Boolean) as string[]

  return globalErrors.value.length === 0
}

/**
ステータス一覧を取得する
 */
const fetchStatuses = async () => {
  try {
    statuses.value = await $fetch('/api/user-statuses')
  } catch (e) {
    console.error('ステータス取得に失敗しました', e)
  }
}

/**
ユーザー登録処理
 */
const addUser = async () => {
  successMessage.value = ''

  const isValid = validateForm()
  if (!isValid) {
    return
  }

  loading.value = true

  try {
    await $fetch('/api/users', {
      method: 'post',
      body: {
        name: name.value.trim(),
        email: email.value.trim(),
        password: password.value,
        status: status.value
      }
    })

    successMessage.value = '登録しました'
    resetForm()
    resetErrors()
  } catch (e: unknown) {
    const apiError = e as {
      data?: {
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

    const errors
      = apiError.data?.errors
        || apiError.response?._data?.errors

    const message
      = apiError.data?.message
        || apiError.response?._data?.message
        || '登録に失敗しました'

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
一覧画面へ戻る
 */
const goBack = () => {
  router.push('/')
}

/**
初期表示時の権限確認
 *
・/api/me の取得に失敗したらログイン画面へ
・管理者以外なら一覧画面へ
 */
try {
  //  初期表示時に権限確認
  await fetchLoginUser()

  //  初期表示時にステータス一覧取得
  await fetchStatuses()

  if (loginRole.value !== 'ROLE_ADMIN') {
    await navigateTo('/')
  }
} catch {
  await navigateTo('/login')
}
</script>

<template>
  <div class="page">
    <div class="card">
      <div class="headerRow">
        <h1 class="title">
          ユーザー登録
        </h1>

        <button
          class="btn btnGhost"
          @click="goBack"
        >
          一覧へ戻る
        </button>
      </div>

      <p
        v-if="loginUser"
        class="loginInfo"
      >
        ログイン中: {{ loginUser }}（管理者）
      </p>

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
            placeholder="パスワードを入力（8文字以上）"
          >
          <p
            v-if="fieldErrors.password"
            class="fieldError"
          >
            {{ fieldErrors.password }}
          </p>
        </div>
      </div>

      <div class="buttonRow">
        <button
          class="btn"
          :disabled="loading"
          @click="addUser"
        >
          {{ loading ? '登録中...' : '登録' }}
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
  margin-bottom: 20px;
}

.title {
  font-size: 24px;
  margin: 0;
}

.loginInfo {
  margin: 0 0 16px;
  font-size: 14px;
  color: #64748b;
}

.messageArea {
  min-height: 56px;
  margin-bottom: 16px;
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
  font-weight: 600;
  margin-bottom: 6px;
  color: #334155;
}

.input {
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

.fieldError {
  color: #dc2626;
  font-size: 13px;
  margin-top: 6px;
}

.hint {
  font-size: 12px;
  color: #64748b;
  margin-top: 6px;
}

.buttonRow {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.btn {
  padding: 10px 14px;
  border-radius: 10px;
  background: #2563eb;
  color: white;
  border: none;
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
  border: 1px solid #cbd5e1;
  color: #2563eb;
}

.success {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #166534;
  padding: 10px;
  border-radius: 8px;
  margin: 0;
}

.errorBox {
  background: #fef2f2;
  border: 1px solid #fecaca;
  padding: 10px;
  border-radius: 8px;
}

.errorItem {
  color: #b91c1c;
  margin: 0;
}

.errorItem + .errorItem {
  margin-top: 6px;
}
</style>
