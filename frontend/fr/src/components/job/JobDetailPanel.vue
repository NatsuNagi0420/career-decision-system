<!--
  组件：岗位详情面板
  职责：展示单个岗位的详细信息
-->
<script setup lang="ts">
import type { JobInfo } from '@/api/jobs'
import type { JobListItem } from '@/composables/useJobExploration'

interface Props {
  job: JobListItem
  jobDetail: JobInfo | null
  requirements: string[]
  targetId: string | null
}

interface Emits {
  (e: 'setTarget'): void
  (e: 'gotoPlanning'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="detail">
    <div class="detail-title">
      {{ jobDetail?.jobName ?? job.jobName }}
    </div>
    <div class="detail-sub text-sub">
      {{ jobDetail?.companyName ?? job.companyName }} ·
      {{ jobDetail?.location ?? job.location }}
    </div>
    <div class="detail-salary">
      {{ jobDetail?.salaryRange ?? job.salaryRange }}
    </div>
    <div class="mini-title">关键要求</div>
    <div class="tags mb-4">
      <el-tag
        v-for="s in requirements.slice(0, 8)"
        :key="s"
        effect="plain"
      >
        {{ s }}
      </el-tag>
    </div>
    <div class="mini-title">岗位描述</div>
    <div class="desc text-sub">
      {{ jobDetail?.jobDetails ?? '' }}
    </div>
    <div class="btn-row mt-4">
      <el-button
        class="w-full submit-main-btn"
        type="primary"
        @click="emit('setTarget')"
      >
        确认该岗位为目标
      </el-button>
      <el-button
        class="w-full"
        plain
        @click="emit('gotoPlanning')"
        :disabled="!targetId"
      >
        进入路径规划
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.detail {
  padding: 4px 0;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  margin-bottom: 8px;
}

.detail-sub {
  font-size: 14px;
  margin-bottom: 8px;
}

.text-sub {
  color: var(--clay-text-subtle);
}

.detail-salary {
  font-size: 20px;
  font-weight: 700;
  color: var(--clay-ube-800);
  margin-bottom: 16px;
}

.mini-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--clay-text);
  margin-bottom: 12px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.mb-4 {
  margin-bottom: 16px;
}

.desc {
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.btn-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mt-4 {
  margin-top: 16px;
}

.w-full {
  width: 100%;
}

.submit-main-btn {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
}
</style>
