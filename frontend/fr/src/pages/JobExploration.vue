<!--
  页面：岗位探索页（/job-exploration）。
  职责：提供岗位搜索、筛选与推荐能力，支持选择目标岗位并写入本地/后端，
        为后续能力画像与路径规划提供目标信息。
-->
<script setup lang="ts">
import { onMounted } from 'vue'
import { SlidersHorizontal, BarChart3 } from 'lucide-vue-next'
import { useJobExploration } from '@/composables/useJobExploration'
import ProfilePromptBanner from '@/components/ProfilePromptBanner.vue'
import JobFilters from '@/components/job/JobFilters.vue'
import JobCard from '@/components/job/JobCard.vue'
import JobDetailPanel from '@/components/job/JobDetailPanel.vue'
import JobComparePanel from '@/components/job/JobComparePanel.vue'
import JobOverviewPanel from '@/components/job/JobOverviewPanel.vue'

const {
  // 筛选条件
  filterCity,
  filterKeyword,
  filterIndustry,
  filterCompanySize,
  filterCompanyType,
  salaryRange,

  // 状态
  activeTab,
  selectedIds,
  targetId,
  activeJobId,
  userProfile,

  // 数据
  total,
  loading,
  page,
  pageSize,

  // 筛选选项
  cities,
  industries,
  companySizes,
  companyTypes,

  // 计算属性
  filteredJobs,
  filteredRecommendedJobs,
  preferredIdSet,
  selectedJobs,
  activeJob,
  activeJobDetail,
  isCompareMode,
  overviewSkills,

  // 方法
  extractRequirements,
  setActive,
  toggleCompare,
  setTarget,
  gotoPlanning,
  initialize
} = useJobExploration()

onMounted(async () => {
  await initialize()
})
</script>

<template>
  <div class="job-page clay-page">
    <div class="page-container">
      <div class="header mb-6">
        <div class="title-row">
          <SlidersHorizontal :size="22" class="title-icon" />
          <h1 class="title">岗位探索</h1>
          <span class="step-tag">第3步</span>
        </div>
        <p class="text-sub">筛选岗位、对比差异，并确认你的目标岗位</p>
      </div>

      <!-- 状态提示横幅 -->
      <ProfilePromptBanner
        v-if="!userProfile.hasEntry"
        level="info"
        icon="💡"
        title="完善信息，获得个性化推荐"
        message="当前显示的是通用岗位列表。完善你的能力画像后，我们将为你推荐最匹配的岗位。"
        action-text="去完善信息"
        action-path="/assessment/mbti"
      />

      <ProfilePromptBanner
        v-else-if="!userProfile.hasCapability"
        level="info"
        icon="🎯"
        title="生成能力画像，解锁推荐功能"
        message="你已完成信息录入。生成能力画像后，即可查看为你量身定制的岗位推荐。"
        action-text="生成能力画像"
        action-path="/capability-profile"
      />

      <div class="layout">
        <aside class="sidebar">
          <!-- 筛选面板 -->
          <JobFilters
            :cities="cities"
            :industries="industries"
            :company-sizes="companySizes"
            :company-types="companyTypes"
            v-model:filter-city="filterCity"
            v-model:filter-industry="filterIndustry"
            v-model:filter-company-size="filterCompanySize"
            v-model:filter-company-type="filterCompanyType"
            v-model:filter-keyword="filterKeyword"
            v-model:salary-range="salaryRange"
          />

          <!-- 详情/对比/总览面板 -->
          <div class="panel detail-panel">
            <div class="panel-title">
              <BarChart3 :size="18" />
              <span>{{ isCompareMode ? '多岗位对比' : activeJob ? '岗位详情' : '社会需求总览' }}</span>
            </div>

            <!-- 对比模式 -->
            <JobComparePanel
              v-if="isCompareMode"
              :selected-jobs="selectedJobs"
              :target-id="targetId"
              @remove-job="toggleCompare"
              @goto-planning="gotoPlanning"
            />

            <!-- 详情模式 -->
            <JobDetailPanel
              v-else-if="activeJob"
              :job="activeJob"
              :job-detail="activeJobDetail"
              :requirements="extractRequirements(activeJobDetail?.jobDetails ?? '')"
              :target-id="targetId"
              @set-target="setTarget(activeJob)"
              @goto-planning="gotoPlanning"
            />

            <!-- 总览模式 -->
            <JobOverviewPanel
              v-else
              :overview-skills="overviewSkills"
            />
          </div>
        </aside>

        <main class="list">
          <el-tabs v-model="activeTab" class="job-tabs">
            <!-- 推荐岗位标签页 -->
            <el-tab-pane
              v-if="userProfile.isComplete"
              label="推荐岗位"
              name="recommended"
            >
              <section class="zone">
                <div class="zone-head">
                  <div>
                    <div class="zone-title">为你优选</div>
                    <div class="zone-sub">大模型根据你的测评与问卷推荐</div>
                  </div>
                  <div class="zone-meta" v-if="filteredRecommendedJobs.length">
                    {{ filteredRecommendedJobs.length }} 个
                  </div>
                </div>

                <div v-if="filteredRecommendedJobs.length" class="shop-grid">
                  <JobCard
                    v-for="job in filteredRecommendedJobs"
                    :key="`recommended-${job.id}`"
                    :job="job"
                    :is-active="String(job.id) === activeJobId"
                    :is-selected="selectedIds.includes(String(job.id))"
                    :is-preferred="true"
                    :requirements="extractRequirements(`${job.jobName} ${job.industry ?? ''}`)"
                    @click="setActive(String(job.id))"
                    @compare="toggleCompare(job)"
                    @set-target="setTarget(job)"
                  />
                </div>

                <div v-else class="zone-empty text-sub">
                  先完成能力画像分析后，这里会展示你的高匹配岗位。
                </div>
              </section>
            </el-tab-pane>

            <!-- 所有岗位标签页 -->
            <el-tab-pane label="所有岗位" name="all">
              <section class="zone">
                <div class="zone-head mb-3">
                  <div>
                    <div class="zone-title">自由探索</div>
                    <div class="zone-sub">基于数据库岗位库筛选与浏览</div>
                  </div>
                  <div class="zone-meta">共 {{ filteredJobs.length }} 个</div>
                </div>

                <div class="chips mb-3">
                  <div
                    class="chip"
                    :class="{ active: selectedIds.length === 0 }"
                    @click="selectedIds = []"
                  >
                    未对比
                  </div>
                  <div
                    class="chip"
                    :class="{ active: selectedIds.length >= 2 }"
                    @click="selectedIds.length < 2 && filteredJobs[0] && toggleCompare(filteredJobs[0])"
                  >
                    对比模式
                  </div>
                </div>

                <div v-loading="loading" class="shop-grid">
                  <JobCard
                    v-for="job in filteredJobs"
                    :key="job.id"
                    :job="job"
                    :is-active="String(job.id) === activeJobId"
                    :is-selected="selectedIds.includes(String(job.id))"
                    :is-preferred="preferredIdSet.has(String(job.id))"
                    :requirements="extractRequirements(`${job.jobName} ${job.industry ?? ''}`)"
                    @click="setActive(String(job.id))"
                    @compare="toggleCompare(job)"
                    @set-target="setTarget(job)"
                  />
                </div>

                <div class="pagination-row mt-6">
                  <el-pagination
                    v-model:current-page="page"
                    :page-size="pageSize"
                    :total="total"
                    layout="total, prev, pager, next, jumper"
                    background
                  />
                </div>
              </section>
            </el-tab-pane>
          </el-tabs>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.job-tabs :deep(.el-tabs__header) {
  margin-bottom: 20px;
}

.job-tabs :deep(.el-tabs__item) {
  font-size: 16px;
  font-weight: 700;
  color: var(--clay-text-subtle);
}

.job-tabs :deep(.el-tabs__item.is-active) {
  color: var(--clay-ube-800);
}

.job-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--clay-ube-800);
}

.pagination-row {
  display: flex;
  justify-content: center;
}

.job-page {
  min-height: 100vh;
  background: transparent;
}

.page-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 104px 24px 60px;
}

.header {
  text-align: left;
}

.mb-6 {
  margin-bottom: 24px;
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
  color: var(--clay-text);
}

.title-icon {
  color: var(--clay-ube-800);
}

.step-tag {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  padding: 2px 10px;
  border-radius: 999px;
}

.text-sub {
  color: var(--clay-text-subtle);
  font-size: 16px;
}

.layout {
  display: grid;
  grid-template-columns: 340px 1fr;
  gap: 24px;
  align-items: start;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 100px);
  overflow-y: auto;
  padding-right: 4px;
}

.sidebar::-webkit-scrollbar {
  width: 4px;
}

.sidebar::-webkit-scrollbar-thumb {
  background: #e2e8f0;
  border-radius: 4px;
}

.panel {
  padding: 20px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 16px;
  margin-bottom: 20px;
  color: var(--clay-text);
}

.zone {
  padding: 0;
}

.zone-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.zone-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--clay-text);
  margin-bottom: 4px;
}

.zone-sub {
  font-size: 14px;
  color: var(--clay-text-subtle);
}

.zone-meta {
  font-size: 14px;
  color: var(--clay-text-subtle);
  font-weight: 600;
}

.zone-empty {
  padding: 60px 20px;
  text-align: center;
  font-size: 14px;
}

.mb-3 {
  margin-bottom: 12px;
}

.chips {
  display: flex;
  gap: 12px;
}

.chip {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  color: var(--clay-text-subtle);
  cursor: pointer;
  transition: all 0.2s ease;
}

.chip:hover {
  border-color: var(--clay-ube-800);
  color: var(--clay-ube-800);
}

.chip.active {
  background: var(--clay-ube-800);
  color: white;
  border-color: var(--clay-ube-800);
}

.shop-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.mt-6 {
  margin-top: 24px;
}
</style>
