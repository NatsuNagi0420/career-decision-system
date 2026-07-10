<!--
  页面：我的报告 / 历史报告列表页（/reports）。
  职责：从后端拉取当前用户在 user_report_archive 表中的报告归档记录，
        左侧展示历史版本列表，右侧展示选中版本的概要、差距块和分阶段行动计划。
-->
<script setup lang="ts">
import { FileText } from 'lucide-vue-next'
import { useReportsList } from '@/composables/useReportsList'
import ReportsListSidebar from '@/components/reports/ReportsListSidebar.vue'
import ReportsDetailView from '@/components/reports/ReportsDetailView.vue'

const {
  loadingList,
  loadingDetail,
  archives,
  selectedId,
  selectedDetail,
  goToReport,
  handleSelect
} = useReportsList()
</script>

<template>
  <div class="reports-page">
    <div class="page-container" v-loading="loadingList">
      <div class="header mb-6">
        <div class="title-row">
          <FileText :size="22" class="title-icon" />
          <h1 class="title">我的报告</h1>
        </div>
        <p class="text-sub">查看并管理你历史保存的职业规划报告</p>
      </div>

      <div v-if="!loadingList && archives.length === 0" class="empty card reports-empty">
        <div class="empty-title">还没有任何归档报告</div>
        <div class="text-sub mb-6">
          完成一轮测验并在报告页点击"保存归档"后，这里会出现你的历史报告。
        </div>
        <el-button type="primary" @click="goToReport">去生成我的第一份报告</el-button>
      </div>

      <div v-else class="layout">
        <ReportsListSidebar
          :archives="archives"
          :selected-id="selectedId"
          @select="handleSelect"
        />

        <ReportsDetailView
          :detail="selectedDetail"
          :loading="loadingDetail"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.reports-page {
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

.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
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

.reports-empty {
  position: relative;
  overflow: hidden;
}

.reports-empty::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(120% 160% at 0% 0%, rgba(248, 204, 101, 0.24) 0%, rgba(248, 204, 101, 0) 55%),
    radial-gradient(140% 180% at 100% 0%, rgba(193, 176, 255, 0.22) 0%, rgba(193, 176, 255, 0) 60%);
  opacity: 1;
  pointer-events: none;
}

.reports-empty > * {
  position: relative;
}

@media (max-width: 1024px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
</style>
