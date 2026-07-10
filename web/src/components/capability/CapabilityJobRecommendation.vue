<!--
  组件：推荐岗位卡片
  职责：展示高匹配度的推荐岗位信息
-->
<script setup lang="ts">
import { Briefcase } from 'lucide-vue-next'

interface Job {
  id: number
  jobName: string
  companyName: string
  location: string
  salaryRange: string
}

interface Props {
  job?: Job
  matchScore?: number
  title?: string
}

interface Emits {
  (e: 'explore', jobIds: string): void
}

const props = withDefaults(defineProps<Props>(), {
  matchScore: 0
})

const emit = defineEmits<Emits>()

const handleExplore = () => {
  if (props.job) {
    emit('explore', String(props.job.id))
  }
}
</script>

<template>
  <div class="info-card">
    <div class="card-header">
      <Briefcase class="icon-accent" :size="20" />
      <h3 class="card-title">高匹配岗位推荐</h3>
    </div>
    <div v-if="job && title" class="job-list">
      <div class="job-item">
        <div class="job-info-top">
          <h4 class="job-name">{{ title }}</h4>
          <span class="match-rate">{{ matchScore }}% 匹配</span>
        </div>
        <div class="job-details">
          <p>
            {{ job.companyName }} ·
            {{ job.location }}
          </p>
          <p class="salary-text">
            {{ job.salaryRange }}
          </p>
        </div>
      </div>
    </div>
    <div v-else class="job-list">
      <div class="job-item">
        <div class="job-info-top">
          <h4 class="job-name">正在为你生成推荐岗位…</h4>
          <span class="match-rate">--</span>
        </div>
      </div>
    </div>
    <el-button
      class="more-btn clay-btn-primary"
      type="primary"
      @click="handleExplore"
    >
      去岗位探索
    </el-button>
  </div>
</template>

<style scoped>
.info-card {
  background: var(--clay-surface);
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.info-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--clay-shadow-hard);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.icon-accent {
  color: var(--clay-ube-800);
}

.card-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.job-item {
  padding: 16px;
  border-radius: 12px;
  background-color: #f5efe5;
  border: 1px dashed var(--clay-border);
}

.job-info-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.job-name {
  font-weight: 700;
  color: var(--clay-text);
  margin: 0;
}

.match-rate {
  color: var(--clay-ube-800);
  font-weight: 700;
  font-size: 14px;
}

.job-details {
  font-size: 12px;
  color: var(--clay-text-subtle);
}

.job-details p {
  margin: 4px 0;
}

.salary-text {
  color: var(--clay-text);
  font-weight: 500;
}

.more-btn {
  width: 100%;
  margin-top: 24px;
}
</style>
