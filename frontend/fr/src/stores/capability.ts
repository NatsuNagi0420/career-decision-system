import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CapabilityProfileResponse } from '@/api/capability'

export const useCapabilityStore = defineStore('capability', () => {
  // State
  const profile = ref<CapabilityProfileResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastGeneratedAt = ref<string | null>(null)

  // Actions
  const setProfile = (data: CapabilityProfileResponse) => {
    profile.value = data
    lastGeneratedAt.value = new Date().toISOString()
    saveToLocalStorage()
  }

  const updateProfile = (updates: Partial<CapabilityProfileResponse>) => {
    if (profile.value) {
      profile.value = {
        ...profile.value,
        ...updates
      }
      saveToLocalStorage()
    }
  }

  const reset = () => {
    profile.value = null
    loading.value = false
    error.value = null
    lastGeneratedAt.value = null
    localStorage.removeItem('capabilityProfile')
  }

  const saveToLocalStorage = () => {
    if (profile.value) {
      localStorage.setItem('capabilityProfile', JSON.stringify({
        profile: profile.value,
        lastGeneratedAt: lastGeneratedAt.value
      }))
    }
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('capabilityProfile')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        profile.value = parsed.profile || null
        lastGeneratedAt.value = parsed.lastGeneratedAt || null
      } catch (e) {
        console.error('Failed to parse capabilityProfile from localStorage:', e)
      }
    }
  }

  // 初始化时从 localStorage 恢复数据
  loadFromLocalStorage()

  return {
    // State
    profile,
    loading,
    error,
    lastGeneratedAt,

    // Actions
    setProfile,
    updateProfile,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage
  }
})
