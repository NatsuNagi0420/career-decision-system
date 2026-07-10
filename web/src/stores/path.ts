import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CareerPath } from '@/types/models'

export const usePathStore = defineStore('path', () => {
  // State
  const careerPath = ref<CareerPath | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastGeneratedAt = ref<string | null>(null)

  // Actions
  const setCareerPath = (data: CareerPath) => {
    careerPath.value = data
    lastGeneratedAt.value = new Date().toISOString()
    saveToLocalStorage()
  }

  const updateCareerPath = (updates: Partial<CareerPath>) => {
    if (careerPath.value) {
      careerPath.value = {
        ...careerPath.value,
        ...updates
      }
      saveToLocalStorage()
    }
  }

  const reset = () => {
    careerPath.value = null
    loading.value = false
    error.value = null
    lastGeneratedAt.value = null
    localStorage.removeItem('careerPath')
  }

  const saveToLocalStorage = () => {
    if (careerPath.value) {
      localStorage.setItem('careerPath', JSON.stringify({
        path: careerPath.value,
        lastGeneratedAt: lastGeneratedAt.value
      }))
    }
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('careerPath')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        careerPath.value = parsed.path || null
        lastGeneratedAt.value = parsed.lastGeneratedAt || null
      } catch (e) {
        console.error('Failed to parse careerPath from localStorage:', e)
      }
    }
  }

  // 初始化时从 localStorage 恢复数据
  loadFromLocalStorage()

  return {
    // State
    careerPath,
    loading,
    error,
    lastGeneratedAt,

    // Actions
    setCareerPath,
    updateCareerPath,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage
  }
})
