<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowRight, BriefcaseBusiness, Check, CircleAlert, FileCheck2,
  GitCompareArrows, Pencil, Plus, Save, Sparkles, Target, Trash2, X
} from 'lucide-vue-next'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import AgentInsightPanel from '@/components/AgentInsightPanel.vue'
import {
  coachDecisionApi,
  suggestJobComparisonApi,
  type CandidateAssessment,
  type CandidateSuggestion,
  type DecisionCoachResponse,
  type JobComparisonResponse
} from '@/api/coaching'
import {
  addDecisionCandidateApi,
  addDecisionEvidenceApi,
  confirmDecisionTargetsApi,
  createDecisionProjectApi,
  getDecisionProjectApi,
  moveDecisionStageApi,
  removeDecisionCandidateApi,
  removeDecisionEvidenceApi,
  saveComparisonResultApi,
  updateComparisonCriterionApi,
  updateDecisionCandidateApi,
  updateDecisionEvidenceApi,
  updateDecisionProjectApi,
  type ComparisonCriterion,
  type DecisionCandidate,
  type DecisionProject,
  type DecisionStage
} from '@/api/decisionProjects'
import { listPersonalEvidenceApi, type PersonalEvidence } from '@/api/personalEvidence'
import { getProfileApi, type UserProfile } from '@/api/profile'
import { listMbtiHistoryApi, type MbtiHistoryItem } from '@/api/mbti'
import { createDecisionSnapshotApi } from '@/api/report'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/utils/formDraft'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'DecisionProjectWorkspacePage' })

const route = useRoute()
const router = useRouter()
const project = ref<DecisionProject | null>(null)
const loading = ref(false)
const saving = ref(false)
const activeStage = ref<DecisionStage>('clarify')
const personalEvidence = ref<PersonalEvidence[]>([])
const userProfile = ref<UserProfile | null>(null)
const mbtiHistory = ref<MbtiHistoryItem[]>([])
const coachLoading = ref(false)
const comparisonCoachLoading = ref(false)
const decisionCoach = ref<DecisionCoachResponse | null>(null)
const comparisonCoach = ref<JobComparisonResponse | null>(null)
const snapshotLoading = ref(false)
const savedSnapshotVersion = ref<number | null>(null)
const snapshotRequestId = ref<string | null>(null)
const draftReady = ref(false)
const draftUserId = getStoredUser()?.id
const editingEvidenceId = ref<number | null>(null)
const editingCandidateId = ref<number | null>(null)
const savingCriterionId = ref<number | null>(null)

const projectForm = reactive({
  title: '', question: '', decisionDeadline: '', background: '', triggerReason: '',
  prioritiesText: '', mustHavesText: '', dealBreakersText: ''
})

const evidenceForm = reactive({
  personalEvidenceId: null as number | null,
  candidateId: null as number | null,
  title: '', detail: '', sourceType: 'user', sourceRef: '', credibility: 'medium', stance: 'neutral'
})
const candidateForm = reactive({
  directionId: null as number | null,
  name: '', recommendationReason: '', opposingFactors: '', uncertainties: '', validationActionsText: '',
  sourceType: 'user' as 'user' | 'ai' | 'catalog'
})
const targetForm = reactive({
  primaryCandidateId: null as number | null,
  backupCandidateId: null as number | null,
  decisionReason: '', mainRisks: '', reviewDate: '', confirmed: false
})

type ComparisonDraft = {
  score: number | null
  assessment: string
  evidenceIds: number[]
  uncertainty: string
  validationAction: string
  saving: boolean
}
const comparisonDrafts = reactive<Record<string, ComparisonDraft>>({})
const criterionImportance = reactive<Record<number, number>>({})

const stages: Array<{ id: DecisionStage; label: string; icon: typeof FileCheck2 }> = [
  { id: 'clarify', label: '明确问题', icon: FileCheck2 },
  { id: 'evidence', label: '整理证据', icon: Sparkles },
  { id: 'candidates', label: '收集候选', icon: Target },
  { id: 'compare', label: '对比验证', icon: GitCompareArrows },
  { id: 'target', label: '确定目标', icon: Check }
]

const projectId = computed(() => {
  const raw = route.params.id
  if (raw === undefined) return null
  const id = Number(raw)
  return Number.isFinite(id) ? id : null
})
const isNew = computed(() => !projectId.value)
const draftScope = () => `decision-project-${projectId.value ?? 'new'}`
const currentStageIndex = computed(() => stages.findIndex((item) => item.id === project.value?.currentStage))
const activeStageIndex = computed(() => stages.findIndex((item) => item.id === activeStage.value))
const split = (value: string) => value.split(/[，,、\n]/).map((item) => item.trim()).filter(Boolean)

const hydrateProject = (data: DecisionProject) => {
  project.value = data
  projectForm.title = data.title
  projectForm.question = data.question
  projectForm.decisionDeadline = data.decisionDeadline || ''
  projectForm.background = data.background || ''
  projectForm.triggerReason = data.triggerReason || ''
  projectForm.prioritiesText = data.priorities.join('、')
  projectForm.mustHavesText = data.mustHaves.join('、')
  projectForm.dealBreakersText = data.dealBreakers.join('、')
  activeStage.value = data.currentStage
  const primary = data.targets.find((item) => item.targetType === 'primary')
  const backup = data.targets.find((item) => item.targetType === 'backup')
  targetForm.primaryCandidateId = primary?.candidateId || null
  targetForm.backupCandidateId = backup?.candidateId || null
  targetForm.decisionReason = primary?.decisionReason || ''
  targetForm.mainRisks = primary?.mainRisks || ''
  targetForm.reviewDate = primary?.reviewDate || ''
  targetForm.confirmed = !!primary
  for (const criterion of data.criteria) criterionImportance[criterion.id] = criterion.importance
  initializeComparisonDrafts(data)
}

type WorkspaceDraft = {
  projectForm: typeof projectForm
  evidenceForm: typeof evidenceForm
  candidateForm: typeof candidateForm
  targetForm: typeof targetForm
}

const restoreDraft = (serverUpdatedAt?: string | null) => {
  const draft = loadFormDraft<WorkspaceDraft>(draftScope(), draftUserId)
  if (!draft) return
  if (serverUpdatedAt && Date.parse(draft.updatedAt) <= Date.parse(serverUpdatedAt)) return
  Object.assign(projectForm, draft.data.projectForm)
  Object.assign(evidenceForm, draft.data.evidenceForm)
  Object.assign(candidateForm, draft.data.candidateForm)
  Object.assign(targetForm, draft.data.targetForm)
}

const discardDraft = async (scope = draftScope()) => {
  draftReady.value = false
  await nextTick()
  clearFormDraft(scope, draftUserId)
  draftReady.value = true
}

const initializeComparisonDrafts = (data: DecisionProject) => {
  for (const criterion of data.criteria) {
    for (const candidate of data.candidates) {
      const key = `${criterion.id}:${candidate.id}`
      const result = criterion.results.find((item) => item.candidateId === candidate.id)
      comparisonDrafts[key] = {
        score: result?.score ?? null,
        assessment: result?.assessment || '',
        evidenceIds: result?.evidenceIds ? [...result.evidenceIds] : [],
        uncertainty: result?.uncertainty || '',
        validationAction: result?.validationAction || '',
        saving: false
      }
    }
  }
}

const load = async () => {
  draftReady.value = false
  if (!projectId.value) {
    restoreDraft()
    draftReady.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [data, evidence, profile, assessments] = await Promise.all([
      getDecisionProjectApi(projectId.value),
      listPersonalEvidenceApi(),
      getProfileApi(),
      listMbtiHistoryApi()
    ])
    personalEvidence.value = evidence
    userProfile.value = profile
    mbtiHistory.value = assessments
    hydrateProject(data)
    restoreDraft(data.updatedAt)
  } finally {
    draftReady.value = true
    loading.value = false
  }
}

onMounted(async () => {
  if (isNew.value) {
    const [evidence, profile, assessments] = await Promise.all([
      listPersonalEvidenceApi(), getProfileApi(), listMbtiHistoryApi()
    ])
    personalEvidence.value = evidence
    userProfile.value = profile
    mbtiHistory.value = assessments
  }
  await load()
})

watch(() => route.params.id, load)
watch([projectForm, evidenceForm, candidateForm, targetForm], () => {
  if (!draftReady.value) return
  saveFormDraft(draftScope(), draftUserId, {
    projectForm: { ...projectForm },
    evidenceForm: { ...evidenceForm },
    candidateForm: { ...candidateForm },
    targetForm: { ...targetForm }
  })
}, { deep: true })

const saveProject = async () => {
  if (!projectForm.title.trim() || !projectForm.question.trim()) {
    m3Message.warning('请填写项目标题和决策问题')
    return null
  }
  saving.value = true
  try {
    const savedDraftScope = draftScope()
    const payload = {
      title: projectForm.title.trim(),
      question: projectForm.question.trim(),
      decisionDeadline: projectForm.decisionDeadline || null,
      background: projectForm.background || null,
      triggerReason: projectForm.triggerReason || null,
      priorities: split(projectForm.prioritiesText),
      mustHaves: split(projectForm.mustHavesText),
      dealBreakers: split(projectForm.dealBreakersText),
      expectedVersion: project.value?.version
    }
    const data = project.value
      ? await updateDecisionProjectApi(project.value.id, payload)
      : await createDecisionProjectApi(payload)
    hydrateProject(data)
    await discardDraft(savedDraftScope)
    if (isNew.value) await router.replace(`/decision-projects/${data.id}`)
    m3Message.success('项目已保存')
    return data
  } finally {
    saving.value = false
  }
}

const advance = async () => {
  let data = project.value
  if (activeStage.value === 'clarify') data = await saveProject()
  if (!data) return
  const index = stages.findIndex((item) => item.id === data?.currentStage)
  const nextStage = stages[index + 1]?.id
  if (!nextStage) return
  try {
    const updated = await moveDecisionStageApi(data.id, nextStage, data.version)
    hydrateProject(updated)
    activeStage.value = nextStage
  } catch (error) {
    m3Message.warning(error instanceof Error ? error.message : '当前阶段尚未满足推进条件')
  }
}

const selectStage = (stage: DecisionStage, index: number) => {
  if (!project.value && stage !== 'clarify') return
  if (index <= currentStageIndex.value) activeStage.value = stage
}

const fillEvidenceFromProfile = () => {
  const selected = personalEvidence.value.find((item) => item.id === evidenceForm.personalEvidenceId)
  if (!selected) return
  evidenceForm.title = selected.title
  evidenceForm.detail = selected.description || ''
  evidenceForm.sourceType = selected.sourceType
  evidenceForm.credibility = selected.credibility
}

const resetEvidenceForm = () => {
  editingEvidenceId.value = null
  Object.assign(evidenceForm, {
    personalEvidenceId: null, candidateId: null, title: '', detail: '', sourceType: 'user',
    sourceRef: '', credibility: 'medium', stance: 'neutral'
  })
}

const editEvidence = (item: DecisionProject['evidence'][number]) => {
  editingEvidenceId.value = item.id
  Object.assign(evidenceForm, {
    personalEvidenceId: item.personalEvidenceId,
    candidateId: item.candidateId,
    title: item.title,
    detail: item.detail || '',
    sourceType: item.sourceType,
    sourceRef: item.sourceRef || '',
    credibility: item.credibility,
    stance: item.stance
  })
}

const saveEvidence = async () => {
  if (!project.value || !evidenceForm.title.trim()) {
    m3Message.warning('请填写证据标题')
    return
  }
  const payload = {
    candidateId: evidenceForm.candidateId,
    personalEvidenceId: evidenceForm.personalEvidenceId,
    title: evidenceForm.title.trim(),
    detail: evidenceForm.detail || null,
    sourceType: evidenceForm.sourceType,
    sourceRef: evidenceForm.sourceRef || null,
    credibility: evidenceForm.credibility as 'low' | 'medium' | 'high',
    stance: evidenceForm.stance as 'support' | 'oppose' | 'neutral',
    expectedVersion: project.value.version
  }
  const data = editingEvidenceId.value
    ? await updateDecisionEvidenceApi(project.value.id, editingEvidenceId.value, payload)
    : await addDecisionEvidenceApi(project.value.id, payload)
  hydrateProject(data)
  const updated = editingEvidenceId.value !== null
  resetEvidenceForm()
  m3Message.success(updated ? '证据已更新' : '证据已添加')
}

const addProfileEvidence = async (suggestion: ProfileEvidenceSuggestion) => {
  if (!project.value) return
  hydrateProject(await addDecisionEvidenceApi(project.value.id, {
    candidateId: null,
    title: suggestion.title,
    detail: suggestion.detail,
    sourceType: suggestion.sourceType,
    sourceRef: suggestion.key,
    credibility: suggestion.credibility,
    stance: suggestion.stance,
    expectedVersion: project.value.version
  }))
  m3Message.success('已引用到项目，可继续编辑可信度和倾向')
}

const removeEvidence = async (id: number) => {
  if (!project.value) return
  hydrateProject(await removeDecisionEvidenceApi(project.value.id, id, project.value.version))
  if (editingEvidenceId.value === id) resetEvidenceForm()
}

const resetCandidateForm = () => {
  editingCandidateId.value = null
  Object.assign(candidateForm, {
    directionId: null, name: '', recommendationReason: '', opposingFactors: '', uncertainties: '',
    validationActionsText: '', sourceType: 'user'
  })
}

const editCandidate = (candidate: DecisionCandidate) => {
  editingCandidateId.value = candidate.id
  Object.assign(candidateForm, {
    directionId: candidate.directionId,
    name: candidate.name,
    recommendationReason: candidate.recommendationReason || '',
    opposingFactors: candidate.opposingFactors || '',
    uncertainties: candidate.uncertainties || '',
    validationActionsText: candidate.validationActions.join('、'),
    sourceType: candidate.sourceType as 'user' | 'ai' | 'catalog'
  })
}

const saveCandidate = async () => {
  if (!project.value || !candidateForm.name.trim()) {
    m3Message.warning('请填写候选方向名称')
    return
  }
  const payload = {
    directionId: candidateForm.directionId,
    name: candidateForm.name.trim(),
    recommendationReason: candidateForm.recommendationReason || null,
    opposingFactors: candidateForm.opposingFactors || null,
    uncertainties: candidateForm.uncertainties || null,
    validationActions: split(candidateForm.validationActionsText),
    sourceType: candidateForm.sourceType,
    expectedVersion: project.value.version
  }
  const data = editingCandidateId.value
    ? await updateDecisionCandidateApi(project.value.id, editingCandidateId.value, payload)
    : await addDecisionCandidateApi(project.value.id, payload)
  hydrateProject(data)
  const updated = editingCandidateId.value !== null
  resetCandidateForm()
  m3Message.success(updated ? '候选已更新' : '候选已加入')
}

const removeCandidate = async (candidate: DecisionCandidate) => {
  if (!project.value) return
  hydrateProject(await removeDecisionCandidateApi(
    project.value.id,
    candidate.id,
    project.value.version
  ))
  if (editingCandidateId.value === candidate.id) resetCandidateForm()
}

const comparisonKey = (criterion: ComparisonCriterion, candidate: DecisionCandidate) => `${criterion.id}:${candidate.id}`
const comparisonEvidence = (candidate: DecisionCandidate) => project.value?.evidence
  .filter((item) => item.candidateId === null || item.candidateId === candidate.id) || []

const decisionReadiness = computed(() => (project.value?.candidates || []).map((candidate) => {
  const evidenceReady = comparisonEvidence(candidate).length > 0
  const jobsReady = !!project.value?.jobSamples.some((sample) => sample.candidateId === candidate.id)
  const comparisonReady = !!project.value?.criteria.some((criterion) =>
    criterion.results.some((result) => result.candidateId === candidate.id)
  )
  return {
    candidate,
    evidenceReady,
    jobsReady,
    comparisonReady,
    ready: evidenceReady && jobsReady && comparisonReady
  }
}))
const canConfirmTargets = computed(() => {
  const count = project.value?.candidates.length || 0
  return count >= 2 && count <= 5 && decisionReadiness.value.every((item) => item.ready)
})

type ProfileEvidenceSuggestion = {
  key: string
  title: string
  detail: string
  sourceType: 'profile' | 'assessment'
  credibility: 'low' | 'medium'
  stance: 'support' | 'neutral'
}

const profileEvidenceSuggestions = computed<ProfileEvidenceSuggestion[]>(() => {
  const profile = userProfile.value
  const suggestions: ProfileEvidenceSuggestion[] = []
  profile?.experiences.slice(0, 6).forEach((experience, index) => suggestions.push({
    key: `profile:experience:${index}`,
    title: `经历：${experience.slice(0, 80)}`,
    detail: experience,
    sourceType: 'profile',
    credibility: 'medium',
    stance: 'support'
  }))
  profile?.skills.slice(0, 8).forEach((skill, index) => suggestions.push({
    key: `profile:skill:${index}`,
    title: `技能：${skill}`,
    detail: `个人档案记录了“${skill}”，尚需关联项目、课程或成果验证熟练程度。`,
    sourceType: 'profile',
    credibility: 'low',
    stance: 'neutral'
  }))
  profile?.constraints.slice(0, 5).forEach((constraint, index) => suggestions.push({
    key: `profile:constraint:${index}`,
    title: `现实约束：${constraint.slice(0, 80)}`,
    detail: constraint,
    sourceType: 'profile',
    credibility: 'medium',
    stance: 'neutral'
  }))
  const latestMbti = mbtiHistory.value[0]
  if (latestMbti) suggestions.push({
    key: `assessment:mbti:${latestMbti.id}`,
    title: `MBTI 辅助信号：${latestMbti.type}`,
    detail: `${latestMbti.description}。该测评只作为偏好线索，不能单独决定职业。`,
    sourceType: 'assessment',
    credibility: 'low',
    stance: 'neutral'
  })
  const used = new Set(project.value?.evidence.map((item) => item.sourceRef).filter(Boolean))
  return suggestions.filter((item) => !used.has(item.key))
})

const saveComparison = async (criterion: ComparisonCriterion, candidate: DecisionCandidate) => {
  if (!project.value) return
  const draft = comparisonDrafts[comparisonKey(criterion, candidate)]
  if (!draft) return
  if (!draft.evidenceIds.length && !draft.uncertainty.trim() && !draft.validationAction.trim()) {
    m3Message.warning('请关联至少一条证据，或明确填写不确定性/验证动作')
    return
  }
  draft.saving = true
  try {
    const data = await saveComparisonResultApi(project.value.id, criterion.id, {
      candidateId: candidate.id,
      score: draft.score,
      assessment: draft.assessment || null,
      uncertainty: draft.uncertainty || null,
      validationAction: draft.validationAction || null,
      evidenceIds: draft.evidenceIds,
      expectedVersion: project.value.version
    })
    hydrateProject(data)
    m3Message.success(`${criterion.name} · ${candidate.name} 已保存`)
  } finally {
    draft.saving = false
  }
}

const saveCriterionImportance = async (criterion: ComparisonCriterion) => {
  if (!project.value) return
  const importance = Math.min(5, Math.max(1, criterionImportance[criterion.id] || 3))
  if (importance === criterion.importance) return
  savingCriterionId.value = criterion.id
  try {
    hydrateProject(await updateComparisonCriterionApi(project.value.id, criterion.id, {
      name: criterion.name,
      description: criterion.description,
      importance,
      expectedVersion: project.value.version
    }))
    m3Message.success(`${criterion.name}的重要度已更新`)
  } finally {
    savingCriterionId.value = null
  }
}

const confirmTargets = async () => {
  if (!project.value || !targetForm.primaryCandidateId || !targetForm.decisionReason.trim()) {
    m3Message.warning('请选择主目标并填写选择理由')
    return
  }
  if (!targetForm.confirmed) {
    m3Message.warning('请确认这是你的选择后再保存')
    return
  }
  if (!canConfirmTargets.value) {
    m3Message.warning('每个候选都需要个人证据、真实岗位样本和至少一项已保存比较')
    return
  }
  const data = await confirmDecisionTargetsApi(project.value.id, {
    primaryCandidateId: targetForm.primaryCandidateId,
    backupCandidateId: targetForm.backupCandidateId,
    decisionReason: targetForm.decisionReason.trim(),
    mainRisks: targetForm.mainRisks || null,
    reviewDate: targetForm.reviewDate || null,
    confirmed: true,
    expectedVersion: project.value.version
  })
  hydrateProject(data)
  await discardDraft()
  m3Message.success('目标已确认，可以生成行动计划')
}

const requestDecisionCoach = async () => {
  if (!project.value) return
  coachLoading.value = true
  try {
    decisionCoach.value = await coachDecisionApi(project.value.id)
  } finally {
    coachLoading.value = false
  }
}

const addAiCandidate = async (suggestion: CandidateSuggestion) => {
  if (!project.value) return
  await m3Confirm(
    `将“${suggestion.name}”加入候选后仍可编辑或删除。确认加入吗？`,
    '确认 AI 候选建议',
    { confirmButtonText: '确认加入', cancelButtonText: '取消', type: 'warning' }
  )
  hydrateProject(await addDecisionCandidateApi(project.value.id, {
    directionId: suggestion.directionId,
    name: suggestion.name,
    recommendationReason: suggestion.recommendationReason,
    opposingFactors: suggestion.opposingFactors,
    uncertainties: suggestion.uncertainties,
    validationActions: suggestion.validationActions,
    sourceType: 'ai',
    expectedVersion: project.value.version
  }))
  m3Message.success('候选已加入，来源标记为 AI 建议')
}

const requestComparisonCoach = async () => {
  if (!project.value) return
  comparisonCoachLoading.value = true
  try {
    comparisonCoach.value = await suggestJobComparisonApi(project.value.id)
  } finally {
    comparisonCoachLoading.value = false
  }
}

const applyComparisonAssessment = async (assessment: CandidateAssessment) => {
  if (!project.value) return
  const criterion = project.value.criteria.find((item) => /岗位|需求/.test(`${item.code}${item.name}`))
    || project.value.criteria[0]
  const candidate = project.value.candidates.find((item) => item.id === assessment.candidateId)
  if (!criterion || !candidate) return
  await m3Confirm(
    `将 AI 对“${candidate.name}”的建议填入“${criterion.name}”草稿。填入后仍需你检查并点击保存。`,
    '确认填入比较草稿',
    { confirmButtonText: '填入草稿', cancelButtonText: '取消', type: 'warning' }
  )
  const draft = comparisonDrafts[comparisonKey(criterion, candidate)]
  if (!draft) return
  draft.score = assessment.score
  draft.assessment = [assessment.assessment, `反对因素：${assessment.opposingFactors.join('；')}`].join('\n')
  draft.uncertainty = assessment.uncertainty
  draft.validationAction = assessment.validationAction
  m3Message.success('已填入草稿，检查后再保存')
}

const saveDecisionSnapshot = async () => {
  if (!project.value || project.value.status !== 'decided') return
  snapshotLoading.value = true
  snapshotRequestId.value ||= `decision-snapshot-${project.value.id}-${crypto.randomUUID()}`
  try {
    const snapshot = await createDecisionSnapshotApi(project.value.id, snapshotRequestId.value)
    savedSnapshotVersion.value = snapshot.snapshotVersion || null
    snapshotRequestId.value = null
    m3Message.success(`决策快照 v${snapshot.snapshotVersion || 1} 已保存`)
  } finally {
    snapshotLoading.value = false
  }
}

const gotoPlan = () => router.push(`/action-plans/new?projectId=${project.value?.id}`)
</script>

<template>
  <div class="product-page">
    <div class="workspace-shell">
      <header class="workspace-header">
        <M3IconButton class="back-button" label="返回项目列表" @click="router.push('/decision-projects')"><ArrowLeft :size="19" /></M3IconButton>
        <div><span>{{ project ? '职业决策项目' : '新建决策项目' }}</span><h1>{{ project?.title || '先明确一个具体问题' }}</h1></div>
        <div class="header-meta"><span v-if="project">版本 {{ project.version }}</span><span v-if="project?.current">当前项目</span></div>
      </header>

      <M3Tabs class="stage-nav" aria-label="决策阶段">
        <M3Tab v-for="(stage, index) in stages" :key="stage.id" :disabled="!project && index > 0 || index > currentStageIndex" :active="activeStage === stage.id" :class="{ done: project && index < currentStageIndex }" @click="selectStage(stage.id, index)">
          <span><Check v-if="project && index < currentStageIndex" :size="15" /><component :is="stage.icon" v-else :size="16" /></span>
          <strong>{{ stage.label }}</strong>
        </M3Tab>
      </M3Tabs>

      <main class="stage-panel loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载决策项目" />
        <section v-if="activeStage === 'clarify'" class="stage-content">
          <div class="stage-heading"><div><span>阶段 1</span><h2>把问题缩小到可以验证</h2></div><p>明确截止时间、背景、看重因素和不能接受的条件。</p></div>
          <div class="form-grid two-columns">
            <label class="field-label full-column">项目标题<M3TextField v-model="projectForm.title"  placeholder="例如：Java 后端还是数据分析" /></label>
            <label class="field-label full-column">决策问题<M3TextArea v-model="projectForm.question"  placeholder="未来三个月优先验证哪个方向？"></M3TextArea></label>
            <label class="field-label">希望何时做出决定<M3DatePicker v-model="projectForm.decisionDeadline" /></label>
            <label class="field-label">触发原因<M3TextField v-model="projectForm.triggerReason"  placeholder="为什么现在需要做这个决定" /></label>
            <label class="field-label full-column">当前背景<M3TextArea v-model="projectForm.background"  placeholder="已有课程、技能、经历和现实限制"></M3TextArea></label>
            <label class="field-label">最看重的因素<M3TextField v-model="projectForm.prioritiesText"  placeholder="兴趣、发展、收入、城市等" /></label>
            <label class="field-label">必须满足<M3TextField v-model="projectForm.mustHavesText"  placeholder="用逗号分隔" /></label>
            <label class="field-label full-column">不能接受<M3TextField v-model="projectForm.dealBreakersText"  placeholder="用逗号分隔" /></label>
          </div>
        </section>

        <section v-else-if="activeStage === 'evidence'" class="stage-content">
          <div class="stage-heading"><div><span>阶段 2</span><h2>整理事实、判断和信息缺口</h2></div><p>每条证据都标明来源、可信度和倾向。AI 推断不能伪装成事实。</p></div>
          <div v-if="profileEvidenceSuggestions.length" class="profile-reference">
            <header><div><strong>个人档案可引用内容</strong><span>引用后仍可修改可信度、倾向和关联候选</span></div><span>{{ profileEvidenceSuggestions.length }} 条待确认</span></header>
            <div class="profile-reference-list">
              <article v-for="item in profileEvidenceSuggestions.slice(0, 10)" :key="item.key">
                <div><span>{{ item.sourceType === 'assessment' ? '辅助测评' : '个人档案' }} · 可信度 {{ item.credibility }}</span><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div>
                <M3Button variant="outlined" class="compact" type="button" @click="addProfileEvidence(item)"><Plus :size="14" />引用</M3Button>
              </article>
            </div>
          </div>
          <div class="split-layout">
            <div class="evidence-list">
              <article v-for="item in project?.evidence" :key="item.id" class="evidence-row">
                <div><span>{{ item.sourceType }} · 可信度 {{ item.credibility }}</span><strong>{{ item.title }}</strong><p>{{ item.detail || '暂无补充说明' }}</p></div>
                <div class="evidence-aside">
                  <span :class="`stance-${item.stance}`">{{ item.stance }}</span>
                  <M3IconButton label="编辑证据" @click="editEvidence(item)"><Pencil :size="16" /></M3IconButton>
                  <M3IconButton class="destructive-icon" label="移除证据" @click="removeEvidence(item.id)"><Trash2 :size="16" /></M3IconButton>
                </div>
              </article>
              <p v-if="!project?.evidence.length" class="empty-copy">还没有项目证据。可引用个人档案，也可在右侧直接记录。</p>
            </div>
            <M3Card tag="form" class="side-form" @submit.prevent="saveEvidence">
              <div class="form-title-row"><h3>{{ editingEvidenceId ? '编辑项目证据' : '添加项目证据' }}</h3><M3IconButton v-if="editingEvidenceId" label="取消编辑" @click="resetEvidenceForm"><X :size="17" /></M3IconButton></div>
              <label class="field-label">引用个人证据<M3Select v-model="evidenceForm.personalEvidenceId"  @change="fillEvidenceFromProfile"><option :value="null">不引用</option><option v-for="item in personalEvidence" :key="item.id" :value="item.id">{{ item.title }}</option></M3Select></label>
              <label class="field-label">关联候选<M3Select v-model="evidenceForm.candidateId" ><option :value="null">项目通用</option><option v-for="candidate in project?.candidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select></label>
              <label class="field-label">标题<M3TextField v-model="evidenceForm.title"  /></label>
              <label class="field-label">说明<M3TextArea v-model="evidenceForm.detail" class="small-textarea"></M3TextArea></label>
              <div class="form-grid two-columns"><label class="field-label">可信度<M3Select v-model="evidenceForm.credibility" ><option value="high">高</option><option value="medium">中</option><option value="low">低</option></M3Select></label><label class="field-label">倾向<M3Select v-model="evidenceForm.stance" ><option value="support">支持</option><option value="neutral">中性</option><option value="oppose">反对</option></M3Select></label></div>
              <M3Button type="submit"><Save v-if="editingEvidenceId" :size="16" /><Plus v-else :size="16" />{{ editingEvidenceId ? '保存修改' : '添加证据' }}</M3Button>
            </M3Card>
          </div>
        </section>

        <section v-else-if="activeStage === 'candidates'" class="stage-content">
          <div class="stage-heading"><div><span>阶段 3</span><h2>保留 2 至 5 个候选方向</h2></div><p>每个候选都要同时记录支持理由、反对因素、不确定性和下一步验证动作。</p></div>
          <div class="coach-command-row"><M3Button variant="outlined" type="button" :disabled="coachLoading" @click="requestDecisionCoach"><Sparkles :size="16" />{{ coachLoading ? '正在分析' : '请 AI 教练分析' }}</M3Button></div>
          <AgentInsightPanel v-if="decisionCoach" :result="decisionCoach" title="决策教练建议">
            <div v-if="decisionCoach.candidateSuggestions.length" class="ai-suggestion-list">
              <article v-for="suggestion in decisionCoach.candidateSuggestions" :key="suggestion.name">
                <div><strong>{{ suggestion.name }}</strong><p>{{ suggestion.recommendationReason }}</p><small>反对因素：{{ suggestion.opposingFactors }}</small></div>
                <M3Button variant="outlined" type="button" :disabled="(project?.candidates.length || 0) >= 5" @click="addAiCandidate(suggestion)"><Plus :size="15" />确认加入</M3Button>
              </article>
            </div>
          </AgentInsightPanel>
          <div class="candidate-grid">
            <M3Card tag="article" v-for="candidate in project?.candidates" :key="candidate.id" class="candidate-card">
              <header>
                <div><span>{{ candidate.sourceType === 'ai' ? 'AI 建议' : '用户确认' }}</span><h3>{{ candidate.name }}</h3></div>
                <div class="card-actions"><M3IconButton label="编辑候选" @click="editCandidate(candidate)"><Pencil :size="16" /></M3IconButton><M3IconButton class="destructive-icon" label="排除候选" @click="removeCandidate(candidate)"><Trash2 :size="16" /></M3IconButton></div>
              </header>
              <dl><div><dt>支持理由</dt><dd>{{ candidate.recommendationReason || '待补充' }}</dd></div><div><dt>反对因素</dt><dd>{{ candidate.opposingFactors || '待补充' }}</dd></div><div><dt>不确定性</dt><dd>{{ candidate.uncertainties || '待验证' }}</dd></div></dl>
              <footer><span>{{ comparisonEvidence(candidate).length }} 条证据 · {{ project?.jobSamples.filter((sample) => sample.candidateId === candidate.id).length || 0 }} 个岗位样本</span><router-link to="/explore?tab=jobs">去收集岗位</router-link></footer>
            </M3Card>
            <M3Card tag="form" v-if="editingCandidateId || (project?.candidates.length || 0) < 5" class="candidate-card add-candidate" @submit.prevent="saveCandidate">
              <div class="form-title-row"><h3>{{ editingCandidateId ? '编辑候选' : '手动添加候选' }}</h3><M3IconButton v-if="editingCandidateId" label="取消编辑" @click="resetCandidateForm"><X :size="17" /></M3IconButton></div>
              <label class="field-label">方向名称<M3TextField v-model="candidateForm.name"  /></label>
              <label class="field-label">支持理由<M3TextArea v-model="candidateForm.recommendationReason" class="small-textarea"></M3TextArea></label>
              <label class="field-label">反对因素<M3TextArea v-model="candidateForm.opposingFactors" class="small-textarea"></M3TextArea></label>
              <label class="field-label">不确定性<M3TextField v-model="candidateForm.uncertainties"  /></label>
              <label class="field-label">验证动作<M3TextField v-model="candidateForm.validationActionsText"  placeholder="用逗号分隔" /></label>
              <M3Button type="submit"><Save v-if="editingCandidateId" :size="16" /><Plus v-else :size="16" />{{ editingCandidateId ? '保存修改' : '加入候选' }}</M3Button>
            </M3Card>
          </div>
          <div class="candidate-rule" :class="{ ready: (project?.candidates.length || 0) >= 2 }"><CircleAlert :size="17" /><span>当前 {{ project?.candidates.length || 0 }} 个候选。进入比较阶段至少需要 2 个，最多 5 个。</span></div>
        </section>

        <section v-else-if="activeStage === 'compare'" class="stage-content compare-stage">
          <div class="stage-heading"><div><span>阶段 4</span><h2>使用同一组标准对比</h2></div><p>分数只用于辅助扫描，文字依据、不确定性和验证动作更重要。</p></div>
          <div class="coach-command-row"><M3Button variant="outlined" type="button" :disabled="comparisonCoachLoading" @click="requestComparisonCoach"><Sparkles :size="16" />{{ comparisonCoachLoading ? '正在比较' : '请 AI 比较候选' }}</M3Button></div>
          <AgentInsightPanel v-if="comparisonCoach" :result="comparisonCoach" title="岗位比较建议">
            <div class="ai-suggestion-list">
              <article v-for="assessment in comparisonCoach.candidateAssessments" :key="assessment.candidateId">
                <div><strong>{{ assessment.candidateName }}<span v-if="assessment.score"> · {{ assessment.score }}/5</span></strong><p>{{ assessment.assessment }}</p><small>不确定性：{{ assessment.uncertainty }}</small></div>
                <M3Button variant="outlined" type="button" @click="applyComparisonAssessment(assessment)"><Save :size="15" />填入草稿</M3Button>
              </article>
            </div>
          </AgentInsightPanel>
          <div class="comparison-table" :style="{ '--candidate-count': String(project?.candidates.length || 2) }">
            <div class="comparison-head"><span>比较维度</span><span v-for="candidate in project?.candidates" :key="candidate.id">{{ candidate.name }}</span></div>
            <div v-for="criterion in project?.criteria" :key="criterion.id" class="criterion-row">
              <div class="criterion-label">
                <strong>{{ criterion.name }}</strong>
                <label class="importance-control">
                  <span>重要度 {{ criterionImportance[criterion.id] || criterion.importance }}/5</span>
                  <M3Slider v-model="criterionImportance[criterion.id]" :min="1" :max="5" :step="1" :disabled="savingCriterionId === criterion.id" :label="`${criterion.name}重要度`" @change="saveCriterionImportance(criterion)" />
                </label>
                <p>{{ criterion.description }}</p>
              </div>
              <div v-for="candidate in project?.candidates" :key="candidate.id" class="comparison-cell">
                <template v-if="comparisonDrafts[comparisonKey(criterion, candidate)]">
                  <label>评价<M3Select v-model.number="comparisonDrafts[comparisonKey(criterion, candidate)]!.score" ><option :value="null">待验证</option><option :value="1">1 很弱</option><option :value="2">2 较弱</option><option :value="3">3 中等</option><option :value="4">4 较强</option><option :value="5">5 很强</option></M3Select></label>
                  <label>依据<M3TextArea v-model="comparisonDrafts[comparisonKey(criterion, candidate)]!.assessment" class="cell-textarea"></M3TextArea></label>
                  <label>关联证据<M3Select v-model="comparisonDrafts[comparisonKey(criterion, candidate)]!.evidenceIds" class="evidence-select" multiple><option v-for="item in comparisonEvidence(candidate)" :key="item.id" :value="item.id">{{ item.title }}</option></M3Select></label>
                  <label>不确定性<M3TextField v-model="comparisonDrafts[comparisonKey(criterion, candidate)]!.uncertainty"  /></label>
                  <label>验证动作<M3TextField v-model="comparisonDrafts[comparisonKey(criterion, candidate)]!.validationAction"  /></label>
                  <M3Button variant="outlined" class="compact" type="button" :disabled="comparisonDrafts[comparisonKey(criterion, candidate)]!.saving" @click="saveComparison(criterion, candidate)"><Save :size="14" />保存</M3Button>
                </template>
              </div>
            </div>
          </div>
        </section>

        <section v-else class="stage-content target-stage">
          <div class="stage-heading"><div><span>阶段 5</span><h2>由你确认主目标与备选目标</h2></div><p>系统和 AI 只能提供建议；目标写入前必须由你明确确认。</p></div>
          <M3Card tag="div" v-if="project?.targets.length" class="decision-summary">
            <Check :size="24" /><div><span>当前主目标</span><h3>{{ project.targets.find((item) => item.targetType === 'primary')?.targetName }}</h3><p>{{ project.targets[0]?.decisionReason }}</p></div>
          </M3Card>
          <M3Card tag="div" class="readiness-panel">
            <header><strong>确认前检查</strong><span>每个候选都需要三类依据</span></header>
            <div v-for="item in decisionReadiness" :key="item.candidate.id" class="readiness-row">
              <strong>{{ item.candidate.name }}</strong>
              <span :class="{ ready: item.evidenceReady }"><Check v-if="item.evidenceReady" :size="14" /><CircleAlert v-else :size="14" />个人/项目证据</span>
              <span :class="{ ready: item.jobsReady }"><Check v-if="item.jobsReady" :size="14" /><CircleAlert v-else :size="14" />真实岗位样本</span>
              <span :class="{ ready: item.comparisonReady }"><Check v-if="item.comparisonReady" :size="14" /><CircleAlert v-else :size="14" />已保存比较</span>
            </div>
          </M3Card>
          <div class="target-form-grid">
            <label class="field-label">主目标<M3Select v-model="targetForm.primaryCandidateId" ><option :value="null" disabled>请选择</option><option v-for="candidate in project?.candidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select></label>
            <label class="field-label">备选目标（可选）<M3Select v-model="targetForm.backupCandidateId" ><option :value="null">不设置</option><option v-for="candidate in project?.candidates.filter((item) => item.id !== targetForm.primaryCandidateId)" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select></label>
            <label class="field-label full-column">选择理由<M3TextArea v-model="targetForm.decisionReason"  placeholder="结合个人证据、岗位样本和比较结果说明"></M3TextArea></label>
            <label class="field-label full-column">主要风险<M3TextArea v-model="targetForm.mainRisks"  placeholder="仍然存在什么反对理由或不确定性"></M3TextArea></label>
            <label class="field-label">下次复查日期<M3DatePicker v-model="targetForm.reviewDate" /></label>
            <label class="confirm-choice"><M3Checkbox v-model="targetForm.confirmed" label="确认职业目标选择" /><span>我已查看支持理由、反对因素和不确定性，并确认这是我的选择。</span></label>
          </div>
          <div class="target-actions"><M3Button type="button" :disabled="!canConfirmTargets" @click="confirmTargets"><Check :size="17" />确认目标</M3Button><M3Button variant="outlined" v-if="project?.status === 'decided'" type="button" @click="gotoPlan"><ArrowRight :size="17" />生成行动计划</M3Button><M3Button variant="outlined" v-if="project?.status === 'decided'" type="button" :disabled="snapshotLoading" @click="saveDecisionSnapshot"><FileCheck2 :size="17" />{{ savedSnapshotVersion ? `已保存快照 v${savedSnapshotVersion}` : snapshotLoading ? '正在保存' : '保存决策快照' }}</M3Button></div>
        </section>

        <footer v-if="activeStage !== 'target'" class="stage-actions">
          <M3Button variant="outlined" type="button" :disabled="activeStageIndex === 0" @click="activeStage = stages[activeStageIndex - 1]?.id || activeStage"><ArrowLeft :size="16" />查看上一步</M3Button>
          <div><M3Button variant="outlined" v-if="activeStage === 'clarify'" type="button" :disabled="saving" @click="saveProject"><Save :size="16" />仅保存</M3Button><M3Button type="button" @click="advance">保存并继续<ArrowRight :size="16" /></M3Button></div>
        </footer>
      </main>
    </div>
  </div>
</template>

<style scoped>
.workspace-shell { width: min(1240px, calc(100% - 48px)); margin: 0 auto; padding: 24px 0 72px; }
.workspace-header { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.workspace-header > div > span, .stage-heading span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.workspace-header h1 { margin: 3px 0 0; font-size: var(--md-sys-typescale-title-large-size); }
.header-meta { display: flex; gap: 6px; }
.header-meta span { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); padding: 5px 8px; font-size: var(--md-sys-typescale-label-small-size); }
.stage-nav { display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; margin: 22px 0 14px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); overflow: hidden; background: var(--md-sys-color-outline-variant); }
.stage-nav > * { min-height: 64px; }
.stage-nav > .done { color: var(--career-sys-color-success); }
.stage-nav span { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; border: 1px solid currentColor; border-radius: var(--md-sys-shape-corner-full); }
.stage-nav strong { font-size: var(--md-sys-typescale-body-medium-size); }
.stage-panel { min-height: 560px; border-radius: var(--md-sys-shape-corner-medium); padding: 28px; background: var(--md-sys-color-surface-container-low); }
.stage-content { display: grid; gap: 26px; }
.stage-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.stage-heading h2 { margin: 5px 0 0; font-size: var(--md-sys-typescale-title-large-size); }
.stage-heading > p { max-width: 520px; margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; text-align: right; }
.coach-command-row { display: flex; justify-content: flex-end; }
.ai-suggestion-list { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.ai-suggestion-list article { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 13px 0; background: var(--md-sys-color-surface-container-lowest); }
.ai-suggestion-list article > div { display: grid; gap: 4px; min-width: 0; }
.ai-suggestion-list article p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.ai-suggestion-list article small { color: var(--md-sys-color-on-surface-variant); }
.ai-suggestion-list article strong span { color: var(--career-sys-color-info); }
.form-grid { display: grid; gap: 16px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full-column { grid-column: 1 / -1; }
.split-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
.evidence-list { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.profile-reference { display: grid; gap: 10px; border-top: 1px solid var(--md-sys-color-outline-variant); border-bottom: 1px solid var(--md-sys-color-outline-variant); padding: 16px 0; }
.profile-reference > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.profile-reference > header div { display: grid; gap: 4px; }
.profile-reference > header span, .profile-reference-list article span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.profile-reference-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px 18px; background: var(--md-sys-color-outline-variant); }
.profile-reference-list article { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; background: var(--md-sys-color-surface-container-lowest); padding: 11px 0; }
.profile-reference-list article > div { display: grid; min-width: 0; gap: 4px; }
.profile-reference-list article strong, .profile-reference-list article p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-reference-list article p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.evidence-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; background: var(--md-sys-color-surface-container-lowest); padding: 16px 0; }
.evidence-row > div:first-child { display: grid; gap: 6px; }
.evidence-row span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.evidence-row p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.evidence-aside { display: flex; align-items: center; gap: 10px; }
.destructive-icon { --md-icon-button-icon-color: var(--md-sys-color-error); }
.card-actions { display: flex; align-items: flex-start; gap: 8px; }
.form-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.form-title-row h3 { margin: 0; }
.side-form { display: grid; gap: 14px; padding: 18px; }
.side-form h3, .add-candidate h3 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.small-textarea { min-height: 76px; }
.empty-copy { padding: 30px; background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface-variant); text-align: center; }
.candidate-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.candidate-card { display: grid; gap: 14px; padding: 18px; }
.candidate-card header { display: flex; justify-content: space-between; gap: 12px; }
.candidate-card header span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.candidate-card h3 { margin: 3px 0 0; }
.candidate-card dl { display: grid; gap: 10px; margin: 0; }
.candidate-card dl div { display: grid; grid-template-columns: 72px 1fr; gap: 8px; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; }
.candidate-card dt { color: var(--md-sys-color-on-surface-variant); }.candidate-card dd { margin: 0; }
.candidate-card footer { display: flex; justify-content: space-between; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 12px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.candidate-card footer a { color: var(--md-sys-color-primary); text-decoration: none; }
.add-candidate { align-content: start; background: color-mix(in srgb, var(--md-sys-color-surface-container) 45%, var(--md-sys-color-surface-container-lowest)); }
.candidate-rule { display: flex; align-items: center; gap: 8px; border-left: 3px solid var(--md-sys-color-tertiary); background: color-mix(in srgb, var(--md-sys-color-tertiary) 8%, var(--md-sys-color-surface-container-lowest)); padding: 13px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-medium-size); }
.candidate-rule.ready { border-left-color: var(--career-sys-color-success); }
.comparison-table { min-width: 900px; border: 1px solid var(--md-sys-color-outline-variant); }
.compare-stage { overflow-x: auto; }
.comparison-head, .criterion-row { display: grid; grid-template-columns: 180px repeat(var(--candidate-count, 2), minmax(260px, 1fr)); }
.comparison-head { position: sticky; top: 0; z-index: 1; background: var(--md-sys-color-surface-container); }
.comparison-head span { padding: 13px; border-right: 1px solid var(--md-sys-color-outline-variant); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.criterion-row { border-top: 1px solid var(--md-sys-color-outline-variant); }
.criterion-label, .comparison-cell { padding: 14px; border-right: 1px solid var(--md-sys-color-outline-variant); }
.criterion-label { display: flex; flex-direction: column; gap: 5px; background: color-mix(in srgb, var(--md-sys-color-surface-container) 45%, var(--md-sys-color-surface-container-lowest)); }
.criterion-label span, .criterion-label p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); line-height: 1.45; }
.importance-control { display: grid; gap: 5px; margin: 4px 0; }
.importance-control > :last-child { width: 100%; }
.comparison-cell { display: grid; gap: 9px; }
.comparison-cell label { display: grid; gap: 4px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.cell-textarea { min-height: 70px; }
.evidence-select { min-height: 70px; padding: 5px; }
.decision-summary { display: flex; align-items: flex-start; gap: 14px; border-left: 4px solid var(--career-sys-color-success); padding: 18px; color: var(--career-sys-color-success); }
.decision-summary span { font-size: var(--md-sys-typescale-label-small-size); }.decision-summary h3 { margin: 3px 0; color: var(--md-sys-color-on-surface); }.decision-summary p { margin: 0; color: var(--md-sys-color-on-surface-variant); }
.readiness-panel { overflow: hidden; }
.readiness-panel header, .readiness-row { display: grid; grid-template-columns: minmax(140px, 1fr) repeat(3, minmax(130px, auto)); align-items: center; gap: 12px; padding: 12px 16px; }
.readiness-panel header { background: var(--md-sys-color-surface-container); }
.readiness-panel header span { grid-column: 2 / -1; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.readiness-row { border-top: 1px solid var(--md-sys-color-outline-variant); }
.readiness-row > span { display: inline-flex; align-items: center; gap: 5px; color: var(--md-sys-color-error); font-size: var(--md-sys-typescale-label-small-size); }
.readiness-row > span.ready { color: var(--career-sys-color-success); }
.target-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.confirm-choice { display: flex; align-items: flex-start; gap: 9px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); padding: 13px; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.5; cursor: pointer; }
.target-actions, .stage-actions, .stage-actions > div { display: flex; align-items: center; gap: 10px; }
.target-actions { flex-wrap: wrap; }
.stage-actions { justify-content: space-between; margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--md-sys-color-outline-variant); }
@media (max-width: 900px) { .split-layout { grid-template-columns: 1fr; } .candidate-grid, .profile-reference-list { grid-template-columns: 1fr; } .stage-heading { align-items: flex-start; flex-direction: column; } .stage-heading > p { max-width: none; text-align: left; } .stage-nav strong { display: none; } }
@media (max-width: 680px) { .workspace-shell { width: min(100% - 24px, 1240px); } .workspace-header { grid-template-columns: 48px 1fr; } .header-meta { grid-column: 2; } .stage-nav > * { min-height: 50px; } .stage-panel { padding: 20px 15px; } .stage-heading { align-items: flex-start; flex-direction: column; } .stage-heading > p { text-align: left; } .two-columns, .target-form-grid { grid-template-columns: 1fr; } .full-column { grid-column: auto; } .target-actions, .stage-actions { align-items: stretch; flex-direction: column; } .target-actions > * { width: 100%; } .stage-actions > div { justify-content: flex-end; } .ai-suggestion-list article { align-items: stretch; flex-direction: column; } .readiness-panel header, .readiness-row { grid-template-columns: 1fr; } .readiness-panel header span { grid-column: auto; } }
</style>
