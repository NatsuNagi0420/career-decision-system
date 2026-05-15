<template>
  <div class="right-section sticky top-20">
    <div class="card section mb-6">
      <div class="section-head">
        <div class="section-title">完成度</div>
        <div class="text-sub text-sm">建议 ≥70% 再提交，画像会更稳定</div>
      </div>

      <div class="progress-item">
        <div class="progress-row">
          <span>基础资料</span>
          <span class="text-mute text-xs">{{ basicCompletion }}%</span>
        </div>
        <el-progress :percentage="basicCompletion" color="#02492a" :stroke-width="8" />
      </div>
      <div class="progress-item">
        <div class="progress-row">
          <span>求职目标</span>
          <span class="text-mute text-xs">{{ targetCompletion }}%</span>
        </div>
        <el-progress :percentage="targetCompletion" color="#02492a" :stroke-width="8" />
      </div>
      <div class="progress-item">
        <div class="progress-row">
          <span>技能与经历</span>
          <span class="text-mute text-xs">{{ materialCompletion }}%</span>
        </div>
        <el-progress :percentage="materialCompletion" color="#02492a" :stroke-width="8" />
      </div>
      <div class="progress-item">
        <div class="progress-row">
          <span>深度问卷</span>
          <span class="text-mute text-xs">{{ questionnaireCompletion }}%</span>
        </div>
        <el-progress :percentage="questionnaireCompletion" color="#02492a" :stroke-width="8" />
      </div>
      <div class="progress-item">
        <div class="progress-row">
          <span>MBTI 测评</span>
          <span class="text-mute text-xs">{{ mbtiCompletion }}%</span>
        </div>
        <el-progress :percentage="mbtiCompletion" color="#02492a" :stroke-width="8" />
      </div>

      <div class="overall">
        <div class="progress-row">
          <span>综合</span>
          <span class="text-mute text-xs">{{ overallCompletion }}%</span>
        </div>
        <el-progress :percentage="overallCompletion" color="#02492a" :stroke-width="10" />
      </div>
    </div>

    <div class="mbti-entry-card card-hover" @click="$emit('open-mbti')">
      <div class="mbti-icon">🧠</div>
      <div class="mbti-info">
        <h4>MBTI 测评</h4>
        <p v-if="mbtiResult">已填写：{{ mbtiResult }}</p>
        <p v-else>共 93 题，可做题或直接填写类型</p>
      </div>
      <el-icon><ArrowRight /></el-icon>
    </div>

    <div class="action-section mt-8">
      <el-button
        type="primary"
        class="w-full h-12 submit-main-btn"
        size="large"
        :loading="loading"
        @click="$emit('submit')"
      >
        提交综合分析
      </el-button>
      <p class="hint text-center mt-4 text-gray-400 text-xs">请确保所有核心模块已填写完整</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight } from '@element-plus/icons-vue'

defineOptions({
  name: 'EntryProgressSidebar'
})

interface Props {
  basicCompletion: number
  targetCompletion: number
  materialCompletion: number
  questionnaireCompletion: number
  mbtiCompletion: number
  overallCompletion: number
  mbtiResult: string | null
  loading: boolean
}

interface Emits {
  (e: 'open-mbti'): void
  (e: 'submit'): void
}

defineProps<Props>()
defineEmits<Emits>()
</script>

<style scoped>
.right-section {
  position: sticky;
}

.sticky {
  position: sticky;
}

.top-20 {
  top: 84px;
}

.section {
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  line-height: 1.2;
}

.progress-item {
  margin-top: 16px;
}

.progress-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--clay-text-subtle);
  margin-bottom: 8px;
}

.overall {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--clay-border-subtle);
}

.mbti-entry-card {
  margin-top: 8px;
  padding: 20px 18px;
  border-radius: var(--clay-radius-card);
  border: 1px dashed var(--clay-border);
  background: linear-gradient(135deg, #f5efe5 0%, #ffffff 100%);
  color: var(--clay-text);
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
}

.mbti-icon {
  font-size: 32px;
}

.mbti-info h4 {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
}

.mbti-info p {
  margin: 0;
  font-size: 12px;
  color: var(--clay-text-subtle);
}
</style>
