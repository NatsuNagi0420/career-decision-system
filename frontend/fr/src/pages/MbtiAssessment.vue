<!--
  页面：MBTI 性格测评（/assessment/mbti）
  职责：提供完整的 MBTI 测评问卷，支持手动输入已知类型或完成测评
  使用 FormPageLayout 布局模板
-->
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import FormPageLayout from '@/components/layouts/FormPageLayout.vue'
import request from '@/utils/request'

defineOptions({
  name: 'MbtiAssessmentPage'
})

const router = useRouter()

// 测评状态
const mbtiStarted = ref(false) // 是否开始测评
const mbtiManualInput = ref('') // 手动输入的 MBTI 类型
const mbtiResult = ref<string | null>(null) // 测评结果
const isSubmitting = ref(false)

// 题目数据
const questions = ref<Array<{ id: number; text: string; options: string[] }>>([])
const answers = ref<Record<number, number>>({})
const currentQuestionIndex = ref(0)

// 当前题目
const currentQuestion = computed(() => questions.value[currentQuestionIndex.value])

// 进度
const progress = computed(() => {
  if (questions.value.length === 0) return 0
  return Math.round((Object.keys(answers.value).length / questions.value.length) * 100)
})

// 是否可以提交
const canSubmit = computed(() => {
  return Object.keys(answers.value).length === questions.value.length
})

// 加载题目
const loadQuestions = async () => {
  try {
    const data = await request<Array<{ id: number; text: string; options: string[] }>>({
      url: '/mbti/questions',
      method: 'GET'
    })
    questions.value = data
  } catch (error) {
    ElMessage.error('加载题目失败，请刷新重试')
  }
}

// 开始测评
const startAssessment = async () => {
  await loadQuestions()
  mbtiStarted.value = true
}

// 手动输入 MBTI 类型
const submitManualInput = () => {
  const normalized = mbtiManualInput.value.trim().toUpperCase()
  const validPattern = /^[IE][NS][TF][JP]$/

  if (!validPattern.test(normalized)) {
    ElMessage.warning('请输入正确的 MBTI 类型，例如 INFP')
    return
  }

  mbtiResult.value = normalized
  ElMessage.success(`已记录 MBTI 类型：${normalized}`)

  // 跳转到能力画像页面
  setTimeout(() => {
    router.push('/capability-profile')
  }, 1500)
}

// 选择答案
const selectAnswer = (optionIndex: number) => {
  if (!currentQuestion.value) return
  answers.value[currentQuestion.value.id] = optionIndex
}

// 上一题
const prevQuestion = () => {
  if (currentQuestionIndex.value > 0) {
    currentQuestionIndex.value--
  }
}

// 下一题
const nextQuestion = () => {
  if (currentQuestionIndex.value < questions.value.length - 1) {
    currentQuestionIndex.value++
  }
}

// 提交测评
const submitAssessment = async () => {
  if (!canSubmit.value) {
    ElMessage.warning('请完成所有题目后再提交')
    return
  }

  try {
    await ElMessageBox.confirm(
      '确定完成所有 MBTI 测评题吗？完成后将提交答案进行深度分析。',
      '确认提交',
      {
        confirmButtonText: '确定提交',
        cancelButtonText: '再检查一下',
        type: 'info'
      }
    )
  } catch {
    return
  }

  isSubmitting.value = true
  try {
    const mbtiType = await request<string>({
      url: '/mbti/submit',
      method: 'POST',
      data: {
        answers: answers.value
      }
    })

    mbtiResult.value = mbtiType
    ElMessage.success(`MBTI 测评完成！您的类型是: ${mbtiType}`)

    // 跳转到能力画像页面
    setTimeout(() => {
      router.push('/capability-profile')
    }, 2000)
  } catch (error) {
    ElMessage.error('提交失败，请稍后重试')
  } finally {
    isSubmitting.value = false
  }
}

// 取消测评
const cancelAssessment = () => {
  router.push('/')
}
</script>

<template>
  <FormPageLayout
    title="MBTI 性格测评"
    subtitle="了解你的性格类型，发现职业优势"
    :show-progress="mbtiStarted"
    :current-step="currentQuestionIndex + 1"
    :total-steps="questions.length"
    :loading="isSubmitting"
    @submit="submitAssessment"
    @cancel="cancelAssessment"
    @prev="prevQuestion"
    @next="nextQuestion"
  >
    <!-- 测评须知页面 -->
    <div v-if="!mbtiStarted" class="mbti-notice">
      <div class="notice-card">
        <div class="notice-icon">🧠</div>
        <h3 class="notice-title">MBTI 测试前须知</h3>

        <!-- 快速输入已知类型 -->
        <div class="quick-input-section">
          <div class="quick-title">已有 MBTI 类型？</div>
          <div class="quick-input-row">
            <el-input
              v-model="mbtiManualInput"
              placeholder="例如：INFP、ENTJ"
              size="large"
              maxlength="4"
              class="mbti-input"
            />
            <el-button type="primary" size="large" @click="submitManualInput">
              直接填写
            </el-button>
          </div>
        </div>

        <el-divider>或完成测评</el-divider>

        <!-- 测评说明 -->
        <div class="notice-content">
          <p><strong>1、MBTI 是什么？</strong></p>
          <p>MBTI（Myers-Briggs Type Indicator）是一种性格分类工具，将人的性格分为16种类型。通过了解自己的性格类型，可以更好地认识自己的优势和劣势。</p>

          <p><strong>2、如何作答？</strong></p>
          <p>请根据你的真实想法和习惯作答，不要过度思考。选择最接近你日常行为的选项，而不是你认为"应该"的答案。</p>

          <p><strong>3、测评结果的意义</strong></p>
          <p>MBTI 提供的性格类型描述仅供参考。性格类型没有好坏，只有不同。每一种性格特征都有其价值和优点，也有缺点和需要注意的地方。</p>
        </div>

        <el-button type="primary" size="large" class="start-btn" @click="startAssessment">
          开始测评（约 10 分钟）
        </el-button>
      </div>
    </div>

    <!-- 测评问卷 -->
    <div v-else class="mbti-quiz">
      <div class="quiz-progress">
        <div class="progress-text">
          第 {{ currentQuestionIndex + 1 }} / {{ questions.length }} 题
        </div>
        <el-progress :percentage="progress" :stroke-width="8" />
      </div>

      <div v-if="currentQuestion" class="question-card">
        <div class="question-number">Q{{ currentQuestionIndex + 1 }}</div>
        <div class="question-text">{{ currentQuestion.text }}</div>

        <div class="options-list">
          <div
            v-for="(option, index) in currentQuestion.options"
            :key="index"
            class="option-item"
            :class="{ selected: answers[currentQuestion.id] === index }"
            @click="selectAnswer(index)"
          >
            <div class="option-radio">
              <span v-if="answers[currentQuestion.id] === index">✓</span>
            </div>
            <div class="option-text">{{ option }}</div>
          </div>
        </div>
      </div>

      <div class="quiz-navigation">
        <el-button
          :disabled="currentQuestionIndex === 0"
          @click="prevQuestion"
        >
          上一题
        </el-button>
        <el-button
          v-if="currentQuestionIndex < questions.length - 1"
          type="primary"
          :disabled="answers[currentQuestion?.id] === undefined"
          @click="nextQuestion"
        >
          下一题
        </el-button>
        <el-button
          v-else
          type="primary"
          :disabled="!canSubmit"
          @click="submitAssessment"
        >
          完成测评
        </el-button>
      </div>
    </div>
  </FormPageLayout>
</template>

<style scoped>
/* 测评须知 */
.mbti-notice {
  max-width: 700px;
  margin: 0 auto;
}

.notice-card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 40px;
  box-shadow: var(--clay-shadow);
  text-align: center;
}

.notice-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.notice-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 24px 0;
}

.quick-input-section {
  background: var(--clay-surface-lemon);
  border: 1px solid var(--clay-lemon-400);
  border-radius: var(--clay-radius-card);
  padding: 20px;
  margin-bottom: 24px;
}

.quick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--clay-text);
  margin-bottom: 12px;
}

.quick-input-row {
  display: flex;
  gap: 12px;
}

.mbti-input {
  flex: 1;
  text-transform: uppercase;
}

.notice-content {
  text-align: left;
  margin: 24px 0;
}

.notice-content p {
  margin: 12px 0;
  line-height: 1.6;
  color: var(--clay-text);
}

.notice-content strong {
  color: var(--clay-text);
  font-weight: 600;
}

.start-btn {
  width: 100%;
  margin-top: 24px;
}

/* 测评问卷 */
.mbti-quiz {
  max-width: 800px;
  margin: 0 auto;
}

.quiz-progress {
  margin-bottom: 32px;
}

.progress-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
  margin-bottom: 12px;
  text-align: center;
}

.question-card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
  box-shadow: var(--clay-shadow);
  margin-bottom: 24px;
}

.question-number {
  display: inline-block;
  padding: 6px 12px;
  border-radius: var(--clay-radius-pill);
  background: var(--clay-surface-variant);
  color: var(--clay-text);
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}

.question-text {
  font-size: 18px;
  font-weight: 500;
  color: var(--clay-text);
  line-height: 1.6;
  margin-bottom: 24px;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 2px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-item:hover {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  transform: translateX(4px);
}

.option-item.selected {
  border-color: var(--clay-ube-800);
  background: linear-gradient(135deg, var(--clay-surface) 0%, rgba(193, 176, 255, 0.1) 100%);
}

.option-radio {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid var(--clay-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.option-item.selected .option-radio {
  border-color: var(--clay-ube-800);
  background: var(--clay-ube-800);
  color: #ffffff;
}

.option-text {
  flex: 1;
  font-size: 15px;
  color: var(--clay-text);
  line-height: 1.5;
}

.quiz-navigation {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

/* 响应式 */
@media (max-width: 768px) {
  .notice-card {
    padding: 24px 20px;
  }

  .question-card {
    padding: 24px 20px;
  }

  .quick-input-row {
    flex-direction: column;
  }

  .quiz-navigation {
    flex-direction: column;
  }

  .quiz-navigation .el-button {
    width: 100%;
  }
}
</style>
