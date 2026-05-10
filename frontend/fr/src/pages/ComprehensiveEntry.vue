<!--
  页面：综合信息录入页（/entry/comprehensive）。
  职责：支持简历上传与详细表单填写，收集更全面的教育、经历、技能与目标岗位信息，
        以提升后续能力画像、岗位匹配与路径规划的准确度。
-->
<template>
  <div class="comprehensive-entry-page clay-page">
    <Navbar />
    <div class="page-container">
      <el-row :gutter="24">
        <el-col :xs="24" :md="16">
          <div class="left-section">
            <div class="card section mb-6">
              <div class="section-head">
                <div>
                  <div class="section-title">综合信息录入</div>
                  <div class="text-sub text-sm">
                    填写越完整，后续能力画像、岗位匹配与计划生成越准确
                  </div>
                </div>
              </div>
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">简历解析</div>
                <div class="text-sub text-sm">支持 PDF/Word，上传后自动填充部分字段</div>
              </div>
              <el-upload
                class="resume-uploader"
                drag
                action="#"
                :auto-upload="false"
                :on-change="handleFileChange"
              >
                <el-icon class="el-icon--upload"><upload-filled /></el-icon>
                <div class="el-upload__text">
                  将文件拖到此处，或 <em>点击上传</em>
                </div>
                <template #tip>
                  <div class="el-upload__tip">
                    上传简历可自动填充下方基础信息、技能及经历
                  </div>
                </template>
              </el-upload>
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">基础资料</div>
                <div class="text-sub text-sm">用于个性化画像、报告与后续提醒</div>
              </div>
              <el-form :model="form" label-position="top">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="姓名" required>
                      <el-input v-model="form.basic.name" placeholder="请输入真实姓名" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="联系邮箱" required>
                      <el-input v-model="form.basic.email" placeholder="用于接收报告与机会提醒" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="学校">
                      <el-input v-model="form.basic.school" placeholder="例如：XX大学" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="专业">
                      <el-input v-model="form.basic.major" placeholder="例如：计算机科学与技术" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="年级">
                      <el-select v-model="form.basic.grade" placeholder="请选择" class="w-full">
                        <el-option label="大一" value="大一" />
                        <el-option label="大二" value="大二" />
                        <el-option label="大三" value="大三" />
                        <el-option label="大四" value="大四" />
                        <el-option label="研一" value="研一" />
                        <el-option label="研二" value="研二" />
                        <el-option label="研三" value="研三" />
                        <el-option label="已毕业" value="已毕业" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="常驻城市">
                      <el-input v-model="form.basic.city" placeholder="例如：深圳" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">求职目标</div>
                <div class="text-sub text-sm">告诉我你想去哪、做什么、想要什么</div>
              </div>
              <el-form :model="form" label-position="top">
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-form-item label="目标方向/岗位" required>
                      <el-input v-model="form.target.role" placeholder="例如：Java开发工程师 / 产品经理" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="求职类型">
                      <el-select v-model="form.target.jobType" placeholder="请选择" class="w-full">
                        <el-option label="实习" value="实习" />
                        <el-option label="校招/全职" value="全职" />
                        <el-option label="灵活" value="灵活" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="意向城市（可多选）">
                      <el-select
                        v-model="form.target.cities"
                        multiple
                        filterable
                        allow-create
                        default-first-option
                        placeholder="例如：深圳、广州"
                        class="w-full"
                      >
                        <el-option v-for="c in presetCities" :key="c" :label="c" :value="c" />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="期望薪资（可选）">
                      <el-input v-model="form.target.salary" placeholder="例如：15k-20k / 8k / 面议" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="可到岗时间（可选）">
                      <el-input v-model="form.target.availableAt" placeholder="例如：两周内 / 2026-07" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="不想做的方向（可选）">
                      <el-input
                        v-model="form.target.avoid"
                        placeholder="例如：销售 / 纯外包 / 频繁出差"
                      />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">技能与证明材料</div>
                <div class="text-sub text-sm">技能标签 + 项目/实习描述越具体，模型分析越准</div>
              </div>

              <div class="sub-block">
                <div class="sub-title">核心技能标签</div>
                <div class="tag-group">
                  <el-tag
                    v-for="tag in form.skills"
                    :key="tag"
                    closable
                    @close="handleCloseTag(tag)"
                    class="mr-2 mb-2"
                  >
                    {{ tag }}
                  </el-tag>
                  <el-input
                    v-if="inputVisible"
                    ref="InputRef"
                    v-model="inputValue"
                    class="w-20 inline-block"
                    size="small"
                    @keyup.enter="handleInputConfirm"
                    @blur="handleInputConfirm"
                  />
                  <el-button v-else class="button-new-tag" size="small" @click="showInput">
                    + 添加技能
                  </el-button>
                </div>
              </div>

              <div class="sub-block">
                <div class="sub-title">作品/链接（可选）</div>
                <el-row :gutter="16">
                  <el-col :span="12">
                    <el-input v-model="form.links.github" placeholder="GitHub 主页链接" />
                  </el-col>
                  <el-col :span="12">
                    <el-input v-model="form.links.portfolio" placeholder="作品集/博客链接" />
                  </el-col>
                </el-row>
              </div>

              <div class="sub-block">
                <div class="sub-title">证书（可选）</div>
                <div v-for="(cert, index) in form.certificates" :key="index" class="dynamic-item mb-4">
                  <el-input v-model="form.certificates[index]" placeholder="例如：CET-6 / 软考 / AWS 认证">
                    <template #append>
                      <el-button @click="removeCert(index)"><el-icon><Delete /></el-icon></el-button>
                    </template>
                  </el-input>
                </div>
                <el-button type="primary" link @click="addCert">+ 添加证书</el-button>
              </div>

              <div class="sub-block">
                <div class="sub-title">实习/项目经历</div>
                <div v-for="(exp, index) in form.experiences" :key="index" class="exp-item mb-4">
                  <el-form label-position="top">
                    <el-form-item label="项目/公司名称">
                      <el-input v-model="exp.title" placeholder="例如：校内项目 / 某互联网公司实习" />
                    </el-form-item>
                    <el-form-item label="职责描述">
                      <el-input
                        v-model="exp.desc"
                        type="textarea"
                        rows="3"
                        placeholder="建议写清楚：做了什么、用到了什么、结果如何（数据/指标）"
                      />
                    </el-form-item>
                  </el-form>
                  <el-button type="danger" link @click="removeExp(index)">删除此项</el-button>
                </div>
                <el-button type="primary" link @click="addExp">+ 添加经历</el-button>
              </div>
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">深度测评问卷</div>
                <div class="text-sub text-sm">
                  包含基础信息、能力自评、职业偏好与价值观等模块，用于支持后续画像与推荐
                </div>
              </div>
              <DeepAssessmentQuestionnaire v-model="form.questionnaireAnswers" />
            </div>

            <div class="card section mb-6">
              <div class="section-head">
                <div class="section-title">职业价值观（3题）</div>
                <div class="text-sub text-sm">滑动条用于刻画你对目标的偏好权重</div>
              </div>
              <div v-for="(q, index) in valuesQuestions" :key="index" class="value-q mb-4">
                <div class="q-text">{{ index + 1 }}. {{ q.text }}</div>
                <el-slider v-model="form.values[index]" :step="1" :max="10" show-stops />
                <div class="slider-labels">
                  <span>极其不看重</span>
                  <span>极其看重</span>
                </div>
              </div>
            </div>
          </div>
        </el-col>

        <el-col :xs="24" :md="8">
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
                  <span class="text-mute text-xs">{{ mbtiProgress }}%</span>
                </div>
                <el-progress :percentage="mbtiProgress" color="#02492a" :stroke-width="8" />
              </div>

              <div class="overall">
                <div class="progress-row">
                  <span>综合</span>
                  <span class="text-mute text-xs">{{ overallCompletion }}%</span>
                </div>
                <el-progress :percentage="overallCompletion" color="#02492a" :stroke-width="10" />
              </div>
            </div>

            <div class="mbti-entry-card card-hover" @click="openMbti">
              <div class="mbti-icon">🧠</div>
              <div class="mbti-info">
                <h4>MBTI 测评</h4>
                <p v-if="form.mbtiResult">已填写：{{ form.mbtiResult }}</p>
                <p v-else>共 93 题，可做题或直接填写类型</p>
              </div>
              <el-icon><ArrowRight /></el-icon>
            </div>

            <div class="action-section mt-8">
              <el-button
                type="primary"
                class="w-full h-12 submit-main-btn"
                size="large"
                :loading="submitting"
                @click="submitAll"
              >
                提交综合分析
              </el-button>
              <p class="hint text-center mt-4 text-gray-400 text-xs">请确保所有核心模块已填写完整</p>
            </div>
          </div>
        </el-col>
      </el-row>

      <!-- MBTI 弹窗 (完整题库) -->
      <el-dialog
        v-model="mbtiVisible"
        width="800px"
        :close-on-click-modal="false"
        destroy-on-close
        class="mbti-dialog-custom"
      >
        <template #header>
          <div class="mbti-dialog-header">
            <span class="title">MBTI 职业性格测评</span>
            <span class="subtitle">共 93 题 · 深度挖掘您的职场潜能</span>
          </div>
        </template>

        <div v-if="loadingQuestions" class="loading-container py-20 text-center">
          <el-icon class="is-loading text-4xl mb-4">
            <Loading />
          </el-icon>
          <p class="loading-text">正在为您准备深度测评题库...</p>
        </div>

        <!-- 测试前须知页面 -->
        <div v-else-if="!mbtiStarted" class="mbti-notice-container">
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
                  v-model="mbtiManualInput"
                  maxlength="4"
                  placeholder="例如：INFP"
                  class="mbti-input"
                />
                <el-button type="primary" :disabled="!isMbtiManualValid" @click="applyManualMbti">
                  直接使用
                </el-button>
              </div>
              <div class="quick-tip">支持 \(E/I + S/N + T/F + J/P\) 四字母组合</div>
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
              <el-button type="primary" size="large" class="start-btn" @click="startMbti">
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
                <span class="current-num">{{ currentQIndex + 1 }}</span>
                <span class="total-num"> / {{ questions.length }}</span>
              </div>
              <div class="percent-tag">
                已完成 {{ Math.round((Object.keys(answers).length / questions.length) * 100) }}%
              </div>
            </div>
            <el-progress
              :percentage="Math.round((Object.keys(answers).length / questions.length) * 100)"
              :show-text="false"
              :stroke-width="6"
              color="#02492a"
            />
          </div>

          <!-- 题目内容 -->
          <div v-if="currentQuestion" class="question-container mb-12">
            <div class="q-meta mb-4">
              <span class="q-type-badge">{{ currentQuestion.qType }}</span>
              <div class="q-divider"></div>
            </div>

            <h2 class="q-content">
              {{ currentQuestion.content }}
            </h2>

            <div class="options-list">
              <div
                v-for="opt in currentQuestion.options"
                :key="opt.id"
                class="option-card"
                :class="{ 'is-active': answers[currentQuestion.id] === opt.optCode }"
                @click="selectOption(opt)"
              >
                <div class="opt-radio"></div>
                <span class="opt-text">{{ opt.optContent }}</span>
              </div>
            </div>
          </div>

          <!-- 底部导航 -->
          <div class="quiz-actions">
            <el-button
              link
              :disabled="currentQIndex === 0"
              @click="prevQuestion"
              class="nav-btn"
            >
              <el-icon class="mr-1"><ArrowLeft /></el-icon>
              上一题
            </el-button>

            <div class="quiz-actions-right">
              <el-button
                v-if="currentQIndex === questions.length - 1"
                type="primary"
                @click="finishMbti"
                class="submit-quiz-btn"
                :disabled="!isAllAnswered"
              >
                完成测评并获取报告
              </el-button>
              <el-button
                v-else
                type="primary"
                @click="nextQuestion"
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
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'ComprehensiveEntryPage'
})

import { ref, reactive, nextTick, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type UploadFile } from 'element-plus'
import { UploadFilled, Delete, ArrowRight, ArrowLeft, Loading, InfoFilled } from '@element-plus/icons-vue'
import request from '../utils/request'
import Cookies from 'js-cookie'
import Navbar from '../components/Navbar.vue'
import { loadDeepAssessmentDraft, loadEntryDraft, saveDeepAssessmentDraft, saveEntryDraft } from '@/utils/storage'
import DeepAssessmentQuestionnaire, { type DeepQuestionnaireAnswers } from '@/components/DeepAssessmentQuestionnaire.vue'
import { parseResumeApi, type ResumeParseResult } from '@/api/resume'
import { activityMonitor } from '@/utils/activityMonitor'

type MbtiOption = {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

type MbtiQuestion = {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

type Experience = { title: string; desc: string }

type EntryForm = {
  basic: { name: string; email: string; school: string; major: string; grade: string; city: string }
  target: { role: string; jobType: string; cities: string[]; salary: string; availableAt: string; avoid: string }
  skills: string[]
  certificates: string[]
  experiences: Experience[]
  values: number[]
  mbtiResult: string | null
  links: { github: string; portfolio: string }
  questionnaireAnswers: DeepQuestionnaireAnswers
}

const router = useRouter()
const submitting = ref(false)
const mbtiVisible = ref(false)
const mbtiStarted = ref(false) // 控制是否显示须知页面
const resumeProgress = ref(0)
const mbtiProgress = ref(0)
const mbtiManualInput = ref('')

const isMbtiManualValid = computed(() => {
  const v = mbtiManualInput.value.trim().toUpperCase()
  return /^[EI][SN][TF][JP]$/.test(v)
})

const presetCities = ['深圳', '广州', '北京', '上海', '杭州', '成都', '武汉', '西安', '南京', '苏州', '厦门', '重庆']

// MBTI 相关状态
const loadingQuestions = ref(false)
const questions = ref<MbtiQuestion[]>([])
const currentQIndex = ref(0)
const answers = reactive<Record<number, string>>({}) // { qId: 'A' }

const currentQuestion = computed(() => questions.value[currentQIndex.value])
const isAllAnswered = computed(() => {
  if (questions.value.length === 0) return false
  // 检查是否所有题目 ID 都在 answers 中且有值
  return questions.value.every(q => answers[q.id] !== undefined && answers[q.id] !== '')
})

const fetchQuestions = async () => {
  loadingQuestions.value = true
  try {
    const res = await request<MbtiQuestion[]>({
      url: '/mbti/questions',
      method: 'get'
    })
    questions.value = res
  } catch {
    ElMessage.error('获取题库失败，请检查网络连接')
  } finally {
    loadingQuestions.value = false
  }
}

const openMbti = () => {
  mbtiVisible.value = true
  mbtiStarted.value = false // 每次打开弹窗都先显示须知页面
  mbtiManualInput.value = form.mbtiResult ?? ''
  if (questions.value.length === 0) {
    fetchQuestions()
  }
}

const startMbti = () => {
  mbtiStarted.value = true
  activityMonitor.recordAction('深度测评开始', { deepAssessmentStarted: true })
}

const applyManualMbti = () => {
  const normalized = mbtiManualInput.value.trim().toUpperCase()
  if (!/^[EI][SN][TF][JP]$/.test(normalized)) {
    ElMessage.warning('请输入正确的 MBTI 类型，例如 INFP')
    return
  }
  form.mbtiResult = normalized
  mbtiProgress.value = 100
  mbtiVisible.value = false
  ElMessage.success(`已填写 MBTI 类型：${normalized}`)
}

const selectOption = (opt: MbtiOption) => {
  const q = currentQuestion.value
  if (!q) return
  answers[q.id] = opt.optCode

  if (currentQIndex.value < questions.value.length - 1) {
    const index = currentQIndex.value
    setTimeout(() => {
      if (currentQIndex.value === index) {
        currentQIndex.value++
      }
    }, 120)
  }
}

const prevQuestion = () => {
  if (currentQIndex.value > 0) {
    currentQIndex.value--
  }
}

const nextQuestion = () => {
  if (currentQIndex.value < questions.value.length - 1) {
    currentQIndex.value++
  }
}

const finishMbti = async () => {
  try {
    await ElMessageBox.confirm(
      '确定完成所有 MBTI 测评题吗？完成后将提交答案进行深度分析。',
      '完成测评',
      {
        confirmButtonText: '确定完成',
        cancelButtonText: '再查一下',
        type: 'success'
      }
    )

    const userData = Cookies.get('userInfo')
    const userInfo = JSON.parse(userData || '{}')
    if (!userInfo.id) {
      ElMessage.warning('请先登录后再进行测评')
      router.push('/login')
      return
    }

    mbtiVisible.value = false
    loadingQuestions.value = true // 复用 loading 状态

    const mbtiType = await request<string>({
      url: '/mbti/submit',
      method: 'post',
      data: {
        userId: userInfo.id,
        answers: { ...answers }
      }
    })

    mbtiProgress.value = 100
    form.mbtiResult = mbtiType // 保存 MBTI 类型结果
    activityMonitor.recordAction('深度测评完成', { deepAssessmentCompleted: true })
    ElMessage.success(`MBTI 测评完成！您的类型是: ${mbtiType}`)
  } catch (error: unknown) {
    if (error !== 'cancel') {
      ElMessage.error('测评提交失败，请稍后重试')
    }
  } finally {
    loadingQuestions.value = false
  }
}

const form = reactive<EntryForm>({
  basic: { name: '', email: '', school: '', major: '', grade: '', city: '' },
  target: { role: '', jobType: '全职', cities: [], salary: '', availableAt: '', avoid: '' },
  skills: [],
  certificates: [],
  experiences: [],
  values: [5, 5, 5],
  mbtiResult: null,
  links: { github: '', portfolio: '' },
  questionnaireAnswers: {}
})

// 自动保存信息录入草稿到本地缓存，避免切换页面时表单内容丢失
watch(
  form,
  (value: EntryForm) => {
    saveEntryDraft({
      basic: { ...value.basic },
      target: { ...value.target },
      skills: [...value.skills],
      certificates: [...value.certificates],
      experiences: value.experiences.map((e: Experience) => ({ title: e.title, desc: e.desc })),
      values: [...value.values],
      mbtiResult: value.mbtiResult,
      links: { ...value.links },
      questionnaireAnswers: { ...value.questionnaireAnswers }
    })
    saveDeepAssessmentDraft({ ...value.questionnaireAnswers })
  },
  { deep: true }
)

onMounted(() => {
  const draft = loadEntryDraft()
  const answers = loadDeepAssessmentDraft()
  if (draft) {
    form.basic = { ...form.basic, ...draft.basic }
    form.target = { ...form.target, ...draft.target }
    form.skills = Array.isArray(draft.skills) ? [...draft.skills] : form.skills
    form.certificates = Array.isArray(draft.certificates) ? [...draft.certificates] : form.certificates
    form.experiences = Array.isArray(draft.experiences)
      ? draft.experiences.map(e => ({ title: e.title, desc: e.desc }))
      : form.experiences
    form.values = Array.isArray(draft.values) ? [...draft.values] : form.values
    form.mbtiResult = draft.mbtiResult ?? form.mbtiResult
    if (form.mbtiResult) {
      mbtiProgress.value = 100
    }
    form.links = { ...form.links, ...draft.links }
  }
  if (answers) {
    form.questionnaireAnswers = { ...answers }
  }
})

const valuesQuestions = [
  { text: '您在工作中对“薪酬待遇”的看重程度' },
  { text: '您在工作中对“工作与生活平衡”的看重程度' },
  { text: '您在工作中对“社会地位与名望”的看重程度' }
]

// 技能标签逻辑
const inputValue = ref('')
const inputVisible = ref(false)
type InputLike = { input?: HTMLInputElement }
const InputRef = ref<InputLike | null>(null)

const handleCloseTag = (tag: string) => {
  form.skills.splice(form.skills.indexOf(tag), 1)
}

const showInput = () => {
  inputVisible.value = true
  nextTick(() => {
    InputRef.value?.input?.focus()
  })
}

const handleInputConfirm = () => {
  if (inputValue.value) {
    form.skills.push(inputValue.value)
  }
  inputVisible.value = false
  inputValue.value = ''
}

// 证书与经历逻辑
const addCert = () => form.certificates.push('')
const removeCert = (i: number) => form.certificates.splice(i, 1)
const addExp = () => form.experiences.push({ title: '', desc: '' })
const removeExp = (i: number) => form.experiences.splice(i, 1)

// 简历文件上传与解析
const handleFileChange = async (file: UploadFile) => {
  if (!file.raw) {
    ElMessage.error('未获取到上传文件，请重试')
    return
  }

  resumeProgress.value = 10

  try {
    const result: ResumeParseResult = await parseResumeApi(file.raw)
    resumeProgress.value = 60

    if (result.basic) {
      const b = result.basic
      if (!form.basic.name && b.name) form.basic.name = b.name
      if (!form.basic.email && b.email) form.basic.email = b.email
      if (!form.basic.school && b.school) form.basic.school = b.school
      if (!form.basic.major && b.major) form.basic.major = b.major
      // phone / gender / age 如需在前端展示，可在 EntryForm.basic 中扩展字段再映射
    }

    if ((!form.basic.school || !form.basic.major) && result.educations && result.educations.length > 0) {
      result.educations.forEach(edu => {
        const text = (edu?.text || '').trim()
        if (!text) return

        if (!form.basic.school) {
          const schoolMatch = text.match(/([\u4e00-\u9fa5A-Za-z0-9（）()·-]{2,40}(大学|学院|学校|职业技术大学|职业学院))/)
          if (schoolMatch?.[1]) {
            form.basic.school = schoolMatch[1]
          }
        }

        if (!form.basic.major) {
          const majorFromPipe = text.split('|')[0]?.trim()
          if (majorFromPipe && majorFromPipe.length <= 20 && !/\d{4}/.test(majorFromPipe)) {
            form.basic.major = majorFromPipe
          }
        }
      })
    }

    if (result.target) {
      const t = result.target
      if (!form.target.role && t.intentionPosition) form.target.role = t.intentionPosition
      if (!form.target.cities || form.target.cities.length === 0) {
        if (t.intentionCities && t.intentionCities.length > 0) {
          form.target.cities = [...t.intentionCities]
        }
      }
      if (!form.target.salary && t.expectedSalary) form.target.salary = t.expectedSalary
      if (!form.target.jobType && t.jobType) form.target.jobType = t.jobType
    }

    const skillsFromApi = Array.isArray(result.skills) ? result.skills : []
    const certsFromApi = Array.isArray(result.certificates) ? result.certificates : []

    if (skillsFromApi.length || certsFromApi.length) {
      if (form.skills.length === 0 && skillsFromApi.length) {
        form.skills = skillsFromApi.slice(0, 8)
      }
      if (form.certificates.length === 0 && certsFromApi.length) {
        form.certificates = [...certsFromApi]
      }
    } else if (result.skillCertificates && result.skillCertificates.length > 0) {
      const keywordCert = /(证书|证|认证|certificate|certified|award|获奖)/i
      const skills: string[] = []
      const certs: string[] = []
      result.skillCertificates.forEach(item => {
        const t = (item || '').trim()
        if (!t) return
        if (keywordCert.test(t)) {
          certs.push(t)
        } else {
          skills.push(t)
        }
      })
      if (form.skills.length === 0 && skills.length > 0) {
        form.skills = skills.slice(0, 8)
      }
      if (form.certificates.length === 0 && certs.length > 0) {
        form.certificates = [...certs]
      }
    }

    if (result.workExperiences && result.workExperiences.length > 0 && form.experiences.length === 0) {
      form.experiences = result.workExperiences.map(w => ({
        title: w.title || '',
        desc: w.description || ''
      }))
    }

    resumeProgress.value = 100
    ElMessage.success('简历解析成功，已自动填充部分信息')
  } catch (err) {
    console.error('简历解析失败', err)
    resumeProgress.value = 0
    ElMessage.error('简历解析失败，请检查文件格式或稍后重试')
  }
}

const basicCompletion = computed(() => {
  const fields = [
    form.basic.name,
    form.basic.email,
    form.basic.school,
    form.basic.major,
    form.basic.grade,
    form.basic.city
  ]
  const filled = fields.filter(v => String(v || '').trim()).length
  return Math.round((filled / fields.length) * 100)
})

const targetCompletion = computed(() => {
  const fields = [
    form.target.role,
    form.target.jobType,
    form.target.salary,
    form.target.availableAt,
    form.target.avoid
  ]
  const filled = fields.filter(v => String(v || '').trim()).length
  const cities = form.target.cities.length ? 1 : 0
  return Math.round(((filled + cities) / (fields.length + 1)) * 100)
})

const materialCompletion = computed(() => {
  const skills = Math.min(form.skills.length, 8) / 8
  const exps = Math.min(
    form.experiences.filter(e => e.title.trim() && e.desc.trim()).length,
    2
  ) / 2
  const certs = Math.min(
    form.certificates.filter(c => c.trim()).length,
    2
  ) / 2
  const links = [form.links.github, form.links.portfolio].filter(v => v.trim()).length / 2
  return Math.round((skills * 0.45 + exps * 0.35 + certs * 0.1 + links * 0.1) * 100)
})

const questionnaireCompletion = computed(() => {
  const singleKeys = [
    'basic_education',
    'basic_major_type',
    'basic_experience',
    'basic_salary',
    ...Array.from({ length: 12 }, (_, i) => `ability_${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `pref_${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `value_${i + 1}`)
  ]
  const multiKeys = ['basic_city_type']
  const textKeys = ['open_ideal_work', 'open_target_job']

  const total = singleKeys.length + multiKeys.length + textKeys.length
  if (total === 0) return 0

  let answered = 0

  for (const k of singleKeys) {
    const v = form.questionnaireAnswers[k]
    if (typeof v === 'string' && v.trim()) answered++
  }

  for (const k of multiKeys) {
    const v = form.questionnaireAnswers[k]
    if (Array.isArray(v) && v.filter(Boolean).length > 0) answered++
  }

  for (const k of textKeys) {
    const v = form.questionnaireAnswers[k]
    if (typeof v === 'string' && v.trim()) answered++
  }

  return Math.round((answered / total) * 100)
})

const overallCompletion = computed(() => {
  const parts = [
    basicCompletion.value,
    targetCompletion.value,
    materialCompletion.value,
    questionnaireCompletion.value,
    mbtiProgress.value
  ]
  const w = [0.2, 0.2, 0.2, 0.25, 0.15]
  const sum = parts.reduce((acc, v, idx) => acc + v * (w[idx] ?? 0), 0)
  return Math.round(sum)
})

const submitAll = async () => {
  submitting.value = true
  try {
    if (!form.basic.name.trim() || !form.basic.email.trim() || !form.target.role.trim()) {
      ElMessage.warning('请至少填写：姓名、邮箱、目标方向/岗位')
      return
    }

    saveEntryDraft({
      basic: { ...form.basic },
      target: { ...form.target },
      skills: [...form.skills],
      certificates: [...form.certificates],
      experiences: form.experiences.map(e => ({ title: e.title, desc: e.desc })),
      values: [...form.values],
      mbtiResult: form.mbtiResult,
      links: { ...form.links },
      questionnaireAnswers: { ...form.questionnaireAnswers }
    })
    saveDeepAssessmentDraft({ ...form.questionnaireAnswers })
    activityMonitor.recordAction('信息录入提交', { entryCompleted: true })
    ElMessage.success('综合分析提交成功！')
    router.push('/capability-profile')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.comprehensive-entry-page {
  min-height: 100vh;
  background: transparent;
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

.sub-block {
  margin-top: 16px;
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--clay-text);
  margin-bottom: 10px;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--clay-text-subtle);
  margin-top: -8px;
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

.exp-item {
  border: 1px dashed var(--clay-border);
  border-radius: var(--clay-radius-panel);
  padding: 16px;
  background: var(--clay-surface-variant);
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

.sticky {
  position: sticky;
}

.top-20 {
  top: 84px;
}

/* MBTI 弹窗 Clay 化样式 */
::deep(.mbti-dialog-custom) {
  border-radius: 16px;
  overflow: hidden;
}

::deep(.mbti-dialog-custom .el-dialog__header) {
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

.q-type-badge {
  font-size: 12px;
  color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  padding: 2px 10px;
  border-radius: 4px;
  font-weight: 500;
}

.q-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.q-divider {
  flex: 1;
  height: 1px;
  background: var(--clay-border-subtle);
}

.q-content {
  min-height: 80px;
  font-size: 18px;
  color: var(--clay-text);
  line-height: 1.6;
}

.options-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.option-card {
  display: flex;
  align-items: center;
  padding: 18px 24px;
  border-radius: 12px;
  border: 1px solid var(--clay-border-subtle);
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option-card:hover {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  transform: translateY(-1px);
}

.option-card.is-active {
  border-color: var(--clay-ube-800);
  background: var(--clay-surface-variant);
  box-shadow: var(--clay-shadow);
}

.opt-radio {
  width: 20px;
  height: 20px;
  border: 2px solid var(--clay-border);
  border-radius: 50%;
  margin-right: 16px;
  position: relative;
  transition: all 0.2s;
}

.option-card.is-active .opt-radio {
  border-color: var(--clay-ube-800);
}

.option-card.is-active .opt-radio::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 10px;
  height: 10px;
  background: var(--clay-ube-800);
  border-radius: 50%;
}

.opt-text {
  font-size: 16px;
  color: var(--clay-text);
}

.option-card.is-active .opt-text {
  color: var(--clay-ube-800);
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

/* 须知页面样式 */
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
