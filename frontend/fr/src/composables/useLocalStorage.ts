/**
 * useLocalStorage - LocalStorage 持久化 Composable
 *
 * 提供响应式的 localStorage 数据管理
 */
import { ref, watch, type Ref } from 'vue'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T
): Ref<T> {
  // 从 localStorage 读取初始值
  const readValue = (): T => {
    if (typeof window === 'undefined') {
      return defaultValue
    }

    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error)
      return defaultValue
    }
  }

  const storedValue = ref<T>(readValue()) as Ref<T>

  // 监听值变化，自动保存到 localStorage
  watch(
    storedValue,
    (newValue) => {
      if (typeof window === 'undefined') {
        return
      }

      try {
        window.localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.warn(`Error setting localStorage key "${key}":`, error)
      }
    },
    { deep: true }
  )

  return storedValue
}

/**
 * 移除 localStorage 中的项
 */
export function removeLocalStorage(key: string): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.removeItem(key)
  } catch (error) {
    console.warn(`Error removing localStorage key "${key}":`, error)
  }
}

/**
 * 清空 localStorage
 */
export function clearLocalStorage(): void {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.clear()
  } catch (error) {
    console.warn('Error clearing localStorage:', error)
  }
}
