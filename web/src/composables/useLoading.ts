/**
 * useLoading - 加载状态管理 Composable
 *
 * 用于管理多个异步操作的加载状态
 */
import { ref, computed } from 'vue'

export function useLoading() {
  const loadingMap = ref<Map<string, boolean>>(new Map())

  // 是否有任何加载中的操作
  const isLoading = computed(() => {
    return Array.from(loadingMap.value.values()).some(loading => loading)
  })

  // 设置加载状态
  const setLoading = (key: string, loading: boolean) => {
    loadingMap.value.set(key, loading)
  }

  // 开始加载
  const startLoading = (key: string) => {
    setLoading(key, true)
  }

  // 结束加载
  const stopLoading = (key: string) => {
    setLoading(key, false)
  }

  // 检查特定操作是否加载中
  const isLoadingKey = (key: string): boolean => {
    return loadingMap.value.get(key) || false
  }

  // 包装异步函数，自动管理加载状态
  const withLoading = async <T>(
    key: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    startLoading(key)
    try {
      return await fn()
    } finally {
      stopLoading(key)
    }
  }

  // 重置所有加载状态
  const reset = () => {
    loadingMap.value.clear()
  }

  return {
    isLoading,
    loadingMap,
    setLoading,
    startLoading,
    stopLoading,
    isLoadingKey,
    withLoading,
    reset
  }
}
