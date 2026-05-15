import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { JobInfo, JobMatchScore } from '@/types/models'

export const useJobStore = defineStore('job', () => {
  // State
  const jobs = ref<JobInfo[]>([])
  const matchScores = ref<JobMatchScore[]>([])
  const selectedJob = ref<JobInfo | null>(null)
  const targetJob = ref<JobInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const recommendedJobs = computed(() => {
    // 根据匹配分数排序
    const jobsWithScores = jobs.value.map(job => {
      const score = matchScores.value.find(s => s.jobId === job.id)
      return {
        ...job,
        matchScore: score?.score ?? 0,
        matchReasons: score?.matchReasons ?? []
      }
    })

    return jobsWithScores.sort((a, b) => b.matchScore - a.matchScore)
  })

  const hasSelectedTarget = computed(() => !!targetJob.value)

  // Actions
  const setJobs = (jobList: JobInfo[]) => {
    jobs.value = jobList
  }

  const setMatchScores = (scores: JobMatchScore[]) => {
    matchScores.value = scores
  }

  const selectJob = (job: JobInfo) => {
    selectedJob.value = job
  }

  const setTargetJob = (job: JobInfo) => {
    targetJob.value = job
    localStorage.setItem('targetJob', JSON.stringify(job))
  }

  const clearSelection = () => {
    selectedJob.value = null
  }

  const clearTargetJob = () => {
    targetJob.value = null
    localStorage.removeItem('targetJob')
  }

  const addJob = (job: JobInfo) => {
    jobs.value.push(job)
  }

  const updateJob = (jobId: number, updates: Partial<JobInfo>) => {
    const index = jobs.value.findIndex(j => j.id === jobId)
    if (index !== -1) {
      const existingJob = jobs.value[index]
      if (existingJob) {
        jobs.value[index] = {
          ...existingJob,
          ...updates,
          id: existingJob.id, // 确保 id 不被覆盖
          title: updates.title ?? existingJob.title // 确保 title 不为 undefined
        }
      }
    }
  }

  const removeJob = (jobId: number) => {
    jobs.value = jobs.value.filter(j => j.id !== jobId)
  }

  const reset = () => {
    jobs.value = []
    matchScores.value = []
    selectedJob.value = null
    targetJob.value = null
    loading.value = false
    error.value = null
    localStorage.removeItem('targetJob')
  }

  const loadTargetJobFromLocalStorage = () => {
    const stored = localStorage.getItem('targetJob')
    if (stored) {
      try {
        targetJob.value = JSON.parse(stored)
      } catch (e) {
        console.error('Failed to parse targetJob from localStorage:', e)
      }
    }
  }

  // 初始化时从 localStorage 恢复目标岗位
  loadTargetJobFromLocalStorage()

  return {
    // State
    jobs,
    matchScores,
    selectedJob,
    targetJob,
    loading,
    error,

    // Getters
    recommendedJobs,
    hasSelectedTarget,

    // Actions
    setJobs,
    setMatchScores,
    selectJob,
    setTargetJob,
    clearSelection,
    clearTargetJob,
    addJob,
    updateJob,
    removeJob,
    reset,
    loadTargetJobFromLocalStorage
  }
})
