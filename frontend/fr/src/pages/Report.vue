<!--
  页面：当前轮职业报告页（/report）。
  职责：基于当前目标岗位与路径规划数据生成一份可阅读的职业规划报告，
        支持本地快照保存与提交后端进行报告归档。
-->
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { FileText } from 'lucide-vue-next'
import { useReport } from '@/composables/useReport'
import ReportTableOfContents from '@/components/report/ReportTableOfContents.vue'
import ReportContent from '@/components/report/ReportContent.vue'

defineOptions({
  name: 'ReportPage'
})

const router = useRouter()

const {
  targetJob,
  loading,
  createdAt,
  displaySummary,
  displayGaps,
  displayPlanStages,
  matchAnalysis,
  evidenceHighlights,
  skillPath,
  action90Days,
  risksAndAlternatives,
  resumeInterviewStrategies,
  exportPdf,
  saveSnapshot,
  goBack
} = useReport()
</script>

<template>
  <div class="report-page clay-page">
    <div class="page-container" v-loading="loading">
      <div class="header mb-6">
        <div class="title-row">
          <FileText :size="22" class="title-icon" />
          <h1 class="title">报告生成</h1>
          <span class="step-tag">第5步</span>
        </div>
        <p class="text-sub">预览、导出并归档你的专属职业规划报告</p>
      </div>

      <div v-if="!targetJob" class="empty card report-empty">
        <div class="empty-title">还缺少目标岗位与计划</div>
        <div class="text-sub mb-6">请先完成岗位探索与路径规划，再生成报告</div>
        <el-button type="primary" @click="router.push('/job-exploration')">去岗位探索</el-button>
      </div>

      <div v-else class="layout">
        <ReportTableOfContents
          @back="goBack"
          @export="exportPdf"
          @save="saveSnapshot"
        />

        <ReportContent
          :target-job="targetJob"
          :created-at="createdAt"
          :display-summary="displaySummary"
          :display-gaps="displayGaps"
          :display-plan-stages="displayPlanStages"
          :match-analysis="matchAnalysis"
          :evidence-highlights="evidenceHighlights"
          :skill-path="skillPath"
          :action90-days="action90Days"
          :risks-and-alternatives="risksAndAlternatives"
          :resume-interview-strategies="resumeInterviewStrategies"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-page {
  min-height: 100vh;
}

.header {
  text-align: left;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title {
  font-size: 28px;
  font-weight: 800;
  margin: 0;
}

.title-icon {
  color: var(--clay-ube-800);
}

.step-tag {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-info-light, #fef6e7);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 10px;
  border-radius: 999px;
}

.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.empty {
  padding: 32px;
  border-radius: var(--clay-radius-card);
}

.empty-title {
  font-size: 18px;
  font-weight: 900;
  margin-bottom: 10px;
}

.report-empty {
  position: relative;
  overflow: hidden;
}

.report-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(248, 204, 101, 0.24) 0%, rgba(248, 204, 101, 0) 55%),
    radial-gradient(140% 180% at 100% 0%, rgba(193, 176, 255, 0.22) 0%, rgba(193, 176, 255, 0) 60%);
  opacity: 1;
  pointer-events: none;
}

.report-empty > * {
  position: relative;
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
