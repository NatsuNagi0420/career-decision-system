<script setup lang="ts">
import { computed, ref } from 'vue'

type AnswerValue = string | string[]
export type DeepQuestionnaireAnswers = Record<string, AnswerValue>

const props = defineProps<{ modelValue: DeepQuestionnaireAnswers }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: DeepQuestionnaireAnswers): void }>()

const setAnswer = (key: string, value: AnswerValue) => {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}

const getAnswer = (key: string) => props.modelValue[key]

type Option = { label: string; value: string }

type BaseQuestion = {
  key: string
  text: string
  helper?: string
}

type SingleQuestion = BaseQuestion & {
  kind: 'single'
  options: Option[]
}

type MultiQuestion = BaseQuestion & {
  kind: 'multi'
  options: Option[]
}

type ScaleQuestion = BaseQuestion & {
  kind: 'scale5'
  leftLabel: string
  rightLabel: string
}

type TextQuestion = BaseQuestion & {
  kind: 'text'
  placeholder?: string
}

type Question = SingleQuestion | MultiQuestion | ScaleQuestion | TextQuestion

const onSingleChange = (key: string, v: string) => {
  setAnswer(key, String(v ?? ''))
}

const onMultiChange = (key: string, v: string[]) => {
  setAnswer(key, v)
}

const onTextChange = (key: string, v: string) => {
  setAnswer(key, String(v ?? ''))
}

const isAnswered = (q: Question) => {
  const v = getAnswer(q.key)
  if (q.kind === 'multi') {
    return Array.isArray(v) && (v as string[]).filter(Boolean).length > 0
  }
  if (q.kind === 'text') {
    return typeof v === 'string' && v.trim().length > 0
  }
  return typeof v === 'string' && v.trim().length > 0
}

const sections = computed(() => {
  const part1: Question[] = [
    {
      key: 'basic_education',
      kind: 'single',
      text: '1. 学历层次（单选）',
      options: [
        { label: 'A. 大专及以下', value: 'A' },
        { label: 'B. 本科', value: 'B' },
        { label: 'C. 硕士', value: 'C' },
        { label: 'D. 博士及以上', value: 'D' }
      ]
    },
    {
      key: 'basic_major_type',
      kind: 'single',
      text: '2. 专业类别（单选）',
      options: [
        { label: 'A. 理工类', value: 'A' },
        { label: 'B. 经管类', value: 'B' },
        { label: 'C. 人文社科类', value: 'C' },
        { label: 'D. 艺术设计类', value: 'D' },
        { label: 'E. 医学类', value: 'E' },
        { label: 'F. 农林类', value: 'F' },
        { label: 'G. 其他', value: 'G' }
      ]
    },
    {
      key: 'basic_experience',
      kind: 'single',
      text: '3. 是否有实习/工作经验（单选）',
      options: [
        { label: 'A. 无', value: 'A' },
        { label: 'B. 有，1年以内', value: 'B' },
        { label: 'C. 有，1-3年', value: 'C' },
        { label: 'D. 有，3年以上', value: 'D' }
      ]
    },
    {
      key: 'basic_city_type',
      kind: 'multi',
      text: '4. 意向工作城市类型（可多选）',
      options: [
        { label: 'A. 一线城市（北上广深）', value: 'A' },
        { label: 'B. 新一线城市（杭州、成都、南京等）', value: 'B' },
        { label: 'C. 二线及以下城市', value: 'C' },
        { label: 'D. 不限，可接受异地调动', value: 'D' }
      ]
    },
    {
      key: 'basic_salary',
      kind: 'single',
      text: '5. 期望月薪范围（税前）（单选）',
      options: [
        { label: 'A. 4000元以下', value: 'A' },
        { label: 'B. 4000-8000元', value: 'B' },
        { label: 'C. 8000-15000元', value: 'C' },
        { label: 'D. 15000-25000元', value: 'D' },
        { label: 'E. 25000元以上', value: 'E' }
      ]
    }
  ]

  const part2: Question[] = [
    {
      key: 'ability_1',
      kind: 'scale5',
      text: '1. 我具备扎实的专业知识，并能应用于实际问题解决。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_2',
      kind: 'scale5',
      text: '2. 我喜欢钻研难题，能持续学习前沿知识。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_3',
      kind: 'scale5',
      text: '3. 我注重细节，能严格按照流程标准完成工作。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_4',
      kind: 'scale5',
      text: '4. 我擅长动手操作（如仪器、设备、手工等）。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_5',
      kind: 'scale5',
      text: '5. 我能快速定位问题根源，并提出解决方案。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_6',
      kind: 'scale5',
      text: '6. 面对突发状况，我能冷静处理。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_7',
      kind: 'scale5',
      text: '7. 我能清晰表达观点，善于沟通协调。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_8',
      kind: 'scale5',
      text: '8. 我乐于帮助他人解决问题。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_9',
      kind: 'scale5',
      text: '9. 我愿意承担团队责任，推动目标达成。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_10',
      kind: 'scale5',
      text: '10. 我喜欢从全局视角思考，对决策有敏锐度。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_11',
      kind: 'scale5',
      text: '11. 我善于提出新颖想法，有创意。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    },
    {
      key: 'ability_12',
      kind: 'scale5',
      text: '12. 我对美学或设计有敏感度。',
      leftLabel: '1 = 非常不符合',
      rightLabel: '5 = 非常符合'
    }
  ]

  const part3: Question[] = [
    {
      key: 'pref_1',
      kind: 'scale5',
      text: '1. 研发与创新',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    },
    {
      key: 'pref_2',
      kind: 'scale5',
      text: '2. 生产与制造',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    },
    {
      key: 'pref_3',
      kind: 'scale5',
      text: '3. 技术支持与服务',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    },
    {
      key: 'pref_4',
      kind: 'scale5',
      text: '4. 市场与销售',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    },
    {
      key: 'pref_5',
      kind: 'scale5',
      text: '5. 行政与管理',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    },
    {
      key: 'pref_6',
      kind: 'scale5',
      text: '6. 教育与培训',
      leftLabel: '1 = 非常不感兴趣',
      rightLabel: '5 = 非常感兴趣'
    }
  ]

  const part4: Question[] = [
    {
      key: 'value_1',
      kind: 'scale5',
      text: '1. 经济回报（薪资福利好）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    },
    {
      key: 'value_2',
      kind: 'scale5',
      text: '2. 工作稳定（有保障、不易失业）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    },
    {
      key: 'value_3',
      kind: 'scale5',
      text: '3. 成长发展（能学习、有晋升空间）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    },
    {
      key: 'value_4',
      kind: 'scale5',
      text: '4. 工作生活平衡（压力适中、有个人时间）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    },
    {
      key: 'value_5',
      kind: 'scale5',
      text: '5. 社会贡献（工作有价值、能帮助他人）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    },
    {
      key: 'value_6',
      kind: 'scale5',
      text: '6. 创造与自主（有自由度、能发挥创意）',
      leftLabel: '1 = 完全不重要',
      rightLabel: '5 = 非常重要'
    }
  ]

  const part5: Question[] = [
    {
      key: 'open_ideal_work',
      kind: 'text',
      text: '1. 请用一句话描述您理想的工作状态。',
      placeholder: '例如：有成长、有成就感、节奏适中、和一群靠谱的同事一起做事。'
    },
    {
      key: 'open_target_job',
      kind: 'text',
      text: '2. 您是否有具体的目标岗位？如有，请写出。',
      placeholder: '例如：前端开发工程师 / 产品经理 / 数据分析师 / 教育培训讲师等。'
    }
  ]

  return [
    { name: '1', title: '第一部分：基础信息（选项制）', questions: part1 },
    { name: '2', title: '第二部分：能力自评（程度制）', questions: part2 },
    { name: '3', title: '第三部分：职业偏好（选项制）', questions: part3 },
    { name: '4', title: '第四部分：职业价值观（程度制）', questions: part4 },
    { name: '5', title: '第五部分：开放题', questions: part5 }
  ]
})

const totalCount = computed(() => {
  const total = sections.value.reduce((sum, s) => sum + s.questions.length, 0)
  return total
})

const answeredCount = computed(() => {
  let n = 0
  for (const s of sections.value) {
    for (const q of s.questions) {
      if (isAnswered(q)) n++
    }
  }
  return n
})

const progress = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((answeredCount.value / totalCount.value) * 100)
})

const currentStep = ref(0)
const currentQuestionIndex = ref(0)

const currentSection = computed(() => sections.value[currentStep.value])
const currentQuestion = computed(() => currentSection.value?.questions[currentQuestionIndex.value])
const questionCountInCurrentSection = computed(() => currentSection.value?.questions.length ?? 0)

const sectionAnsweredCount = (sectionIndex: number) => {
  const section = sections.value[sectionIndex]
  if (!section) return 0
  return section.questions.filter(q => isAnswered(q)).length
}

const sectionProgress = computed(() => {
  const section = currentSection.value
  if (!section) return 0
  if (section.questions.length === 0) return 0
  return Math.round((sectionAnsweredCount(currentStep.value) / section.questions.length) * 100)
})

const findFirstUnansweredIndex = (sectionIndex: number) => {
  const section = sections.value[sectionIndex]
  if (!section || section.questions.length === 0) return 0
  const idx = section.questions.findIndex(q => !isAnswered(q))
  return idx >= 0 ? idx : 0
}

const syncQuestionIndexForStep = (step: number) => {
  currentQuestionIndex.value = findFirstUnansweredIndex(step)
}

const canGoNext = computed(() => currentStep.value < sections.value.length - 1)
const canGoPrevQuestion = computed(() => currentQuestionIndex.value > 0)
const canGoNextQuestion = computed(() => currentQuestionIndex.value < questionCountInCurrentSection.value - 1)

const goNext = () => {
  if (!canGoNext.value) return
  currentStep.value += 1
  syncQuestionIndexForStep(currentStep.value)
}

const jumpToSection = (idx: number) => {
  if (idx < 0 || idx >= sections.value.length) return
  currentStep.value = idx
  syncQuestionIndexForStep(idx)
}

const goPrevQuestion = () => {
  if (!canGoPrevQuestion.value) return
  currentQuestionIndex.value -= 1
}

const goNextQuestion = () => {
  if (!canGoNextQuestion.value) return
  currentQuestionIndex.value += 1
}

const handlePrimaryAction = () => {
  if (canGoNextQuestion.value) {
    goNextQuestion()
    return
  }
  if (canGoNext.value) {
    goNext()
  }
}

const primaryActionText = computed(() => {
  if (canGoNextQuestion.value) return '下一题'
  if (canGoNext.value) return '下一部分'
  return '已完成当前问卷'
})

const onCurrentTextChange = (v: string) => {
  const q = currentQuestion.value
  if (!q || q.kind !== 'text') return
  onTextChange(q.key, v)
}

const onCurrentMultiChange = (v: string[]) => {
  const q = currentQuestion.value
  if (!q || q.kind !== 'multi') return
  onMultiChange(q.key, v)
}

const onCurrentSingleChange = (v: string) => {
  const q = currentQuestion.value
  if (!q || (q.kind !== 'single' && q.kind !== 'scale5')) return
  onSingleChange(q.key, v)
}
</script>

<template>
  <div class="questionnaire-wrap">
    <div class="header-row">
      <div class="text-sub text-sm">已完成 {{ answeredCount }}/{{ totalCount }}（{{ progress }}%）</div>
      <el-progress :percentage="progress" :stroke-width="8" color="#0891b2" style="width: 220px" />
    </div>

    <div class="stepper-nav">
      <button
        v-for="(s, idx) in sections"
        :key="s.name"
        type="button"
        class="step-chip"
        :class="{ active: idx === currentStep }"
        @click="jumpToSection(idx)"
      >
        <span class="chip-index">{{ idx + 1 }}</span>
        <span class="chip-title">{{ s.title }}</span>
        <span class="chip-count">{{ sectionAnsweredCount(idx) }}/{{ s.questions.length }}</span>
      </button>
    </div>

    <div v-if="currentSection" class="section-panel">
      <div class="section-head">
        <div class="section-title">{{ currentSection.title }}</div>
        <div class="text-xs text-mute">本部分完成 {{ sectionAnsweredCount(currentStep) }}/{{ currentSection.questions.length }}</div>
      </div>
      <el-progress :percentage="sectionProgress" :stroke-width="6" color="#02492a" />

      <div class="question-meta">
        <span class="text-xs text-mute">第 {{ currentQuestionIndex + 1 }} / {{ questionCountInCurrentSection }} 题</span>
      </div>

      <div v-if="currentQuestion" class="q-list">
        <div class="q-item">
          <div class="q-title">{{ currentQuestionIndex + 1 }}. {{ currentQuestion.text }}</div>

          <div v-if="currentQuestion.kind === 'text'" class="q-body">
            <el-input
              type="textarea"
              :rows="3"
              :model-value="(getAnswer(currentQuestion.key) as string) || ''"
              :placeholder="currentQuestion.placeholder || '请填写您的想法（可选）'"
              @update:model-value="onCurrentTextChange"
            />
          </div>

          <div v-else-if="currentQuestion.kind === 'multi'" class="q-body">
            <el-checkbox-group
              :model-value="(getAnswer(currentQuestion.key) as string[]) || []"
              class="checkbox-group"
              @update:model-value="onCurrentMultiChange"
            >
              <el-checkbox v-for="opt in currentQuestion.options" :key="opt.value" :label="opt.value">{{ opt.label }}</el-checkbox>
            </el-checkbox-group>
          </div>

          <div v-else-if="currentQuestion.kind === 'scale5'" class="q-body">
            <el-radio-group
              :model-value="(getAnswer(currentQuestion.key) as string) || ''"
              class="scale-group"
              @update:model-value="onCurrentSingleChange"
            >
              <el-radio v-for="n in 5" :key="n" :label="String(n)" class="scale-radio">{{ n }}</el-radio>
            </el-radio-group>
            <div class="scale-labels">
              <span>{{ currentQuestion.leftLabel }}</span>
              <span>{{ currentQuestion.rightLabel }}</span>
            </div>
          </div>

          <div v-else class="q-body">
            <el-radio-group
              :model-value="(getAnswer(currentQuestion.key) as string) || ''"
              class="radio-group"
              @update:model-value="onCurrentSingleChange"
            >
              <el-radio v-for="opt in currentQuestion.options" :key="opt.value" :label="opt.value">{{ opt.label }}</el-radio>
            </el-radio-group>
          </div>
        </div>
      </div>

      <div class="question-actions">
        <el-button :disabled="!canGoPrevQuestion" @click="goPrevQuestion">上一题</el-button>
        <el-button type="primary" @click="handlePrimaryAction">{{ primaryActionText }}</el-button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.questionnaire-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.stepper-nav {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.step-chip {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 10px;
  padding: 10px 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s ease;
}

.step-chip:hover {
  border-color: #16a34a;
  transform: translateY(-1px);
}

.step-chip.active {
  border-color: #02492a;
  background: rgba(2, 73, 42, 0.06);
  box-shadow: 0 2px 8px rgba(2, 73, 42, 0.12);
}

.chip-index {
  font-size: 12px;
  color: var(--color-text-mute);
}

.chip-title {
  font-size: 13px;
  color: var(--color-text);
  font-weight: 600;
  line-height: 1.35;
}

.chip-count {
  font-size: 12px;
  color: var(--color-text-sub);
}

.section-panel {
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  padding: 14px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.question-meta {
  margin-top: 10px;
}

.q-list {
  padding: 10px 2px 2px;
}

.q-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  background: var(--color-surface);
  padding: 16px;
}

.q-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 10px;
  line-height: 1.5;
}

.q-body {
  color: var(--color-text-sub);
}

.radio-group {
  display: grid;
  gap: 8px;
}

.checkbox-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scale-group {
  display: flex;
  gap: 8px;
}

.scale-radio {
  padding: 2px 8px;
}

.scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--color-text-mute);
  margin-top: 4px;
}

.question-actions {
  margin-top: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}


@media (max-width: 960px) {
  .header-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .stepper-nav {
    grid-template-columns: 1fr;
  }

  .section-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .scale-group {
    flex-wrap: wrap;
  }
}
</style>
