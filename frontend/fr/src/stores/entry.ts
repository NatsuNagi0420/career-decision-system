import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { EntryData } from '@/types/models'

export const useEntryStore = defineStore('entry', () => {
  // State
  const entryData = ref<EntryData>({
    basic: {},
    target: {},
    skills: [],
    certificates: [],
    workExperiences: [],
    projectExperiences: [],
    links: []
  })

  const isCompleted = ref(false)
  const lastSavedAt = ref<string | null>(null)

  // Actions
  const updateBasicInfo = (data: Partial<EntryData['basic']>) => {
    entryData.value.basic = {
      ...entryData.value.basic,
      ...data
    }
    saveToLocalStorage()
  }

  const updateTargetJob = (data: Partial<EntryData['target']>) => {
    entryData.value.target = {
      ...entryData.value.target,
      ...data
    }
    saveToLocalStorage()
  }

  const updateSkills = (skills: string[]) => {
    entryData.value.skills = skills
    saveToLocalStorage()
  }

  const updateCertificates = (certificates: string[]) => {
    entryData.value.certificates = certificates
    saveToLocalStorage()
  }

  const updateWorkExperiences = (experiences: EntryData['workExperiences']) => {
    entryData.value.workExperiences = experiences
    saveToLocalStorage()
  }

  const updateProjectExperiences = (experiences: EntryData['projectExperiences']) => {
    entryData.value.projectExperiences = experiences
    saveToLocalStorage()
  }

  const updateLinks = (links: string[]) => {
    entryData.value.links = links
    saveToLocalStorage()
  }

  const updateEntryData = (data: Partial<EntryData>) => {
    entryData.value = {
      ...entryData.value,
      ...data
    }
    saveToLocalStorage()
  }

  const markAsCompleted = () => {
    isCompleted.value = true
    saveToLocalStorage()
  }

  const reset = () => {
    entryData.value = {
      basic: {},
      target: {},
      skills: [],
      certificates: [],
      workExperiences: [],
      projectExperiences: [],
      links: []
    }
    isCompleted.value = false
    lastSavedAt.value = null
    localStorage.removeItem('entryData')
  }

  const saveToLocalStorage = () => {
    lastSavedAt.value = new Date().toISOString()
    localStorage.setItem('entryData', JSON.stringify({
      data: entryData.value,
      isCompleted: isCompleted.value,
      lastSavedAt: lastSavedAt.value
    }))
  }

  const loadFromLocalStorage = () => {
    const stored = localStorage.getItem('entryData')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        entryData.value = parsed.data || entryData.value
        isCompleted.value = parsed.isCompleted || false
        lastSavedAt.value = parsed.lastSavedAt || null
      } catch (e) {
        console.error('Failed to parse entryData from localStorage:', e)
      }
    }
  }

  // 初始化时从 localStorage 恢复数据
  loadFromLocalStorage()

  return {
    // State
    entryData,
    isCompleted,
    lastSavedAt,

    // Actions
    updateBasicInfo,
    updateTargetJob,
    updateSkills,
    updateCertificates,
    updateWorkExperiences,
    updateProjectExperiences,
    updateLinks,
    updateEntryData,
    markAsCompleted,
    reset,
    saveToLocalStorage,
    loadFromLocalStorage
  }
})
