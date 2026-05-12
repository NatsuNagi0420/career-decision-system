import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type UploadFile } from 'element-plus'
import { loadDeepAssessmentDraft, loadEntryDraft, saveDeepAssessmentDraft, saveEntryDraft } from '@/utils/storage'
import { parseResumeApi, type ResumeParseResult } from '@/api/resume'
import { activityMonitor } from '@/utils/activityMonitor'
import { isLoggedIn } from '@/utils/auth'
import type { DeepQuestionnaireAnswers } from '@/components/DeepAssessmentQuestionnaire.vue'

export interface Experience {
  title: string
  desc: string
}

export interface EntryForm {
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

export const presetCities = ['深圳', '广州', '北京', '上海', '杭州', '成都', '武汉', '西安', '南京', '苏州', '厦门', '重庆']

export const valuesQuestions = [
  { text: '您在工作中对"薪酬待遇"的看重程度' },
  { text: '您在工作中对"工作与生活平衡"的看重程度' },
  { text: '您在工作中对"社会地位与名望"的看重程度' }
]

export function useComprehensiveEntry() {
  const router = useRouter()
  const submitting = ref(false)
  const resumeProgress = ref(0)

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

  // 自动保存草稿
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

  // 加载草稿
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
      form.links = { ...form.links, ...draft.links }
    }
    if (answers) {
      form.questionnaireAnswers = { ...answers }
    }
  })

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
    // 登录状态预检查
    if (!isLoggedIn()) {
      ElMessage.warning('请先登录后再上传简历')
      router.push('/login')
      return
    }

    if (!file.raw) {
      ElMessage.error('未获取到上传文件，请重试')
      return
    }

    // 文件类型检查
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!allowedTypes.includes(file.raw.type)) {
      ElMessage.error('仅支持 PDF、DOC、DOCX 格式的简历文件')
      return
    }

    // 文件大小检查（限制 10MB）
    const maxSize = 10 * 1024 * 1024
    if (file.raw.size > maxSize) {
      ElMessage.error('简历文件大小不能超过 10MB')
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
      }

      if ((!form.basic.school || !form.basic.major) && result.educations && result.educations.length > 0) {
        result.educations.forEach(edu => {
          const text = (edu?.text || '').trim()
          if (!text) return

          if (!form.basic.school) {
            const schoolMatch = text.match(/([一-龥A-Za-z0-9（）()·-]{2,40}(大学|学院|学校|职业技术大学|职业学院))/)
            if (schoolMatch?.[1]) {
              form.basic.school = schoolMatch[1]
            }
          }

          if (!form.basic.major) {
            const majorMatch = text.match(/([一-龥A-Za-z]{2,30}(专业|系|方向))/)
            if (majorMatch?.[1]) {
              form.basic.major = majorMatch[1]
            }
          }
        })
      }

      if (result.skills && result.skills.length > 0 && form.skills.length === 0) {
        form.skills = result.skills.slice(0, 12)
      }

      if (result.certificates && result.certificates.length > 0) {
        const certs = result.certificates
          .map((c: unknown) => {
            if (typeof c === 'string') return c
            if (c && typeof c === 'object' && 'name' in c) return String((c as Record<string, unknown>).name)
            return ''
          })
          .filter(Boolean)
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

  // 完成度计算
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

  const overallCompletion = (mbtiProgress: number) => {
    const parts = [
      basicCompletion.value,
      targetCompletion.value,
      materialCompletion.value,
      questionnaireCompletion.value,
      mbtiProgress
    ]
    const w = [0.2, 0.2, 0.2, 0.25, 0.15]
    const sum = parts.reduce((acc, v, idx) => acc + v * (w[idx] ?? 0), 0)
    return Math.round(sum)
  }

  // 更新证书
  const updateCertificate = (index: number, value: string) => {
    form.certificates[index] = value
  }

  // 更新经历
  const updateExperience = (index: number, field: 'title' | 'desc', value: string) => {
    if (form.experiences[index]) {
      form.experiences[index][field] = value
    }
  }

  // 提交逻辑
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

  return {
    form,
    submitting,
    resumeProgress,
    inputValue,
    inputVisible,
    InputRef,
    handleCloseTag,
    showInput,
    handleInputConfirm,
    addCert,
    removeCert,
    addExp,
    removeExp,
    handleFileChange,
    basicCompletion,
    targetCompletion,
    materialCompletion,
    questionnaireCompletion,
    overallCompletion,
    updateCertificate,
    updateExperience,
    submitAll
  }
}
