<script setup lang="ts">
const route = useRoute()

const isAdmin = ref(false)

onMounted(async () => {
  const res = await $fetch<{ isAdmin: boolean }>('/api/genba/admin/status')
  isAdmin.value = res.isAdmin
})

const tabs = computed(() => [
  { to: '/genba', icon: 'i-lucide-receipt', label: '記録' },
  { to: '/genba/calendar', icon: 'i-lucide-calendar', label: 'カレンダー' },
  { to: '/genba/new', icon: 'i-lucide-circle-plus', label: '登録' },
  ...(isAdmin.value ? [{ to: '/genba/masters', icon: 'i-lucide-settings-2', label: 'マスタ' }] : []),
  { to: '/genba/account', icon: 'i-lucide-user', label: 'アカウント' }
])

const isActive = (to: string) => {
  if (to === '/genba') {
    return route.path === '/genba'
  }
  return route.path.startsWith(to)
}
</script>

<template>
  <UApp>
    <div class="appShell">
      <main class="appMain">
        <slot />
      </main>

      <nav class="bottomNav">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="bottomNavItem"
          :class="{ bottomNavItemActive: isActive(tab.to) }"
        >
          <UIcon
            :name="tab.icon"
            class="bottomNavIcon"
          />
          <span class="bottomNavLabel">{{ tab.label }}</span>
        </NuxtLink>
      </nav>
    </div>
  </UApp>
</template>

<style scoped>
.appShell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-elevated);
}

.appMain {
  flex: 1;
  padding-bottom: 84px;
}

.bottomNav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;
  background: var(--ui-bg);
  border-top: 1px solid var(--ui-border);
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
  z-index: 30;
}

.bottomNavItem {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 18px;
  border-radius: 12px;
  color: var(--ui-text-muted);
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
  transition: color 0.15s ease, background-color 0.15s ease;
}

.bottomNavItem:hover {
  background: var(--ui-bg-elevated);
}

.bottomNavItemActive {
  color: var(--ui-primary);
}

.bottomNavIcon {
  font-size: 22px;
}
</style>
