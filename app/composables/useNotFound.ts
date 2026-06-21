import { computed, type Ref } from 'vue'

type ErrorLike = {
  statusCode?: number
  status?: number
  response?: {
    status?: number
  }
}

export const useNotFound = (
  error: Ref<ErrorLike | null | undefined>
) => {
  const isNotFound = computed(() => {
    return (
      error.value?.statusCode === 404
      || error.value?.status === 404
      || error.value?.response?.status === 404
    )
  })

  return { isNotFound }
}
