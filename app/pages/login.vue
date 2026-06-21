<script setup lang="ts">
import { ref } from 'vue'

/**
ログイン画面
 *
・未認証ユーザーの入口画面
・入力されたユーザー名 / パスワードで認証確認を行う
・認証成功時は Cookie 保存後に一覧画面へ遷移する
 */
const username = ref('')
const password = ref('')

const loading = ref(false)
const successMessage = ref('')
const globalErrors = ref<string[]>([])

const fieldErrors = ref({
  username: '',
  password: ''
})

/**
エラー表示を初期化する
 */
const resetErrors = () => {
  globalErrors.value = []
  fieldErrors.value = {
    username: '',
    password: ''
  }
}

/**
入力チェック
 */
const validateForm = () => {
  resetErrors()

  if (!username.value.trim()) {
    fieldErrors.value.username = 'ユーザー名を入力してください'
  }

  if (!password.value.trim()) {
    fieldErrors.value.password = 'パスワードを入力してください'
  }

  globalErrors.value = Object.values(fieldErrors.value).filter(Boolean) as string[]

  return globalErrors.value.length === 0
}

/**
ログイン処理
 *
【流れ】
1. 入力チェック
2. /api/login を呼び出し
3. 成功時 → Cookie保存済み状態になる
4. 一覧画面（/）へ遷移
 */
const login = async () => {
  successMessage.value = ''

  const isValid = validateForm()
  if (!isValid) return

  loading.value = true

  try {
    await $fetch('/api/login', {
      method: 'post',
      body: {
        username: username.value.trim(),
        password: password.value
      }
    })

    // :white_check_mark: ログイン状態
    const loggedIn = useCookie('logged_in')
    loggedIn.value = 'true'

    // :white_check_mark: ユーザー名保存
    const loginUser = useCookie('login_user')
    loginUser.value = username.value.trim()

    successMessage.value = 'ログインしました'

    // Cookie反映後に一覧画面へ遷移
    window.location.href = '/'
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e: unknown) {
    globalErrors.value = ['ログインに失敗しました']
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="card">
      <h1 class="title">
        ログイン
      </h1>

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
          <label class="label">ユーザー名</label>
          <input
            v-model="username"
            class="input"
            :class="{ inputError: fieldErrors.username }"
            placeholder="ユーザー名を入力"
            @keydown.enter="login"
          >
          <p
            v-if="fieldErrors.username"
            class="fieldError"
          >
            {{ fieldErrors.username }}
          </p>
        </div>

        <div class="inputArea">
          <label class="label">パスワード</label>
          <input
            v-model="password"
            class="input"
            :class="{ inputError: fieldErrors.password }"
            type="password"
            placeholder="パスワードを入力"
            @keydown.enter="login"
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
          @click="login"
        >
          {{ loading ? 'ログイン中...' : 'ログイン' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.card {
  width: min(520px, 100%);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.title {
  margin: 0 0 20px;
  font-size: 24px;
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
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 600;
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
  margin-top: 6px;
  font-size: 13px;
  color: #dc2626;
}

.buttonRow {
  margin-top: 20px;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
</style>
