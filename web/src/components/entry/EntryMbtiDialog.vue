<template>
  <el-dialog
    :model-value="visible"
    width="800px"
    :close-on-click-modal="false"
    destroy-on-close
    class="mbti-dialog-custom"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template #header>
      <div class="mbti-dialog-header">
        <span class="title">MBTI 职业性格测评</span>
        <span class="subtitle">共 93 题 · 深度挖掘您的职场潜能</span>
      </div>
    </template>

    <div v-if="loading" class="loading-container py-20 text-center">
      <el-icon class="is-loading text-4xl mb-4">
        <Loading />
      </el-icon>
      <p class="loading-text">正在为您准备深度测评题库...</p>
    </div>

    <!-- 测试前须知页面 -->
    <div v-else-if="!started" class="mbti-notice-container">
      <div class="notice-card">
        <div class="notice-header">
          <el-icon class="notice-icon">
            <InfoFilled />
          </el-icon>
          <h3>MBTI 测试前须知</h3>
        </div>
        <div class="mbti-quick-input">
          <div class="quick-title">已有 MBTI 类型？</div>
          <div class="quick-form">
            <el-input
              :model-value="manualInput"
              maxlength="4"
              placeholder="例如：INFP"
              class="mbti-input"
              @update:model-value="$emit('update:manual-input', $event)"
            />
            <el-button type="primary" :disabled="!isManualValid" @click="$emit('manual-submit')">
              直接使用
            </el-button>
          </div>
          <div class="quick-tip">支持 (E/I + S/N + T/F + J/P) 四字母组合</div>
        </div>

        <div class="notice-content">
          <p>1、参加测试的人员请务必诚实、独立地回答问题，只有如此，才能得到有效的结果。</p>
          <p>2、《性格分析报告》展示的是你的性格倾向，而不是你的知识、技能、经验。</p>
          <p>
            3、MBTI 提供的性格类型描述仅供测试者确定自己的性格类型之用，性格类型没有好坏，只有不同。每一种性格特征都有其价值和优点，也有缺点和需要注意的地方。清楚地了解自己的性格优劣势，有利于更好地发挥自己的特长，而尽可能的在为人处事中避免自己性格中的劣势，更好地和他人相处，更好地作重要的决策。
          </p>
          <p>
            4、本测试分为四部分，共 93 题；需时约 18 分钟。所有题目没有对错之分，请根据自己的实际情况选择。选择 A 或者 B。
          </p>
          <div class="notice-highlight">
            只要你是认真、真实地填写了测试问卷，那么通常情况下你都能得到一个确实和你的性格相匹配的类型。希望你能从中或多或少地获得一些有益的信息。
          </div>
        </div>
        <div class="notice-footer">
          <el-button type="primary" size="large" class="start-btn" @click="$emit('start')">
            我已了解，开始测评
          </el-button>
        </div>
      </div>
    </div>

    <div v-else class="mbti-quiz-container">
      <!-- 顶部进度 -->
      <div class="quiz-progress-wrapper mb-10">
        <div class="flex justify-between items-end mb-3">
          <div class="progress-info">
            <span class="current-num">{{ currentIndex + 1 }}</span>
            <span class="total-num"> / {{ questions.length }}</span>
          </div>
          <div class="percent-tag">
            已完成 {{ answeredPercentage }}%
          </div>
        </div>
        <el-progress
          :percentage="answeredPercentage"
          :show-text="false"
          :stroke-width="6"
          color="#02492a"
        />
      </div>

      <!-- 题目内容 -->
      <EntryMbtiQuestion
        v-if="currentQuestion"
        :question="currentQuestion"
        :selected-option="answers[currentQuestion.id]"
        @select="$emit('select-option', $event)"
      />

      <!-- 底部导航 -->
      <div class="quiz-actions">
        <el-button
          link
          :disabled="currentIndex === 0"
          @click="$emit('prev')"
          class="nav-btn"
        >
          <el-icon class="mr-1"><ArrowLeft /></el-icon>
          上一题
        </el-button>

        <div class="quiz-actions-right">
          <el-button
            v-if="currentIndex === questions.length - 1"
            type="primary"
            @click="$emit('finish')"
            class="submit-quiz-btn"
            :disabled="!isAllAnswered"
          >
            完成测评并获取报告
          </el-button>
          <el-button
            v-else
            type="primary"
            @click="$emit('next')"
            class="next-quiz-btn"
            :disabled="!currentQuestion || !answers[currentQuestion.id]"
          >
            下一题
            <el-icon class="ml-1"><ArrowRight /></el-icon>
          </el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, ArrowRight, Loading, InfoFilled } from '@element-plus/icons-vue'
import EntryMbtiQuestion from './EntryMbtiQuestion.vue'

defineOptions({
  name: 'EntryMbtiDialog'
})

interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

interface Props {
  visible: boolean
  started: boolean
  loading: boolean
  manualInput: string
  isManualValid: boolean
  questions: MbtiQuestion[]
  currentIndex: number
  answers: Record<number, string>
}

interface Emits {
  (e: 'update:visible', value: boolean): void
  (e: 'start'): void
  (e: 'manual-submit'): void
  (e: 'update:manual-input', value: string): void
  (e: 'select-option', optCode: string): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'finish'): void
}

const props = defineProps<Props>()
defineEmits<Emits>()

const currentQuestion = computed(() => props.questions[props.currentIndex])

const isAllAnswered = computed(() => {
  if (props.questions.length === 0) return false
  return props.questions.every(q => props.answers[q.id] !== undefined && props.answers[q.id] !== '')
})

const answeredPercentage = computed(() => {
  if (props.questions.length === 0) return 0
  return Math.round((Object.keys(props.answers).length / props.questions.length) * 100)
})
</script>

<style scoped>
::v-deep(.mbti-dialog-custom) {
  border-radius: 16px;
  overflow: hidden;
}

::v-deep(.mbti-dialog-custom .el-dialog__header) {
  margin-right: 0;
  padding: 24px 32px;
  background: var(--clay-bg);
  border-bottom: 1px solid var(--clay-border-subtle);
}

.mbti-dialog-header .title {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: var(--clay-text);
}

.mbti-dialog-header .subtitle {
  display: block;
  font-size: 13px;
  color: var(--clay-text-subtle);
  margin-top: 4px;
}

.mbti-quiz-container {
  padding: 16px 12px 10px;
}

.quiz-progress-wrapper .current-num {
  line-height: 1;
  font-size: 24px;
  font-weight: 700;
  color: var(--clay-ube-800);
}

.quiz-progress-wrapper .total-num {
  color: var(--clay-text-subtle);
}

.percent-tag {
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
}

.quiz-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--clay-border-subtle);
}

.quiz-actions-right {
  display: flex;
  gap: 16px;
}

.nav-btn {
  color: var(--clay-text-subtle);
  font-size: 15px;
}

.nav-btn:hover:not(:disabled) {
  color: var(--clay-ube-800);
}

.submit-quiz-btn,
.next-quiz-btn {
  height: 44px;
  padding: 0 28px;
  border-radius: 999px;
  font-weight: 500;
  background: #000000;
  border-color: #000000;
}

.submit-quiz-btn:hover,
.next-quiz-btn:hover {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
}

.mbti-notice-container {
  padding: 10px;
}

.notice-card {
  padding: 24px 24px 20px;
  border-radius: 20px;
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.notice-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--clay-text);
}

.notice-icon {
  font-size: 20px;
  color: var(--clay-ube-800);
}

.mbti-quick-input {
  margin-bottom: 16px;
  padding: 14px;
  border-radius: 12px;
  border: 1px dashed var(--clay-border);
  background: var(--clay-surface-variant);
}

.quick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--clay-text);
  margin-bottom: 8px;
}

.quick-form {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.mbti-input {
  width: 160px;
}

.quick-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--clay-text-subtle);
}

.notice-content {
  font-size: 13px;
  color: var(--clay-text);
  line-height: 1.7;
}

.notice-highlight {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed var(--clay-border);
  background: var(--clay-surface-variant);
  color: var(--clay-ube-800);
  font-style: italic;
}

.notice-footer {
  margin-top: 24px;
  text-align: center;
}

.start-btn {
  height: 52px;
  padding: 0 48px;
  font-size: 16px;
  font-weight: 600;
  border-radius: 26px;
  background: #000000;
  border-color: #000000;
  transition: all 0.3s;
}

.start-btn:hover {
  background: var(--clay-ube-800);
  border-color: var(--clay-ube-800);
  box-shadow: var(--clay-shadow-hard);
}

.loading-container {
  min-height: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.loading-text {
  font-size: 14px;
  color: var(--clay-text-subtle);
}
</style>
