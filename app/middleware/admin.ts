export default defineNuxtRouteMiddleware(async () => {
  const headers = import.meta.server
    ? useRequestHeaders(['cookie'])
    : undefined

  try {
    const data = await $fetch<{ username: string, role: string }>('/api/me', {
      headers
    })

    if (data.role !== 'ROLE_ADMIN') {
      return navigateTo('/')
    }
  } catch {
    return navigateTo('/login')
  }
})
