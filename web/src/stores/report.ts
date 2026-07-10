import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Report, ReportListItem } from '@/types/models'

export const useReportStore = defineStore('report', () => {
  // State
  const reports = ref<ReportListItem[]>([])
  const currentReport = ref<Report | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  const setReports = (reportList: ReportListItem[]) => {
    reports.value = reportList
  }

  const setCurrentReport = (report: Report) => {
    currentReport.value = report
  }

  const addReport = (report: ReportListItem) => {
    reports.value.unshift(report)
  }

  const updateReport = (reportId: number, updates: Partial<ReportListItem>) => {
    const index = reports.value.findIndex(r => r.id === reportId)
    if (index !== -1) {
      const existingReport = reports.value[index]
      if (existingReport) {
        reports.value[index] = {
          ...existingReport,
          ...updates,
          id: existingReport.id, // 确保 id 不被覆盖
          title: updates.title ?? existingReport.title, // 确保 title 不为 undefined
          type: updates.type ?? existingReport.type, // 确保 type 不为 undefined
          createdAt: updates.createdAt ?? existingReport.createdAt // 确保 createdAt 不为 undefined
        }
      }
    }
  }

  const deleteReport = (reportId: number) => {
    reports.value = reports.value.filter(r => r.id !== reportId)
  }

  const clearCurrentReport = () => {
    currentReport.value = null
  }

  const reset = () => {
    reports.value = []
    currentReport.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    reports,
    currentReport,
    loading,
    error,

    // Actions
    setReports,
    setCurrentReport,
    addReport,
    updateReport,
    deleteReport,
    clearCurrentReport,
    reset
  }
})
