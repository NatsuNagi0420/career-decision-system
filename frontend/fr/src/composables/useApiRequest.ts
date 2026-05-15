/**
 * useApiRequest - 通用 API 请求 Composable
 *
 * 提供统一的 API 请求状态管理和错误处理
 */
import { ref, type Ref } from 'vue'
import type { ApiError } from '@/types/api'

export interface UseApiRequestOptions<T> {
  immediate?: boolean
  initialData?: T
  onSuccess?: (data: T) => void
  onError?: (error: ApiError) => void
}

export function useApiRequest<T, P extends unknown[] = []>(
  apiFunction: (...args: P) => Promise<T>,
  options: UseApiRequestOptions<T> = {}
) {
  const { immediate = false, initialData, onSuccess, onError } = options

  const data = ref<T | undefined>(initialData) as Ref<T | undefined>
  const loading = ref(false)
  const error = ref<ApiError | null>(null)

  const execute = async (...args: P): Promise<T | undefined> => {
    loading.value = true
    error.value = null

    try {
      const result = await apiFunction(...args)
      data.value = result

      if (onSuccess) {
        onSuccess(result)
      }

      return result
    } catch (e) {
      error.value = e as ApiError

      if (onError) {
        onError(e as ApiError)
      }

      throw e
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    data.value = initialData
    loading.value = false
    error.value = null
  }

  // 如果设置了 immediate，立即执行
  if (immediate) {
    execute(...([] as unknown as P))
  }

  return {
    data,
    loading,
    error,
    execute,
    reset
  }
}
