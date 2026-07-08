<script setup lang="ts">
// beforeinstallpromptはChrome系のみの非標準イベント
type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> }

const DISMISS_KEY = 'genba_install_hint_dismissed'

const visible = ref(false)
const installPrompt = ref<BeforeInstallPromptEvent | null>(null)
const isIos = ref(false)

onMounted(() => {
  // すでにホーム画面から起動している、または一度閉じたら出さない
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true
  if (standalone || localStorage.getItem(DISMISS_KEY)) return

  isIos.value = /iPhone|iPad|iPod/.test(navigator.userAgent)
  visible.value = true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installPrompt.value = e as BeforeInstallPromptEvent
  })
})

const install = async () => {
  if (!installPrompt.value) return
  await installPrompt.value.prompt()
  dismiss()
}

const dismiss = () => {
  localStorage.setItem(DISMISS_KEY, '1')
  visible.value = false
}
</script>

<template>
  <div
    v-if="visible"
    class="mx-auto w-full max-w-2xl px-4 pt-3"
  >
    <UAlert
      color="primary"
      variant="soft"
      icon="i-lucide-smartphone"
      :ui="{ title: 'text-sm', description: 'text-xs' }"
      title="ホーム画面に追加するとアプリのように使えます"
      :description="isIos ? '共有ボタン（□↑）→「ホーム画面に追加」でインストールできます' : undefined"
      :close="{ onClick: dismiss }"
      :actions="installPrompt ? [{ label: '追加する', onClick: install }] : []"
    />
  </div>
</template>
