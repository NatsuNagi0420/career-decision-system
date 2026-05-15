import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AssessmentData, MbtiResult } from '@/types/models'

export const useAssessmentStore = defineStore('assessment', () => {
  // State
  const assessmentData = ref<AssessmentData>({
    mbtiResult: undefined,
    deepAssessment: {
      values: [],
      interests: [],
      personality: [],
      workStyle: []
    }
  })

  const mbtiCompleted = ref(false)
  const deepAssessmentCompleted = ref(false)
  const lastSavedAt = ref<string | null>(null)

  // Actions
  const updateMbtiResult = (result: MbtiResult) => {
    assessmentData.value.mbtiResult = result
    mbtiCompleted.value = true
    saveToLocalStorage()
  }

  const updateDeepAssessment = (data: Partial<AssessmentData['deepAssessment']>) => {
    assessmentData.value.deepAssessment = {
      ...assessmentData.value.deepAssessment,
      ...data
    }
    saveToLocalStorage()
  }

  const markDeepAssessmentCompleted = () => {
    deepAssessmentCompleted.value = true
    saveToLocalStorage()
  }

  const reset = () => {
    assessmentData.value = {
      mbtiResult: undefined,
      deepAssessment: {
        values: [],
        interests: [],
        personality: [],
        workStyle: []
      }
    }
    mbtiCompleted.value = false
    deepAssessmentCompleted.value = false
    lastSavedAt.value = null
    localStorage.removeItem('assessmentData')
  }

  const saveToLocalStorage = () => {
    lastSavedAt.value = new Date().toISOString()
    localStorage.setItem('assessmentData', JSON.stringify({
      data: assessmentData.value,
      mbtiCompleted: mbtiCompleted.value,
      deepAssessmentCompleted: deepAssessmentCompleted.value,
      lastSavedAt: lastSavedAt.value
    }))
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('assessmentData')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        assessmentData.value = parsed.data || assessmentData.value
        mbtiCompleted.value = parsed.mbtiCompleted || false
        deepAssessmentCompleted.value = parsed.deepAssessmentCompleted || false
        lastSavedAt.value = parsed.lastSavedAt || null
      } catch (e) {
        console.error('Failed to parse assessmentData from localStorage:', e)
      }
    }
  }

  // 初始化时从 localStorage 恢复数据
  loadFromLocalStorage()

  return {
    // State
    assessmentData,
    mbtiCompleted,
    deepAssessmentCompleted,
    lastSavedAt,

    // Actions
    updateMbtiResult,
    updateDeepAssessment,
    markDeepAssessmentCompleted,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage
  }
})
