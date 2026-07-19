<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowLeft, ArrowRight, BookOpenCheck, BriefcaseBusiness, Check, CircleAlert,
  FileCheck2, GitCompareArrows, Info, Lightbulb, Pencil, Plus, Save, Search,
  Sparkles, Target, Trash2, UserRoundSearch, X
} from 'lucide-vue-next'
import { m3Confirm, m3Message } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import AgentInsightPanel from '@/components/AgentInsightPanel.vue'
import DecisionTagInput from '@/components/DecisionTagInput.vue'
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
  addProjectJobSampleApi,
  confirmDecisionTargetsApi,
  createDecisionProjectApi,
  getDecisionJourneyApi,
  getDecisionProjectApi,
  moveDecisionStageApi,
  removeDecisionCandidateApi,
  removeDecisionEvidenceApi,
  removeProjectJobSampleApi,
  saveComparisonResultsBatchApi,
  updateDecisionCandidateApi,
  updateDecisionEvidenceApi,
  updateDecisionProjectApi,
  type ComparisonCriterion,
  type ComparisonVerdict,
  type DecisionCandidate,
  type DecisionJourney,
  type DecisionJourneyStage,
  type DecisionProject,
  type DecisionStage
} from '@/api/decisionProjects'
import {
  getCareerDirectionApi,
  getCareerDirectionInsightsApi,
  listCareerDirectionsApi,
  type CareerDirection,
  type CareerDirectionInsights
} from '@/api/careerDirections'
import {
  listCareerDirectionJobsApi,
  listJobsApi,
  type JobInfo
} from '@/api/jobs'
import { listPersonalEvidenceApi, type PersonalEvidence } from '@/api/personalEvidence'
import { getProfileApi, type UserProfile } from '@/api/profile'
import { listMbtiHistoryApi, type MbtiHistoryItem } from '@/api/mbti'
import { createDecisionSnapshotApi } from '@/api/report'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/utils/formDraft'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'DecisionProjectWorkspacePage' })

type ResourceMode = 'overview' | 'evidence' | 'jobs' | 'notes'
type ComparisonDraft = {
  verdict: ComparisonVerdict
  assessment: string
  evidenceIds: number[]
  uncertainty: string
  validationAction: string
  saving: boolean
}

type ProfileEvidenceSuggestion = {
  key: string
  title: string
  detail: string
  sourceType: 'profile' | 'assessment'
  credibility: 'low' | 'medium'
}

type DirectionSuggestion = {
  key: string
  directionId: number | null
  name: string
  sourceType: 'profile' | 'catalog'
  description: string
}

const route = useRoute()
const router = useRouter()
const project = ref<DecisionProject | null>(null)
const journey = ref<DecisionJourney | null>(null)
const loading = ref(false)
const saving = ref(false)
const activeStage = ref<DecisionStage>('brief')
const personalEvidence = ref<PersonalEvidence[]>([])
const careerDirections = ref<CareerDirection[]>([])
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
const titleEdited = ref(false)
const editingEvidenceId = ref<number | null>(null)
const editingCandidateId = ref<number | null>(null)
const comparisonSaving = ref(false)
const summaryExpanded = ref(false)
const addingMoreCandidates = ref(false)
const resourceSheetElement = ref<HTMLElement | null>(null)
let resourceSheetTrigger: HTMLElement | null = null

const projectForm = reactive({
  title: '',
  question: '',
  decisionDeadline: '',
  background: '',
  triggerReason: '',
  priorities: [] as string[],
  mustHaves: [] as string[],
  dealBreakers: [] as string[]
})

const evidenceForm = reactive({
  personalEvidenceId: null as number | null,
  candidateId: null as number | null,
  title: '',
  detail: '',
  credibility: 'medium' as 'low' | 'medium' | 'high',
  stance: 'neutral' as 'support' | 'oppose' | 'neutral',
  saveToProfile: false
})

const candidateForm = reactive({
  directionId: null as number | null,
  name: '',
  recommendationReason: '',
  opposingFactors: '',
  uncertainties: '',
  validationActions: [] as string[],
  sourceType: 'user' as 'user' | 'ai' | 'catalog' | 'profile'
})

const targetForm = reactive({
  primaryCandidateId: null as number | null,
  backupCandidateId: null as number | null,
  decisionReason: '',
  mainRisks: '',
  reviewDate: '',
  verificationStatus: 'provisional' as 'provisional' | 'verified',
  confirmed: false
})

const comparisonDrafts = reactive<Record<string, ComparisonDraft>>({})
const resourceSheet = reactive({ open: false, mode: 'overview' as ResourceMode, candidateId: null as number | null })
const sheetDirection = ref<CareerDirection | null>(null)
const sheetInsights = ref<CareerDirectionInsights | null>(null)
const sheetJobs = ref<JobInfo[]>([])
const sheetLoading = ref(false)
const jobKeyword = ref('')

const draftUserId = getStoredUser()?.id
const projectId = computed(() => {
  const id = Number(route.params.id)
  return Number.isFinite(id) && id > 0 ? id : null
})
const isNew = computed(() => !projectId.value)
const draftScope = () => `decision-project-v2-${projectId.value ?? 'new'}`

const stages: Array<{ id: DecisionStage; label: string; help: string; icon: typeof FileCheck2 }> = [
  { id: 'brief', label: '先说说你在考虑什么', help: '说明困惑、时间和在意的事情', icon: FileCheck2 },
  { id: 'candidates', label: '看看有哪些选择', help: '保留两三个想进一步了解的方向', icon: Target },
  { id: 'validate', label: '多了解一些', help: '把经历和真实岗位放到方向旁边', icon: BookOpenCheck },
  { id: 'compare', label: '放在一起看看', help: '只关注真正影响选择的差异', icon: GitCompareArrows },
  { id: 'commit', label: '决定下一步先试什么', help: '选择一个方向并安排回看时间', icon: Check }
]

const normalizeDecisionStage = (stage?: string | null): DecisionStage => ({
  clarify: 'brief',
  evidence: 'validate',
  target: 'commit'
}[stage || ''] as DecisionStage | undefined) ?? (stages.some((item) => item.id === stage) ? stage as DecisionStage : 'brief')

const activeStageIndex = computed(() => Math.max(0, stages.findIndex((item) => item.id === activeStage.value)))
const currentStageIndex = computed(() => Math.max(0, stages.findIndex((item) => item.id === normalizeDecisionStage(project.value?.currentStage))))
const sheetCandidate = computed(() => project.value?.candidates.find((item) => item.id === resourceSheet.candidateId) ?? null)
const comparisonCriteria = computed(() => {
  const criteria = [...(project.value?.criteria ?? [])]
  const hardConditions = criteria
    .filter((item) => item.criterionKind === 'must_have' || item.criterionKind === 'deal_breaker')
    .sort((left, right) => left.sortOrder - right.sortOrder)
  const briefPriorities = criteria
    .filter((item) => item.criterionKind === 'priority' && item.sourceType === 'brief')
    .sort((left, right) => right.importance - left.importance || left.sortOrder - right.sortOrder)
    .slice(0, 3)
  const priorities = briefPriorities.length ? briefPriorities : criteria
    .filter((item) => item.criterionKind === 'priority' || item.criterionKind === 'legacy' || !item.criterionKind)
    .sort((left, right) => right.importance - left.importance || left.sortOrder - right.sortOrder)
    .slice(0, 3)
  return [...hardConditions, ...priorities.filter((item) => !hardConditions.some((hard) => hard.id === item.id))]
})
const comparisonKey = (criterionId: number, candidateId: number) => `${criterionId}:${candidateId}`

const candidateEvidence = (candidate: DecisionCandidate) => project.value?.evidence.filter((item) =>
  item.candidateId === null || item.candidateId === candidate.id
) ?? []
const candidateJobs = (candidate: DecisionCandidate) => project.value?.jobSamples.filter((item) => item.candidateId === candidate.id) ?? []

const readiness = computed(() => (project.value?.candidates ?? []).map((candidate) => {
  const serverState = journey.value?.candidates.find((item) => item.candidateId === candidate.id)
  const evidenceCount = serverState?.evidenceCount ?? candidateEvidence(candidate).length
  const jobCount = serverState?.jobSampleCount ?? candidateJobs(candidate).length
  const hasOpenQuestion = !!candidate.uncertainties?.trim() && candidate.validationActions.length > 0
  const comparisonCount = serverState?.comparisonCount ?? project.value?.criteria.reduce((count, criterion) =>
    count + (criterion.results.some((item) => item.candidateId === candidate.id && item.confirmedAt) ? 1 : 0), 0
  ) ?? 0
  const comparisonReady = comparisonCount > 0
  return {
    candidate,
    evidenceCount,
    jobCount,
    hasOpenQuestion,
    comparisonReady,
    understood: evidenceCount > 0 || jobCount > 0 || hasOpenQuestion,
    verified: evidenceCount > 0 && jobCount > 0 && comparisonCount >= 3
  }
}))

const briefReady = computed(() => !!projectForm.question.trim() && !!projectForm.decisionDeadline && projectForm.priorities.length > 0)
const candidatesReady = computed(() => (project.value?.candidates.length ?? 0) >= 2)
const candidateCount = computed(() => project.value?.candidates.length ?? 0)
const showCandidateEntry = computed(() => candidateCount.value < 3 || addingMoreCandidates.value)
const validationReady = computed(() => readiness.value.length >= 2 && readiness.value.every((item) => item.understood))
const comparisonReady = computed(() => journey.value?.stages.find((item) => item.code === 'compare')?.complete
  ?? (readiness.value.length >= 2 && readiness.value.every((item) => item.comparisonReady)))
const verifiedTargetReady = computed(() => journey.value?.canVerify
  ?? (readiness.value.length >= 2 && readiness.value.every((item) => item.verified)))

const journeyComplete = (code: DecisionJourneyStage, fallback: boolean) =>
  journey.value?.stages.find((item) => item.code === code)?.complete ?? fallback
const stageState = computed(() => ({
  brief: journeyComplete('brief', briefReady.value),
  candidates: journeyComplete('candidates', candidatesReady.value),
  validate: journeyComplete('validate', validationReady.value),
  compare: journeyComplete('compare', comparisonReady.value),
  commit: journeyComplete('commit', !!project.value?.targets.length)
}))

const nextSuggestion = computed(() => {
  if (journey.value?.nextSteps[0]) return journey.value.nextSteps[0]
  if (!briefReady.value) return '先把想解决的问题、时间和最在意的事情写清楚。'
  if (!candidatesReady.value) return '再选一个方向，放在一起才更容易看清差别。'
  const firstUnknown = readiness.value.find((item) => !item.understood)
  if (firstUnknown) return `可以先为“${firstUnknown.candidate.name}”补一段经历、一个真实岗位，或写下准备怎么了解。`
  const firstUncompared = readiness.value.find((item) => !item.comparisonReady)
  if (firstUncompared) return `已经有一些资料了，接下来看看“${firstUncompared.candidate.name}”整体是否适合目前的你。`
  if (!project.value?.targets.length) return '资料已经放在一起，可以先选一个方向试一段时间。'
  return '方向已经保存。到回看日期时，再根据新的经历和岗位信息调整。'
})

const stageCanAdvance = computed(() => {
  if (activeStage.value === 'brief') return briefReady.value
  if (activeStage.value === 'candidates') return candidatesReady.value
  if (activeStage.value === 'validate') return validationReady.value
  if (activeStage.value === 'compare') return (project.value?.candidates.length ?? 0) >= 2
  return false
})

const profileEvidenceSuggestions = computed<ProfileEvidenceSuggestion[]>(() => {
  const suggestions: ProfileEvidenceSuggestion[] = []
  userProfile.value?.experiences.slice(0, 6).forEach((experience, index) => suggestions.push({
    key: `profile:experience:${index}`,
    title: experience.slice(0, 80),
    detail: experience,
    sourceType: 'profile',
    credibility: 'medium'
  }))
  userProfile.value?.skills.slice(0, 8).forEach((skill, index) => suggestions.push({
    key: `profile:skill:${index}`,
    title: `我学过或用过 ${skill}`,
    detail: `个人资料中写有“${skill}”。如果有课程、项目或作品，可以稍后补充。`,
    sourceType: 'profile',
    credibility: 'low'
  }))
  const latestMbti = mbtiHistory.value[0]
  if (latestMbti) suggestions.push({
    key: `assessment:mbti:${latestMbti.id}`,
    title: `${latestMbti.type} 带来的偏好线索`,
    detail: `${latestMbti.description}。这只是一条了解自己的线索，不会替你决定职业。`,
    sourceType: 'assessment',
    credibility: 'low'
  })
  const used = new Set(project.value?.evidence
    .filter((item) => item.candidateId === resourceSheet.candidateId)
    .map((item) => item.sourceRef)
    .filter(Boolean))
  return suggestions.filter((item) => !used.has(item.key))
})

const personalEvidenceUsed = (id: number) => project.value?.evidence.some((item) =>
  item.candidateId === resourceSheet.candidateId && item.personalEvidenceId === id
) ?? false

const normalizeDirectionName = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, '')
const directionSuggestions = computed<DirectionSuggestion[]>(() => {
  const selectedNames = new Set((project.value?.candidates ?? []).map((item) => normalizeDirectionName(item.name)))
  const suggestions: DirectionSuggestion[] = []
  const addedNames = new Set<string>()
  const catalogByName = new Map(careerDirections.value.map((item) => [normalizeDirectionName(item.name), item]))
  const add = (suggestion: DirectionSuggestion) => {
    const normalized = normalizeDirectionName(suggestion.name)
    if (!normalized || selectedNames.has(normalized) || addedNames.has(normalized)) return
    addedNames.add(normalized)
    suggestions.push(suggestion)
  }

  const profileNames = [
    ...(userProfile.value?.existingDirections ?? []),
    userProfile.value?.targetRole ?? ''
  ]
  for (const name of profileNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    const direction = catalogByName.get(normalizeDirectionName(trimmed))
    add({
      key: `profile:${normalizeDirectionName(trimmed)}`,
      directionId: direction?.id ?? null,
      name: direction?.name ?? trimmed,
      sourceType: 'profile',
      description: direction ? `个人资料里提到过 · ${direction.category}` : '个人资料里提到过，可以先作为自己的方向了解'
    })
  }

  for (const direction of [...careerDirections.value].sort((left, right) => Number(right.favorite) - Number(left.favorite))) {
    add({
      key: `catalog:${direction.id}`,
      directionId: direction.id,
      name: direction.name,
      sourceType: 'catalog',
      description: direction.summary || `来自职业方向目录 · ${direction.category}`
    })
  }
  return suggestions.slice(0, 8)
})

const deriveTitle = (question: string) => question
  .replace(/[？?。！!]/g, '')
  .trim()
  .slice(0, 36) || '我的职业方向思考'

const verdictFromScore = (score: number | null | undefined): ComparisonVerdict => {
  if (score === null || score === undefined) return 'unknown'
  if (score >= 4) return 'good_fit'
  if (score === 3) return 'trade_off'
  return 'poor_fit'
}

const defaultVerdict = (criterion: ComparisonCriterion): ComparisonVerdict => {
  if (criterion.criterionKind === 'deal_breaker') return 'unknown'
  if (criterion.criterionKind === 'must_have') return 'unknown'
  return 'unknown'
}

const verdictOptions = (criterion: ComparisonCriterion): Array<{ value: ComparisonVerdict; label: string }> => {
  if (criterion.criterionKind === 'must_have') return [
    { value: 'meets', label: '符合' },
    { value: 'partial', label: '还差一点' },
    { value: 'does_not_meet', label: '不太符合' },
    { value: 'unknown', label: '还不知道' }
  ]
  if (criterion.criterionKind === 'deal_breaker') return [
    { value: 'not_found', label: '没有发现' },
    { value: 'needs_attention', label: '需要留意' },
    { value: 'present', label: '已经出现' },
    { value: 'unknown', label: '还不知道' }
  ]
  return [
    { value: 'good_fit', label: '比较合适' },
    { value: 'trade_off', label: '各有利弊' },
    { value: 'poor_fit', label: '不太合适' },
    { value: 'unknown', label: '还不知道' }
  ]
}

const criterionGroupLabel = (criterion: ComparisonCriterion) => {
  if (criterion.criterionKind === 'must_have') return '对你来说一定要有'
  if (criterion.criterionKind === 'deal_breaker') return '你不太能接受'
  return '你比较在意'
}

const comparisonEvidenceSelected = (criterionId: number, candidateId: number, evidenceId: number) =>
  comparisonDrafts[comparisonKey(criterionId, candidateId)]?.evidenceIds.includes(evidenceId) ?? false

const toggleComparisonEvidence = (criterionId: number, candidateId: number, evidenceId: number, selected: boolean) => {
  const draft = comparisonDrafts[comparisonKey(criterionId, candidateId)]
  if (!draft) return
  draft.evidenceIds = selected
    ? Array.from(new Set([...draft.evidenceIds, evidenceId]))
    : draft.evidenceIds.filter((id) => id !== evidenceId)
}

const initializeComparisonDrafts = (data: DecisionProject) => {
  for (const criterion of data.criteria) {
    for (const candidate of data.candidates) {
      const result = criterion.results.find((item) => item.candidateId === candidate.id)
      const evidenceIds = data.evidence
        .filter((item) => item.candidateId === null || item.candidateId === candidate.id)
        .map((item) => item.id)
      comparisonDrafts[comparisonKey(criterion.id, candidate.id)] = {
        verdict: result?.verdict ?? (result ? verdictFromScore(result.score) : defaultVerdict(criterion)),
        assessment: result?.assessment || '',
        evidenceIds: result?.evidenceIds?.length ? [...result.evidenceIds] : evidenceIds,
        uncertainty: result?.uncertainty || candidate.uncertainties || (evidenceIds.length ? '' : '还需要结合真实任务继续了解'),
        validationAction: result?.validationAction || candidate.validationActions[0] || '',
        saving: false
      }
    }
  }
}

const hydrateProject = (data: DecisionProject, keepActiveStage = false) => {
  project.value = data
  projectForm.title = data.title
  projectForm.question = data.question
  projectForm.decisionDeadline = data.decisionDeadline || ''
  projectForm.background = data.background || ''
  projectForm.triggerReason = data.triggerReason || ''
  projectForm.priorities = [...data.priorities]
  projectForm.mustHaves = [...data.mustHaves]
  projectForm.dealBreakers = [...data.dealBreakers]
  if (!keepActiveStage) activeStage.value = normalizeDecisionStage(data.currentStage)
  const primary = data.targets.find((item) => item.targetType === 'primary')
  const backup = data.targets.find((item) => item.targetType === 'backup')
  targetForm.primaryCandidateId = primary?.candidateId || null
  targetForm.backupCandidateId = backup?.candidateId || null
  targetForm.decisionReason = primary?.decisionReason || ''
  targetForm.mainRisks = primary?.mainRisks || ''
  targetForm.reviewDate = primary?.reviewDate || ''
  targetForm.verificationStatus = primary?.verificationStatus || 'provisional'
  targetForm.confirmed = !!primary
  titleEdited.value = !!data.title
  initializeComparisonDrafts(data)
}

type WorkspaceDraft = {
  projectForm: typeof projectForm
  evidenceForm: typeof evidenceForm
  candidateForm: typeof candidateForm
  targetForm: typeof targetForm
  activeStage: DecisionStage
}

const restoreDraft = () => {
  const draft = loadFormDraft<WorkspaceDraft>(draftScope(), draftUserId)
  if (!draft) return
  Object.assign(projectForm, draft.data.projectForm)
  Object.assign(evidenceForm, draft.data.evidenceForm)
  Object.assign(candidateForm, draft.data.candidateForm)
  Object.assign(targetForm, draft.data.targetForm)
  if (draft.data.activeStage) activeStage.value = normalizeDecisionStage(draft.data.activeStage)
}

const discardDraft = async (scope = draftScope()) => {
  draftReady.value = false
  await nextTick()
  clearFormDraft(scope, draftUserId)
  draftReady.value = true
}

const refreshJourney = async (id = project.value?.id) => {
  if (!id) {
    journey.value = null
    return
  }
  try {
    journey.value = await getDecisionJourneyApi(id)
  } catch {
    journey.value = null
  }
}

const load = async () => {
  draftReady.value = false
  loading.value = true
  try {
    if (!projectId.value) {
      restoreDraft()
      return
    }
    const [data, journeyData, evidence, profile, assessments, directions] = await Promise.all([
      getDecisionProjectApi(projectId.value),
      getDecisionJourneyApi(projectId.value).catch(() => null),
      listPersonalEvidenceApi(),
      getProfileApi(),
      listMbtiHistoryApi(),
      listCareerDirectionsApi().catch(() => [])
    ])
    personalEvidence.value = evidence
    careerDirections.value = directions
    userProfile.value = profile
    mbtiHistory.value = assessments
    journey.value = journeyData
    hydrateProject(data)
    restoreDraft()
  } finally {
    draftReady.value = true
    loading.value = false
  }
}

onMounted(async () => {
  if (isNew.value) {
    const [evidence, profile, assessments, directions] = await Promise.all([
      listPersonalEvidenceApi(), getProfileApi(), listMbtiHistoryApi(),
      listCareerDirectionsApi().catch(() => [])
    ])
    personalEvidence.value = evidence
    careerDirections.value = directions
    userProfile.value = profile
    mbtiHistory.value = assessments
  }
  await load()
})

const closeOnEscape = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && resourceSheet.open) closeResourceSheet()
}
onMounted(() => document.addEventListener('keydown', closeOnEscape))
onUnmounted(() => {
  document.removeEventListener('keydown', closeOnEscape)
  document.body.style.overflow = ''
})

watch(() => route.params.id, load)
watch(() => resourceSheet.open, (open) => { document.body.style.overflow = open ? 'hidden' : '' })
watch(candidateCount, (count) => {
  if (count < 3 || count >= 5) addingMoreCandidates.value = false
})
watch(() => projectForm.question, (question) => {
  if (!project.value && !titleEdited.value) projectForm.title = deriveTitle(question)
})
watch([projectForm, evidenceForm, candidateForm, targetForm, activeStage], () => {
  if (!draftReady.value) return
  saveFormDraft(draftScope(), draftUserId, {
    projectForm: { ...projectForm },
    evidenceForm: { ...evidenceForm },
    candidateForm: { ...candidateForm },
    targetForm: { ...targetForm },
    activeStage: activeStage.value
  })
}, { deep: true })

const friendlyError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  if (/version|版本|conflict|409|其他设备更新|服务器上有一份更新/i.test(message)) {
    return '服务器上有一份更新的内容。你刚才填写的内容还保留着，请重新加载后再试一次。'
  }
  if (/网络|连接|超时|服务暂时不可用|network|timeout|service unavailable/i.test(message)) {
    return fallback
  }
  return message || fallback
}

const recoverLatestAfterConflict = async (error: unknown) => {
  const message = error instanceof Error ? error.message : ''
  if (!projectId.value || !/version|版本|conflict|409|其他设备更新|服务器上有一份更新/i.test(message)) return
  await load()
}

const showMutationError = async (error: unknown, fallback: string) => {
  if (error instanceof Error && error.name === 'M3ConfirmCancelledError') return
  await recoverLatestAfterConflict(error)
  m3Message.warning(friendlyError(error, fallback))
}

const saveProject = async () => {
  if (!projectForm.question.trim()) {
    m3Message.warning('先写下你现在最想想清楚的事情。')
    return null
  }
  if (!projectForm.decisionDeadline) {
    m3Message.warning('请选择一个希望回来看看结果的时间。')
    return null
  }
  if (!projectForm.priorities.length) {
    m3Message.warning('至少选一件你比较在意的事情。')
    return null
  }
  saving.value = true
  try {
    const savedScope = draftScope()
    const data = project.value
      ? await updateDecisionProjectApi(project.value.id, {
          title: projectForm.title.trim() || deriveTitle(projectForm.question),
          question: projectForm.question.trim(),
          decisionDeadline: projectForm.decisionDeadline,
          background: projectForm.background.trim() || null,
          triggerReason: projectForm.triggerReason.trim() || null,
          priorities: projectForm.priorities,
          mustHaves: projectForm.mustHaves,
          dealBreakers: projectForm.dealBreakers,
          expectedVersion: project.value.version
        })
      : await createDecisionProjectApi({
          title: projectForm.title.trim() || deriveTitle(projectForm.question),
          question: projectForm.question.trim(),
          decisionDeadline: projectForm.decisionDeadline,
          background: projectForm.background.trim() || null,
          triggerReason: projectForm.triggerReason.trim() || null,
          priorities: projectForm.priorities,
          mustHaves: projectForm.mustHaves,
          dealBreakers: projectForm.dealBreakers
        })
    hydrateProject(data, true)
    await discardDraft(savedScope)
    if (isNew.value) await router.replace(`/decision-projects/${data.id}`)
    m3Message.success('已经保存好了。')
    return data
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '这次还没有保存成功，你填写的内容仍然保留着，可以再试一次。'))
    return null
  } finally {
    saving.value = false
  }
}

const selectStage = (stage: DecisionStage, index: number) => {
  if (!project.value && index > 0) return
  if (index <= currentStageIndex.value) activeStage.value = stage
}

const resetCandidateForm = () => {
  editingCandidateId.value = null
  Object.assign(candidateForm, {
    directionId: null,
    name: '',
    recommendationReason: '',
    opposingFactors: '',
    uncertainties: '',
    validationActions: [],
    sourceType: 'user'
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
    validationActions: [...candidate.validationActions],
    sourceType: candidate.sourceType as 'user' | 'ai' | 'catalog' | 'profile'
  })
}

const saveCandidate = async () => {
  if (!project.value || !candidateForm.name.trim()) {
    m3Message.warning('先写下这个方向的名称。')
    return
  }
  try {
    const payload = {
      directionId: candidateForm.directionId,
      name: candidateForm.name.trim(),
      recommendationReason: candidateForm.recommendationReason.trim() || null,
      opposingFactors: candidateForm.opposingFactors.trim() || null,
      uncertainties: candidateForm.uncertainties.trim() || null,
      validationActions: candidateForm.validationActions,
      sourceType: candidateForm.sourceType,
      expectedVersion: project.value.version
    }
    const data = editingCandidateId.value
      ? await updateDecisionCandidateApi(project.value.id, editingCandidateId.value, payload)
      : await addDecisionCandidateApi(project.value.id, payload)
    hydrateProject(data, true)
    await refreshJourney(data.id)
    const wasEditing = editingCandidateId.value !== null
    resetCandidateForm()
    if (resourceSheet.open) resourceSheet.open = false
    m3Message.success(wasEditing ? '这个方向的补充内容已保存。' : '已经把这个方向放进来了。')
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '这次还没有保存成功，可以稍后再试。'))
  }
}

const removeCandidate = async (candidate: DecisionCandidate) => {
  if (!project.value) return
  try {
    await m3Confirm(
      `移除“${candidate.name}”后，和它关联的内容也会离开这次思考。`,
      '要移除这个方向吗？',
      { confirmButtonText: '移除', cancelButtonText: '先保留', type: 'warning' }
    )
    const data = await removeDecisionCandidateApi(project.value.id, candidate.id, project.value.version)
    hydrateProject(data, true)
    await refreshJourney(data.id)
  } catch (error) {
    await showMutationError(error, '这个方向暂时没有移除，你可以稍后再试。')
  }
}

const addAiCandidate = async (suggestion: CandidateSuggestion) => {
  if (!project.value) return
  try {
    const data = await addDecisionCandidateApi(project.value.id, {
      directionId: suggestion.directionId,
      name: suggestion.name,
      recommendationReason: suggestion.recommendationReason,
      opposingFactors: suggestion.opposingFactors,
      uncertainties: suggestion.uncertainties,
      validationActions: suggestion.validationActions,
      sourceType: 'ai',
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    m3Message.success('已经加入。你可以继续修改，不需要照单全收。')
  } catch (error) {
    await showMutationError(error, '这个方向暂时没有加入，你可以稍后再试。')
  }
}

const addDirectionSuggestion = async (suggestion: DirectionSuggestion) => {
  if (!project.value) return
  try {
    const data = await addDecisionCandidateApi(project.value.id, {
      directionId: suggestion.directionId,
      name: suggestion.name,
      sourceType: suggestion.sourceType,
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    m3Message.success('已经放进这次思考里了。')
  } catch (error) {
    await showMutationError(error, '这个方向暂时没有加入，你可以稍后再试。')
  }
}

const requestDecisionCoach = async () => {
  if (!project.value) return
  coachLoading.value = true
  try {
    decisionCoach.value = await coachDecisionApi(project.value.id)
  } catch (error) {
    m3Message.warning(friendlyError(error, '这次没有拿到建议，你仍然可以自己添加方向。'))
  } finally {
    coachLoading.value = false
  }
}

const resetEvidenceForm = (candidateId = resourceSheet.candidateId) => {
  editingEvidenceId.value = null
  Object.assign(evidenceForm, {
    personalEvidenceId: null,
    candidateId,
    title: '',
    detail: '',
    credibility: 'medium',
    stance: 'neutral',
    saveToProfile: false
  })
}

const editEvidence = (item: DecisionProject['evidence'][number]) => {
  editingEvidenceId.value = item.id
  Object.assign(evidenceForm, {
    personalEvidenceId: item.personalEvidenceId,
    candidateId: item.candidateId,
    title: item.title,
    detail: item.detail || '',
    credibility: item.credibility,
    stance: item.stance,
    saveToProfile: false
  })
}

const saveEvidence = async () => {
  if (!project.value || !evidenceForm.title.trim()) {
    m3Message.warning('先用一句话写下这段经历或信息。')
    return
  }
  try {
    const payload = {
      candidateId: evidenceForm.candidateId,
      personalEvidenceId: evidenceForm.personalEvidenceId,
      title: evidenceForm.title.trim(),
      detail: evidenceForm.detail.trim() || null,
      sourceType: evidenceForm.personalEvidenceId ? 'profile' : 'user',
      credibility: evidenceForm.credibility,
      stance: evidenceForm.stance,
      syncToProfile: !editingEvidenceId.value && evidenceForm.saveToProfile,
      expectedVersion: project.value.version
    }
    const data = editingEvidenceId.value
      ? await updateDecisionEvidenceApi(project.value.id, editingEvidenceId.value, payload)
      : await addDecisionEvidenceApi(project.value.id, payload)
    hydrateProject(data, true)
    if (evidenceForm.saveToProfile) personalEvidence.value = await listPersonalEvidenceApi()
    await refreshJourney(data.id)
    const wasEditing = editingEvidenceId.value !== null
    resetEvidenceForm()
    m3Message.success(wasEditing ? '已经更新。' : '这条内容已经放到方向旁边了。')
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '这次还没有保存成功，你填写的内容仍然保留着。'))
  }
}

const addPersonalEvidence = async (item: PersonalEvidence) => {
  if (!project.value || !sheetCandidate.value) return
  try {
    const data = await addDecisionEvidenceApi(project.value.id, {
      candidateId: sheetCandidate.value.id,
      personalEvidenceId: item.id,
      title: item.title,
      detail: item.description,
      sourceType: item.sourceType,
      credibility: item.credibility,
      stance: 'support',
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    m3Message.success('已经引用到这个方向。')
  } catch (error) {
    await showMutationError(error, '这段经历暂时没有引用成功，可以再试一次。')
  }
}

const addProfileSuggestion = async (item: ProfileEvidenceSuggestion) => {
  if (!project.value || !sheetCandidate.value) return
  try {
    const data = await addDecisionEvidenceApi(project.value.id, {
      candidateId: sheetCandidate.value.id,
      title: item.title,
      detail: item.detail,
      sourceType: item.sourceType,
      sourceRef: item.key,
      credibility: item.credibility,
      stance: 'neutral',
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    m3Message.success('已经放到这个方向旁边，你可以继续补充。')
  } catch (error) {
    await showMutationError(error, '这条信息暂时没有引用成功，可以再试一次。')
  }
}

const removeEvidence = async (id: number) => {
  if (!project.value) return
  try {
    const data = await removeDecisionEvidenceApi(project.value.id, id, project.value.version)
    hydrateProject(data, true)
    await refreshJourney(data.id)
    if (editingEvidenceId.value === id) resetEvidenceForm()
  } catch (error) {
    await showMutationError(error, '这条内容暂时没有移除，可以再试一次。')
  }
}

const loadSheetResources = async () => {
  const candidate = sheetCandidate.value
  if (!candidate) return
  sheetLoading.value = true
  try {
    if (resourceSheet.mode === 'overview') {
      sheetDirection.value = candidate.directionId ? await getCareerDirectionApi(candidate.directionId) : null
      sheetInsights.value = candidate.directionId ? await getCareerDirectionInsightsApi(candidate.directionId) : null
    }
    if (resourceSheet.mode === 'jobs') {
      if (candidate.directionId && !jobKeyword.value.trim()) {
        const result = await listCareerDirectionJobsApi(candidate.directionId, 1, 20)
        sheetJobs.value = result.list.map((item) => item.job)
      } else {
        const result = await listJobsApi({ keyword: jobKeyword.value.trim() || candidate.name, page: 1, pageSize: 20 })
        sheetJobs.value = result.list
      }
    }
  } catch (error) {
    m3Message.warning(friendlyError(error, '这部分资料暂时没有加载出来，可以稍后再试。'))
  } finally {
    sheetLoading.value = false
  }
}

const openResourceSheet = async (candidate: DecisionCandidate, mode: ResourceMode) => {
  resourceSheetTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  resourceSheet.candidateId = candidate.id
  resourceSheet.mode = mode
  resourceSheet.open = true
  jobKeyword.value = ''
  sheetDirection.value = null
  sheetInsights.value = null
  sheetJobs.value = []
  resetEvidenceForm(candidate.id)
  if (mode === 'notes') editCandidate(candidate)
  await loadSheetResources()
  await nextTick()
  resourceSheetElement.value?.querySelector<HTMLElement>('md-icon-button, md-text-button, md-outlined-button')?.focus()
}

const changeResourceMode = async (mode: ResourceMode) => {
  resourceSheet.mode = mode
  if (mode === 'notes' && sheetCandidate.value) editCandidate(sheetCandidate.value)
  if (mode === 'evidence') resetEvidenceForm(resourceSheet.candidateId)
  await loadSheetResources()
}

const closeResourceSheet = () => {
  resourceSheet.open = false
  resetEvidenceForm(null)
  resetCandidateForm()
  nextTick(() => resourceSheetTrigger?.focus())
}

const keepSheetFocusInside = (event: KeyboardEvent) => {
  if (event.key !== 'Tab' || !resourceSheetElement.value) return
  const focusable = Array.from(resourceSheetElement.value.querySelectorAll<HTMLElement>(
    'md-icon-button:not([disabled]), md-text-button:not([disabled]), md-filled-button:not([disabled]), md-outlined-button:not([disabled]), md-outlined-text-field:not([disabled]), select:not([disabled]), md-checkbox:not([disabled]), md-radio:not([disabled]), summary'
  ))
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

const addJobSample = async (job: JobInfo) => {
  if (!project.value || !sheetCandidate.value) return
  try {
    const data = await addProjectJobSampleApi(project.value.id, {
      candidateId: sheetCandidate.value.id,
      jobId: job.id,
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    m3Message.success('这份真实岗位已经放到方向旁边了。')
  } catch (error) {
    await showMutationError(error, '这份岗位暂时没有放进来，可以再试一次。')
  }
}

const removeJobSample = async (sampleId: number) => {
  if (!project.value) return
  try {
    const data = await removeProjectJobSampleApi(project.value.id, sampleId, project.value.version)
    hydrateProject(data, true)
    await refreshJourney(data.id)
  } catch (error) {
    await showMutationError(error, '这份岗位暂时没有移除，可以再试一次。')
  }
}

const isJobAdded = (jobId: number) => sheetCandidate.value
  ? candidateJobs(sheetCandidate.value).some((item) => item.jobId === jobId)
  : false

const requestComparisonCoach = async () => {
  if (!project.value) return
  comparisonCoachLoading.value = true
  try {
    comparisonCoach.value = await suggestJobComparisonApi(project.value.id)
  } catch (error) {
    m3Message.warning(friendlyError(error, '这次没有拿到整理建议，你仍然可以根据已有资料继续。'))
  } finally {
    comparisonCoachLoading.value = false
  }
}

const applyComparisonAssessment = (assessment: CandidateAssessment) => {
  const criterion = comparisonCriteria.value.find((item) => item.criterionKind === 'priority') ?? comparisonCriteria.value[0]
  if (!criterion) return
  const draft = comparisonDrafts[comparisonKey(criterion.id, assessment.candidateId)]
  if (!draft) return
  const scoreVerdict = verdictFromScore(assessment.score)
  draft.verdict = criterion.criterionKind === 'must_have'
    ? (scoreVerdict === 'good_fit' ? 'meets' : scoreVerdict === 'trade_off' ? 'partial' : 'does_not_meet')
    : criterion.criterionKind === 'deal_breaker'
      ? (scoreVerdict === 'good_fit' ? 'not_found' : scoreVerdict === 'trade_off' ? 'needs_attention' : 'present')
      : scoreVerdict
  draft.assessment = assessment.assessment
  draft.uncertainty = assessment.uncertainty
  draft.validationAction = assessment.validationAction
  m3Message.success('已经填入草稿，请按自己的判断修改后再保存。')
}

const saveOverallComparisons = async (quiet = false) => {
  if (!project.value || !comparisonCriteria.value.length) {
    m3Message.warning('比较内容还没有准备好，请重新加载后再试。')
    return null
  }
  for (const candidate of project.value.candidates) {
    for (const criterion of comparisonCriteria.value) {
      const draft = comparisonDrafts[comparisonKey(criterion.id, candidate.id)]
      if (!draft) continue
      if (!draft.evidenceIds.length && !draft.assessment.trim() && !draft.uncertainty.trim() && !draft.validationAction.trim()) {
        m3Message.warning(`“${candidate.name}”关于“${criterion.name}”还没有参考信息。可以写下目前还不清楚的地方。`)
        return null
      }
    }
  }
  comparisonSaving.value = true
  try {
    const results = project.value.candidates.flatMap((candidate) => comparisonCriteria.value.map((criterion) => {
      const draft = comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!
      return {
        criterionId: criterion.id,
        candidateId: candidate.id,
        verdict: draft.verdict,
        assessment: draft.assessment.trim() || null,
        evidenceIds: draft.evidenceIds,
        uncertainty: draft.uncertainty.trim() || null,
        validationAction: draft.validationAction.trim() || null,
        confirmed: true
      }
    }))
    const latest = await saveComparisonResultsBatchApi(project.value.id, {
      results,
      expectedVersion: project.value.version
    })
    hydrateProject(latest, true)
    await refreshJourney(latest.id)
    if (!quiet) m3Message.success('已经把这次对照保存好了。')
    return latest
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '这次还没有保存成功，你填写的内容仍然保留着。'))
    return null
  } finally {
    comparisonSaving.value = false
  }
}

const advance = async () => {
  if (!stageCanAdvance.value) {
    m3Message.warning(nextSuggestion.value)
    return
  }
  let data = project.value
  if (activeStage.value === 'brief') data = await saveProject()
  if (activeStage.value === 'compare') data = await saveOverallComparisons(true)
  if (!data) return
  const next = stages[activeStageIndex.value + 1]
  if (!next) return
  try {
    if (activeStageIndex.value + 1 <= currentStageIndex.value) {
      activeStage.value = next.id
      return
    }
    const updated = await moveDecisionStageApi(data.id, next.id, data.version)
    hydrateProject(updated)
    await refreshJourney(updated.id)
    activeStage.value = next.id
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '还差一点就能继续了，请看看页面上的提示。'))
  }
}

const confirmTargets = async () => {
  if (!project.value || !targetForm.primaryCandidateId || !targetForm.decisionReason.trim()) {
    m3Message.warning('请选择目前更想尝试的方向，并写下一句理由。')
    return
  }
  if (!targetForm.reviewDate) {
    m3Message.warning('请选择一个回来看看结果的日期。')
    return
  }
  if (journey.value && !journey.value.canSaveProvisional) {
    m3Message.warning(journey.value.nextSteps[0] || '先把前面的方向放在一起看一遍，再保存这次选择。')
    return
  }
  if (targetForm.verificationStatus === 'verified' && (!targetForm.backupCandidateId || !verifiedTargetReady.value)) {
    m3Message.warning('要标记为“已经比较了解”，主方向和备选方向都需要一段相关经历、一份真实岗位和已保存的对照。你也可以先保存为“目前想先试试”。')
    return
  }
  if (!targetForm.confirmed) {
    m3Message.warning('请确认这是你目前愿意先尝试的方向。')
    return
  }
  try {
    const data = await confirmDecisionTargetsApi(project.value.id, {
      primaryCandidateId: targetForm.primaryCandidateId,
      backupCandidateId: targetForm.backupCandidateId,
      decisionReason: targetForm.decisionReason.trim(),
      mainRisks: targetForm.mainRisks.trim() || null,
      reviewDate: targetForm.reviewDate,
      verificationStatus: targetForm.verificationStatus,
      confirmed: true,
      expectedVersion: project.value.version
    })
    hydrateProject(data, true)
    await refreshJourney(data.id)
    await discardDraft()
    m3Message.success(targetForm.verificationStatus === 'verified' ? '方向已经确认，可以开始正式行动计划。' : '已经保存为先试试的方向，可以安排一段短期了解计划。')
  } catch (error) {
    await recoverLatestAfterConflict(error)
    m3Message.warning(friendlyError(error, '这次还没有保存成功，你的选择仍然保留着。'))
  }
}

const saveDecisionSnapshot = async () => {
  if (!project.value?.targets.length) return
  snapshotLoading.value = true
  snapshotRequestId.value ||= `decision-snapshot-${project.value.id}-${crypto.randomUUID()}`
  try {
    const snapshot = await createDecisionSnapshotApi(project.value.id, snapshotRequestId.value)
    savedSnapshotVersion.value = snapshot.snapshotVersion || null
    snapshotRequestId.value = null
    m3Message.success('这次选择的记录已经保存。')
  } finally {
    snapshotLoading.value = false
  }
}

const gotoPlan = () => {
  const planType = targetForm.verificationStatus === 'verified' ? 'action' : 'validation'
  router.push(`/action-plans/new?projectId=${project.value?.id}&planType=${planType}`)
}
</script>

<template>
  <div class="product-page">
    <div class="workspace-shell">
      <header class="workspace-header">
        <M3IconButton class="back-button" label="返回我的决策" @click="router.push('/decision-projects')">
          <ArrowLeft :size="19" />
        </M3IconButton>
        <div class="workspace-title">
          <span>{{ project ? '这次职业方向思考' : '开始一次新的思考' }}</span>
          <h1>{{ project?.title || projectForm.title || '先从一个具体问题开始' }}</h1>
          <p>不用一次填得很完整，先写下现在知道的，之后随时可以回来补充。</p>
        </div>
        <div v-if="project" class="header-meta">
          <span v-if="project.current">正在进行</span>
          <span>已自动保留草稿</span>
        </div>
      </header>

      <nav class="stage-nav" aria-label="这次思考的步骤">
        <M3Button
          v-for="(stage, index) in stages"
          :key="stage.id"
          class="stage-button"
          variant="text"
          type="button"
          data-magnetic-radius="var(--md-sys-shape-corner-none)"
          :data-stage="stage.id"
          :disabled="(!project && index > 0) || index > currentStageIndex"
          :aria-current="activeStage === stage.id ? 'step' : undefined"
          :class="{ active: activeStage === stage.id, done: stageState[stage.id] && index < currentStageIndex }"
          @click="selectStage(stage.id, index)"
        >
          <span class="stage-mark">
            <Check v-if="stageState[stage.id] && index < currentStageIndex" :size="15" />
            <component :is="stage.icon" v-else :size="16" />
          </span>
          <span class="stage-copy"><strong>{{ stage.label }}</strong><small>{{ stage.help }}</small></span>
        </M3Button>
      </nav>

      <div class="workspace-grid">
        <main class="stage-panel loading-host">
          <M3ProgressOverlay :visible="loading" label="正在打开这次思考" />

          <Transition name="stage-fade" mode="out-in">
            <section v-if="activeStage === 'brief'" key="brief" class="stage-content">
              <div class="stage-heading">
                <div><span>第 1 步</span><h2>先说说你在考虑什么</h2></div>
                <p>这些内容会一直出现在右侧，后面的方向、岗位和选择都会围绕它展开。</p>
              </div>

              <div class="form-grid two-columns">
                <label class="field-block full-column">
                  <span>你现在最想想清楚什么？ *</span>
                  <small>尽量写成一个可以在一段时间后回答的问题。</small>
                  <M3TextArea v-model="projectForm.question" placeholder="例如：未来三个月，我应该先尝试 AI Agent 应用开发，还是 Java 后端开发？" />
                </label>
                <label class="field-block">
                  <span>希望什么时候有一个初步答案？ *</span>
                  <small>到这一天回来看看，不代表必须马上做最终决定。</small>
                  <M3DatePicker v-model="projectForm.decisionDeadline" />
                </label>
                <label class="field-block">
                  <span>给这次思考起个名字（可选）</span>
                  <small>我们会根据上面的问题自动填写，你也可以修改。</small>
                  <M3TextField v-model="projectForm.title" placeholder="例如：先尝试哪个开发方向" @input="titleEdited = true" />
                </label>
                <label class="field-block full-column">
                  <span>为什么最近开始考虑这件事？（可选）</span>
                  <small>比如临近实习、上完一门课，或发现自己对某类工作更感兴趣。</small>
                  <M3TextArea v-model="projectForm.triggerReason" placeholder="例如：准备暑期实习，想先集中时间做一个能展示的项目。" />
                </label>
                <label class="field-block full-column">
                  <span>还有哪些情况可能影响你的选择？（可以以后再补）</span>
                  <small>可以写已有技能、课程、时间、城市或家庭安排，不需要重复填写完整个人资料。</small>
                  <M3TextArea v-model="projectForm.background" placeholder="例如：学过 Java 和 Python；每周可以投入 8 小时；希望先在杭州找实习。" />
                </label>

                <DecisionTagInput
                  v-model="projectForm.priorities"
                  class="full-column"
                  label="选择方向时，你更在意什么？"
                  hint="这些事情可以有取舍。排在前面的，会在后面对照时优先出现。"
                  :suggestions="['能做出作品', '学习过程有兴趣', '实习岗位较多', '成长空间', '工作稳定', '收入预期']"
                  :max-items="4"
                  required
                />
                <DecisionTagInput
                  v-model="projectForm.mustHaves"
                  label="哪些事情对你来说一定要有？"
                  hint="如果暂时没有明确的硬条件，可以先留空。"
                  :suggestions="['能在三个月内入门', '有真实岗位可以参考', '能积累作品']"
                  :max-items="5"
                />
                <DecisionTagInput
                  v-model="projectForm.dealBreakers"
                  label="有哪些情况是你不太能接受的？"
                  hint="出现这些情况时，你通常不会把它作为目前的主方向。"
                  :suggestions="['长期高频出差', '需要立即搬家', '几乎没有实践机会']"
                  :max-items="5"
                />
              </div>
            </section>

            <section v-else-if="activeStage === 'candidates'" key="candidates" class="stage-content">
              <div class="stage-heading">
                <div><span>第 2 步</span><h2>看看有哪些选择</h2></div>
                <p>先留下 2～3 个你真的愿意了解的方向。具体理由和资料放到下一步再慢慢补。</p>
              </div>

              <div class="candidate-toolbar">
                <div>
                  <strong>现在有 {{ project?.candidates.length || 0 }} 个方向</strong>
                  <span>至少 2 个，默认建议 2～3 个；确实需要时最多可以放 5 个。</span>
                </div>
                <div class="candidate-toolbar-actions">
                  <M3Button v-if="candidateCount >= 3 && candidateCount < 5 && !addingMoreCandidates" variant="outlined" type="button" @click="addingMoreCandidates = true">
                    <Plus :size="16" />添加更多
                  </M3Button>
                  <M3Button variant="outlined" type="button" :disabled="coachLoading" @click="requestDecisionCoach">
                    <Sparkles :size="16" />{{ coachLoading ? '正在整理' : '请穗奈帮我想想' }}
                  </M3Button>
                </div>
              </div>

              <AgentInsightPanel v-if="decisionCoach" :result="decisionCoach" title="可以参考的方向">
                <div v-if="decisionCoach.candidateSuggestions.length" class="ai-suggestion-list">
                  <article v-for="suggestion in decisionCoach.candidateSuggestions" :key="suggestion.name">
                    <div><strong>{{ suggestion.name }}</strong><p>{{ suggestion.recommendationReason }}</p></div>
                    <M3Button
                      variant="outlined"
                      type="button"
                      :disabled="candidateCount >= 5 || !showCandidateEntry"
                      @click="addAiCandidate(suggestion)"
                    ><Plus :size="15" />加入看看</M3Button>
                  </article>
                </div>
              </AgentInsightPanel>

              <section v-if="directionSuggestions.length && showCandidateEntry" class="direction-suggestions" aria-label="根据个人资料和方向目录提供的选择">
                <header><div><strong>也可以从已有资料里选</strong><span>先看个人资料里提到过的方向，再看看方向目录；不需要启用 AI。</span></div></header>
                <div class="direction-suggestion-list">
                  <M3Button
                    v-for="suggestion in directionSuggestions"
                    :key="suggestion.key"
                    variant="outlined"
                    type="button"
                    :disabled="candidateCount >= 5"
                    @click="addDirectionSuggestion(suggestion)"
                  >
                    <span><strong>{{ suggestion.name }}</strong><small>{{ suggestion.description }}</small></span><Plus :size="15" />
                  </M3Button>
                </div>
              </section>

              <div class="candidate-grid">
                <M3Card v-for="(candidate, index) in project?.candidates" :key="candidate.id" tag="article" class="candidate-card">
                  <header>
                    <span class="candidate-number">{{ index + 1 }}</span>
                    <div><small>{{ candidate.sourceType === 'ai' ? '由穗奈建议，已经过你确认' : candidate.sourceType === 'profile' ? '来自个人资料' : candidate.directionId ? '来自职业方向库' : '你添加的方向' }}</small><h3>{{ candidate.name }}</h3></div>
                    <M3IconButton label="移除这个方向" class="destructive-icon" @click="removeCandidate(candidate)"><Trash2 :size="16" /></M3IconButton>
                  </header>
                  <p>{{ candidate.recommendationReason || '下一步会把你的经历和真实岗位放到这里，帮助你更具体地了解它。' }}</p>
                  <footer><span>{{ candidateEvidence(candidate).length }} 段相关内容 · {{ candidateJobs(candidate).length }} 份真实岗位</span></footer>
                </M3Card>

                <M3Card v-if="candidateCount < 5 && showCandidateEntry" tag="form" class="candidate-card add-candidate" @submit.prevent="saveCandidate">
                  <div><small>再放进一个选择</small><h3>你还在考虑什么方向？</h3></div>
                  <label class="field-block">
                    <span>方向名称</span>
                    <M3TextField v-model="candidateForm.name" placeholder="例如：AI Agent 应用开发" />
                  </label>
                  <p>先写名称就可以，支持理由、顾虑和想了解的事情会在下一步补充。</p>
                  <M3Button type="submit"><Plus :size="16" />加入这个方向</M3Button>
                </M3Card>
              </div>

              <div class="gentle-notice" :class="{ ready: candidatesReady }">
                <Check v-if="candidatesReady" :size="18" /><CircleAlert v-else :size="18" />
                <span>{{ candidatesReady ? '已经可以继续。后面会分别了解这些方向，不需要现在就选出答案。' : '再添加一个方向后，就可以把它们放在一起了解。' }}</span>
              </div>
            </section>

            <section v-else-if="activeStage === 'validate'" key="validate" class="stage-content">
              <div class="stage-heading">
                <div><span>第 3 步</span><h2>多了解一些</h2></div>
                <p>不需要离开当前页面。为每个方向看看自己的经历、真实岗位，以及还有什么不太清楚。</p>
              </div>

              <div class="understanding-list">
                <M3Card v-for="item in readiness" :key="item.candidate.id" tag="article" class="understanding-card">
                  <header>
                    <div><small>正在了解</small><h3>{{ item.candidate.name }}</h3></div>
                    <span :class="['understanding-state', { ready: item.understood }]">{{ item.understood ? '已经有一些了解' : '可以从任意一项开始' }}</span>
                  </header>
                  <div class="understanding-columns">
                    <M3Button class="understanding-action" variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-medium)" @click="openResourceSheet(item.candidate, 'evidence')">
                      <UserRoundSearch :size="20" /><span><strong>我有哪些相关经历</strong><small>{{ item.evidenceCount ? `${item.evidenceCount} 段已经放进来` : '从个人资料引用，或写一段新的' }}</small></span><ArrowRight :size="17" />
                    </M3Button>
                    <M3Button class="understanding-action" variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-medium)" @click="openResourceSheet(item.candidate, 'jobs')">
                      <BriefcaseBusiness :size="20" /><span><strong>真实岗位通常在找什么</strong><small>{{ item.jobCount ? `${item.jobCount} 份岗位已经看过` : '查看真实 JD，不用跳去其他页面' }}</small></span><ArrowRight :size="17" />
                    </M3Button>
                    <M3Button class="understanding-action" variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-medium)" @click="openResourceSheet(item.candidate, 'overview')">
                      <Info :size="20" /><span><strong>这个方向平时做什么</strong><small>{{ item.candidate.directionId ? '看看常见工作、技能和岗位分布' : '这是自定义方向，可以先补充自己的理解' }}</small></span><ArrowRight :size="17" />
                    </M3Button>
                    <M3Button class="understanding-action" variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-medium)" @click="openResourceSheet(item.candidate, 'notes')">
                      <Lightbulb :size="20" /><span><strong>哪些地方合适、哪里还不清楚</strong><small>{{ item.hasOpenQuestion ? '已经写下准备了解的事情' : '记录现在的感受和下一步小动作' }}</small></span><ArrowRight :size="17" />
                    </M3Button>
                  </div>
                  <div v-if="item.candidate.uncertainties || item.candidate.validationActions.length" class="candidate-question">
                    <strong>接下来可以怎么了解</strong>
                    <p>{{ item.candidate.validationActions.join('；') || item.candidate.uncertainties }}</p>
                  </div>
                </M3Card>
              </div>

              <div class="gentle-notice" :class="{ ready: validationReady }">
                <Check v-if="validationReady" :size="18" /><CircleAlert v-else :size="18" />
                <span>{{ validationReady ? '每个方向都有了可以参考的内容。还不知道的地方会带到下一步，不需要为了继续而编造答案。' : '每个方向只要放入一段经历、一份岗位，或明确写下准备怎么了解，就可以继续。' }}</span>
              </div>
            </section>

            <section v-else-if="activeStage === 'compare'" key="compare" class="stage-content">
              <div class="stage-heading">
                <div><span>第 4 步</span><h2>放在一起看看</h2></div>
                <p>不再逐格打分。系统先整理已有内容，你只需要确认整体感受、参考信息和还想了解的地方。</p>
              </div>

              <div class="decision-principles">
                <div><strong>你更在意</strong><span v-if="projectForm.priorities.length">{{ projectForm.priorities.join(' · ') }}</span><span v-else>还没有填写</span></div>
                <div><strong>对你来说一定要有</strong><span v-if="projectForm.mustHaves.length">{{ projectForm.mustHaves.join(' · ') }}</span><span v-else>目前没有设置硬条件</span></div>
                <div><strong>你不太能接受</strong><span v-if="projectForm.dealBreakers.length">{{ projectForm.dealBreakers.join(' · ') }}</span><span v-else>目前没有设置</span></div>
              </div>

              <div class="candidate-toolbar compare-toolbar">
                <div><strong>先看系统整理，再按自己的感觉修改</strong><span>穗奈不会给方向排名，也不会替你做决定。</span></div>
                <M3Button variant="outlined" type="button" :disabled="comparisonCoachLoading" @click="requestComparisonCoach">
                  <Sparkles :size="16" />{{ comparisonCoachLoading ? '正在整理' : '请穗奈帮我整理' }}
                </M3Button>
              </div>

              <AgentInsightPanel v-if="comparisonCoach" :result="comparisonCoach" title="可编辑的整理建议">
                <div class="ai-suggestion-list">
                  <article v-for="assessment in comparisonCoach.candidateAssessments" :key="assessment.candidateId">
                    <div><strong>{{ assessment.candidateName }}</strong><p>{{ assessment.assessment }}</p></div>
                    <M3Button variant="outlined" type="button" @click="applyComparisonAssessment(assessment)"><Pencil :size="15" />填入草稿</M3Button>
                  </article>
                </div>
              </AgentInsightPanel>

              <div class="overall-comparison-grid">
                <M3Card v-for="candidate in project?.candidates" :key="candidate.id" tag="article" class="overall-card">
                  <header><div><small>综合看看</small><h3>{{ candidate.name }}</h3></div><span>{{ candidateEvidence(candidate).length }} 段经历 · {{ candidateJobs(candidate).length }} 份岗位</span></header>
                  <div class="criterion-checks">
                    <section v-for="criterion in comparisonCriteria" :key="criterion.id" class="criterion-check">
                      <template v-if="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]">
                        <div class="criterion-title"><span>{{ criterionGroupLabel(criterion) }}</span><strong>{{ criterion.name }}</strong></div>
                        <label class="field-block">
                          <span>根据现在知道的情况</span>
                          <M3Select v-model="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!.verdict">
                            <option v-for="option in verdictOptions(criterion)" :key="option.value" :value="option.value">{{ option.label }}</option>
                          </M3Select>
                        </label>
                        <details class="comparison-more" :open="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!.verdict === 'unknown'">
                          <summary>参考信息和还不清楚的地方</summary>
                          <label class="field-block"><span>为什么会有这个感觉？（可选）</span><M3TextArea v-model="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!.assessment" placeholder="用自己的话写一句即可。" /></label>
                          <fieldset class="evidence-choices" data-magnetic-exclude>
                            <legend>主要参考了什么？</legend>
                            <label v-for="evidence in candidateEvidence(candidate)" :key="evidence.id"><M3Checkbox :model-value="comparisonEvidenceSelected(criterion.id, candidate.id, evidence.id)" :label="`参考：${evidence.title}`" @update:model-value="toggleComparisonEvidence(criterion.id, candidate.id, evidence.id, $event)" /><span>{{ evidence.title }}</span></label>
                            <p v-if="!candidateEvidence(candidate).length">暂时没有相关经历也没关系，可以把下面还想了解的事情写清楚。</p>
                          </fieldset>
                          <label class="field-block"><span>还不太清楚的地方</span><M3TextArea v-model="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!.uncertainty" placeholder="例如：实际工作中写代码和沟通各占多少时间？" /></label>
                          <label class="field-block"><span>接下来可以做的一件小事</span><M3TextField v-model="comparisonDrafts[comparisonKey(criterion.id, candidate.id)]!.validationAction" placeholder="例如：找 3 份岗位看看共同要求" /></label>
                        </details>
                      </template>
                    </section>
                  </div>
                </M3Card>
              </div>
            </section>

            <section v-else key="commit" class="stage-content target-stage">
              <div class="stage-heading">
                <div><span>第 5 步</span><h2>决定下一步先试什么</h2></div>
                <p>这不是一锤定音。你可以先试一段时间，到约定日期再带着新信息回来看看。</p>
              </div>

              <M3Card v-if="project?.targets.length" tag="div" class="saved-choice">
                <Check :size="24" />
                <div><span>目前先尝试</span><h3>{{ project.targets.find((item) => item.targetType === 'primary')?.targetName }}</h3><p>{{ project.targets[0]?.decisionReason }}</p></div>
              </M3Card>

              <fieldset class="choice-level" data-magnetic-exclude>
                <legend>你希望把这次选择保存成哪种状态？</legend>
                <label :class="{ selected: targetForm.verificationStatus === 'provisional' }">
                  <M3Radio v-model="targetForm.verificationStatus" value="provisional" name="target-state" label="目前想先试试" @update:model-value="targetForm.confirmed = false" />
                  <span><strong>目前想先试试</strong><small>信息还不完整，但已经可以安排 2～4 周的小计划继续了解。</small></span>
                </label>
                <label :class="{ selected: targetForm.verificationStatus === 'verified' }">
                  <M3Radio v-model="targetForm.verificationStatus" value="verified" name="target-state" label="已经比较了解" @update:model-value="targetForm.confirmed = false" />
                  <span><strong>已经比较了解</strong><small>主方向和备选方向都有相关经历、真实岗位和已经确认的对照。</small></span>
                </label>
              </fieldset>

              <M3Card tag="div" class="readiness-panel">
                <header><strong>目前了解到哪里了</strong><span>没有完成的内容可以以后再补</span></header>
                <div v-for="item in readiness" :key="item.candidate.id" class="readiness-row">
                  <strong>{{ item.candidate.name }}</strong>
                  <span :class="{ ready: item.evidenceCount > 0 }"><Check v-if="item.evidenceCount" :size="14" /><CircleAlert v-else :size="14" />{{ item.evidenceCount ? '有相关经历' : '还可补一段经历' }}</span>
                  <span :class="{ ready: item.jobCount > 0 }"><Check v-if="item.jobCount" :size="14" /><CircleAlert v-else :size="14" />{{ item.jobCount ? '看过真实岗位' : '还可看一份岗位' }}</span>
                  <span :class="{ ready: item.comparisonReady }"><Check v-if="item.comparisonReady" :size="14" /><CircleAlert v-else :size="14" />{{ item.comparisonReady ? '已经放在一起看过' : '还没有保存对照' }}</span>
                </div>
              </M3Card>

              <div class="target-form-grid">
                <label class="field-block">
                  <span>目前更想先试试哪个方向？ *</span>
                  <M3Select v-model="targetForm.primaryCandidateId" @change="targetForm.confirmed = false"><option :value="null" disabled>请选择</option><option v-for="candidate in project?.candidates" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select>
                </label>
                <label class="field-block">
                  <span>还想保留哪个备选方向？</span>
                  <M3Select v-model="targetForm.backupCandidateId" @change="targetForm.confirmed = false"><option :value="null">暂时不设置</option><option v-for="candidate in project?.candidates.filter((item) => item.id !== targetForm.primaryCandidateId)" :key="candidate.id" :value="candidate.id">{{ candidate.name }}</option></M3Select>
                </label>
                <label class="field-block full-column">
                  <span>为什么目前更想先试这个？ *</span>
                  <small>不用写成正式报告，用自己的话说明最重要的一两个原因即可。</small>
                  <M3TextArea v-model="targetForm.decisionReason" placeholder="例如：我已经有一个相关项目，也找到不少实习岗位，先用四周做一个更完整的作品看看。" />
                </label>
                <label class="field-block full-column">
                  <span>有哪些地方仍需要留意？（可以以后再补）</span>
                  <M3TextArea v-model="targetForm.mainRisks" placeholder="例如：还不确定自己是否喜欢长期做工程调试，也需要补一些系统基础。" />
                </label>
                <label class="field-block">
                  <span>准备什么时候回来看看？ *</span>
                  <M3DatePicker v-model="targetForm.reviewDate" />
                </label>
                <label class="confirm-choice">
                  <M3Checkbox v-model="targetForm.confirmed" label="确认这是我目前愿意先尝试的方向" />
                  <span>之后仍然可以根据新的经历和岗位信息调整。</span>
                </label>
              </div>

              <div class="target-actions">
                <M3Button type="button" @click="confirmTargets"><Check :size="17" />保存这次选择</M3Button>
                <M3Button v-if="project?.targets.length" variant="outlined" type="button" @click="gotoPlan"><ArrowRight :size="17" />{{ targetForm.verificationStatus === 'verified' ? '生成正式行动计划' : '安排一段了解计划' }}</M3Button>
                <M3Button v-if="project?.targets.length" variant="text" type="button" :disabled="snapshotLoading" @click="saveDecisionSnapshot"><FileCheck2 :size="17" />{{ savedSnapshotVersion ? `记录已保存 v${savedSnapshotVersion}` : snapshotLoading ? '正在保存' : '保存这次选择的记录' }}</M3Button>
              </div>
            </section>
          </Transition>

          <footer v-if="activeStage !== 'commit'" class="stage-actions">
            <M3Button variant="text" type="button" :disabled="activeStageIndex === 0" @click="activeStage = stages[activeStageIndex - 1]?.id || activeStage"><ArrowLeft :size="16" />看看上一步</M3Button>
            <M3Button type="button" :disabled="saving || comparisonSaving || !stageCanAdvance" @click="advance">
              {{ activeStage === 'compare' ? '保存并决定下一步' : '保存并看看下一步' }}<ArrowRight :size="16" />
            </M3Button>
          </footer>
        </main>

        <aside class="journey-summary" aria-label="这次思考的情况">
          <div class="summary-heading"><span>这次思考的情况</span><strong>{{ project?.title || projectForm.title || '还没有起名字' }}</strong></div>
          <M3Button class="summary-toggle" variant="text" type="button" :aria-expanded="summaryExpanded" @click="summaryExpanded = !summaryExpanded">{{ summaryExpanded ? '收起详情' : '展开详情' }}<ArrowRight :size="15" :class="{ rotated: summaryExpanded }" /></M3Button>
          <div class="summary-body" :class="{ expanded: summaryExpanded }">
            <dl>
              <div><dt>想弄清楚</dt><dd>{{ projectForm.question || '还没有填写' }}</dd></div>
              <div><dt>回来看看</dt><dd>{{ projectForm.decisionDeadline || '还没有选择日期' }}</dd></div>
              <div><dt>正在考虑</dt><dd>{{ project?.candidates.length ? project.candidates.map((item) => item.name).join('、') : '还没有加入方向' }}</dd></div>
              <div><dt>已经放入</dt><dd>{{ project?.evidence.length || 0 }} 段经历或信息 · {{ project?.jobSamples.length || 0 }} 份真实岗位</dd></div>
            </dl>
            <div class="summary-next"><Lightbulb :size="18" /><div><strong>接下来可以做</strong><p>{{ nextSuggestion }}</p></div></div>
            <ol class="summary-progress">
              <li v-for="(stage, index) in stages" :key="stage.id" :class="{ active: activeStage === stage.id, done: stageState[stage.id] }">
                <span><Check v-if="stageState[stage.id]" :size="13" />{{ stageState[stage.id] ? '' : index + 1 }}</span>{{ stage.label }}
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="sheet-fade">
        <div v-if="resourceSheet.open" class="resource-sheet-layer" @mousedown.self="closeResourceSheet">
          <section ref="resourceSheetElement" class="resource-sheet" role="dialog" aria-modal="true" :aria-label="`${sheetCandidate?.name || ''} 的补充资料`" @keydown="keepSheetFocusInside">
            <header class="resource-sheet-header">
              <div><small>不离开这次思考</small><h2>{{ sheetCandidate?.name }}</h2></div>
              <M3IconButton label="关闭" @click="closeResourceSheet"><X :size="19" /></M3IconButton>
            </header>
            <nav class="resource-tabs" aria-label="可以补充的内容">
              <M3Button variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-none)" :class="{ active: resourceSheet.mode === 'overview' }" @click="changeResourceMode('overview')">方向介绍</M3Button>
              <M3Button variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-none)" :class="{ active: resourceSheet.mode === 'evidence' }" @click="changeResourceMode('evidence')">我的经历</M3Button>
              <M3Button variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-none)" :class="{ active: resourceSheet.mode === 'jobs' }" @click="changeResourceMode('jobs')">真实岗位</M3Button>
              <M3Button variant="text" type="button" data-magnetic-radius="var(--md-sys-shape-corner-none)" :class="{ active: resourceSheet.mode === 'notes' }" @click="changeResourceMode('notes')">我的想法</M3Button>
            </nav>
            <div class="resource-sheet-body loading-host">
              <M3ProgressOverlay :visible="sheetLoading" label="正在整理资料" />

              <div v-if="resourceSheet.mode === 'overview'" class="sheet-section">
                <template v-if="sheetDirection">
                  <div class="sheet-intro"><span>{{ sheetDirection.category }}</span><h3>{{ sheetDirection.name }}</h3><p>{{ sheetDirection.summary }}</p></div>
                  <section><h4>平时可能会做什么</h4><ul><li v-for="item in sheetDirection.typicalWork" :key="item">{{ item }}</li></ul></section>
                  <section><h4>常见技能</h4><div class="plain-tags"><span v-for="item in sheetDirection.commonSkills" :key="item">{{ item }}</span></div></section>
                  <section v-if="sheetInsights"><h4>来自 {{ sheetInsights.sampleCount }} 份真实岗位的概况</h4><p>常见技能：{{ sheetInsights.topSkills.slice(0, 5).map((item) => `${item.label} ${item.ratio}%`).join('、') || '暂时没有足够样本' }}</p><p>常见城市：{{ sheetInsights.cities.slice(0, 4).map((item) => item.label).join('、') || '暂时没有足够样本' }}</p></section>
                </template>
                <div v-else class="sheet-empty"><Info :size="28" /><h3>这是你自己添加的方向</h3><p>目录里暂时没有完整介绍。你可以先到“我的想法”写下目前的理解，再从“真实岗位”寻找具体信息。</p></div>
              </div>

              <div v-else-if="resourceSheet.mode === 'evidence'" class="sheet-section">
                <section v-if="personalEvidence.length || profileEvidenceSuggestions.length">
                  <h3>从已有资料里选</h3><p class="section-help">只引用和这个方向有关的内容；原来的个人资料不会被改动。</p>
                  <div class="resource-list">
                    <article v-for="item in personalEvidence" :key="`personal-${item.id}`"><div><strong>{{ item.title }}</strong><p>{{ item.description || '没有补充说明' }}</p></div><M3Button variant="outlined" class="compact" type="button" :disabled="personalEvidenceUsed(item.id)" @click="addPersonalEvidence(item)"><Plus v-if="!personalEvidenceUsed(item.id)" :size="14" />{{ personalEvidenceUsed(item.id) ? '已经引用' : '引用' }}</M3Button></article>
                    <article v-for="item in profileEvidenceSuggestions" :key="item.key"><div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p></div><M3Button variant="outlined" class="compact" type="button" @click="addProfileSuggestion(item)"><Plus :size="14" />引用</M3Button></article>
                  </div>
                </section>
                <section>
                  <h3>已经放到这个方向旁边</h3>
                  <div v-if="sheetCandidate && candidateEvidence(sheetCandidate).length" class="resource-list selected-resources">
                    <article v-for="item in candidateEvidence(sheetCandidate)" :key="item.id"><div><strong>{{ item.title }}</strong><p>{{ item.detail || '没有补充说明' }}</p></div><span class="row-actions"><M3IconButton label="编辑" @click="editEvidence(item)"><Pencil :size="15" /></M3IconButton><M3IconButton label="移除" class="destructive-icon" @click="removeEvidence(item.id)"><Trash2 :size="15" /></M3IconButton></span></article>
                  </div>
                  <p v-else class="sheet-empty-copy">还没有放入内容。这不会影响你先看看其他资料。</p>
                </section>
                <form class="sheet-form" @submit.prevent="saveEvidence">
                  <h3>{{ editingEvidenceId ? '修改这段内容' : '写下一段新的经历或信息' }}</h3>
                  <label class="field-block"><span>用一句话概括</span><M3TextField v-model="evidenceForm.title" placeholder="例如：完成过一个带工具调用的 Agent 小项目" /></label>
                  <label class="field-block"><span>再补充一点（可选）</span><M3TextArea v-model="evidenceForm.detail" placeholder="你做了什么、得到什么结果，或这条信息来自哪里。" /></label>
                  <div class="form-grid two-columns"><label class="field-block"><span>这条内容有多确定</span><M3Select v-model="evidenceForm.credibility"><option value="high">有作品、结果或可靠来源</option><option value="medium">亲自做过或有较清楚的信息</option><option value="low">目前只是印象或线索</option></M3Select></label><label class="field-block"><span>它对这个方向意味着什么</span><M3Select v-model="evidenceForm.stance"><option value="support">看起来比较合适</option><option value="neutral">暂时只是参考</option><option value="oppose">有一些需要留意</option></M3Select></label></div>
                  <label v-if="!editingEvidenceId && !evidenceForm.personalEvidenceId" class="inline-check"><M3Checkbox v-model="evidenceForm.saveToProfile" label="同时保存到我的个人资料" /><span>默认关闭；勾选后以后也可以在其他项目中引用。</span></label>
                  <div class="sheet-form-actions"><M3Button v-if="editingEvidenceId" variant="text" type="button" @click="resetEvidenceForm()">取消修改</M3Button><M3Button type="submit"><Save :size="15" />{{ editingEvidenceId ? '保存修改' : '保存这段内容' }}</M3Button></div>
                </form>
              </div>

              <div v-else-if="resourceSheet.mode === 'jobs'" class="sheet-section">
                <form class="job-search" data-magnetic-exclude @submit.prevent="loadSheetResources"><M3TextField v-model="jobKeyword" placeholder="搜索岗位名称、公司或技能" aria-label="搜索真实岗位" /><M3Button type="submit"><Search :size="16" />搜索</M3Button></form>
                <section>
                  <h3>已经看过并放进来的岗位</h3>
                  <div v-if="sheetCandidate && candidateJobs(sheetCandidate).length" class="selected-job-list"><article v-for="sample in candidateJobs(sheetCandidate)" :key="sample.id"><div><strong>{{ sample.title }}</strong><span>{{ sample.company }}{{ sample.city ? ` · ${sample.city}` : '' }}{{ sample.salaryText ? ` · ${sample.salaryText}` : '' }}</span></div><M3IconButton label="移除这份岗位" class="destructive-icon" @click="removeJobSample(sample.id)"><Trash2 :size="15" /></M3IconButton></article></div>
                  <p v-else class="sheet-empty-copy">还没有放入真实岗位。先选一份看看即可，之后随时可以更换。</p>
                </section>
                <section>
                  <h3>可以参考的真实岗位</h3>
                  <p class="section-help">岗位只是了解工作内容的样本，不会自动变成你的最终目标。</p>
                  <div class="job-result-list">
                    <article v-for="job in sheetJobs" :key="job.id"><div><strong>{{ job.jobName }}</strong><span>{{ job.companyName }} · {{ job.location || '地点未注明' }} · {{ job.salaryRange }}</span><p>{{ job.requirements?.slice(0, 3).join('；') || job.jobDetails?.slice(0, 120) || '打开来源后查看完整岗位信息' }}</p></div><M3Button variant="outlined" type="button" :disabled="isJobAdded(job.id)" @click="addJobSample(job)">{{ isJobAdded(job.id) ? '已经放入' : '放到这个方向' }}</M3Button></article>
                  </div>
                  <p v-if="!sheetJobs.length && !sheetLoading" class="sheet-empty-copy">暂时没有找到合适的岗位，可以换一个关键词再试。</p>
                </section>
              </div>

              <form v-else class="sheet-section sheet-form notes-form" @submit.prevent="saveCandidate">
                <div class="sheet-intro"><span>用自己的话记录</span><h3>现在怎么看 {{ sheetCandidate?.name }}</h3><p>这些内容会自动带到下一步，不需要在那里重新填写。</p></div>
                <label class="field-block"><span>哪些地方看起来比较合适？（可选）</span><M3TextArea v-model="candidateForm.recommendationReason" placeholder="例如：已有 Python 项目基础，也喜欢把不同工具连接起来解决问题。" /></label>
                <label class="field-block"><span>哪些地方需要留意？（可选）</span><M3TextArea v-model="candidateForm.opposingFactors" placeholder="例如：目前对大型项目的工程经验不多。" /></label>
                <label class="field-block"><span>还有什么不太清楚？</span><M3TextArea v-model="candidateForm.uncertainties" placeholder="例如：实际岗位更看重模型能力，还是工程落地能力？" /></label>
                <DecisionTagInput v-model="candidateForm.validationActions" label="接下来可以怎么了解？" hint="写下 1～3 件不费力、能带来新信息的小事。" :suggestions="['找 3 份真实岗位看看共同要求', '完成一个小练习感受工作内容', '和一位从业者聊聊日常工作']" :max-items="3" />
                <div class="sheet-form-actions"><M3Button type="submit"><Save :size="15" />保存我的想法</M3Button></div>
              </form>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.workspace-shell { width: min(1380px, calc(100% - 48px)); margin: 0 auto; padding: 24px 0 80px; }
.workspace-header { display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 14px; }
.workspace-title > span, .stage-heading span, .sheet-intro > span, .resource-sheet-header small, .summary-heading > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-medium-size); font-weight: 600; }
.workspace-title h1 { margin: 3px 0; font-size: var(--md-sys-typescale-headline-small-size); }
.workspace-title p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.header-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.header-meta span { border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); padding: 6px 10px; font-size: var(--md-sys-typescale-label-small-size); }

.stage-nav { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 1px; margin: 24px 0 16px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); overflow: hidden; background: var(--md-sys-color-outline-variant); }
.stage-nav > :deep(.stage-button) { width: 100%; min-width: 0; min-height: 76px; border-radius: var(--md-sys-shape-corner-none); background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface-variant); padding: 10px 12px; text-align: left; --md-text-button-container-shape: var(--md-sys-shape-corner-none); }
.stage-nav > :deep(.stage-button .m3-button__label) { display: grid; grid-template-columns: 34px minmax(0, 1fr); width: 100%; min-width: 0; align-items: center; gap: 9px; justify-content: stretch; text-align: left; }
.stage-nav > :deep(.stage-button:hover:not([disabled])) { background: var(--md-sys-color-surface-container); }
.stage-nav > :deep(.stage-button.active) { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); }
.stage-nav > :deep(.stage-button.done) { color: var(--career-sys-color-success); }
.stage-nav > :deep(.stage-button[disabled]) { opacity: .54; }
.stage-nav > :deep(.stage-button:focus-visible) { position: relative; z-index: 1; outline: 3px solid var(--md-sys-color-primary); outline-offset: -3px; }
.stage-mark { display: inline-flex; width: 30px; height: 30px; align-items: center; justify-content: center; border: 1px solid currentColor; border-radius: var(--md-sys-shape-corner-full); }
.stage-copy { display: grid; width: 100%; min-width: 0; gap: 3px; }
.stage-copy strong { display: block; min-width: 0; font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.3; overflow-wrap: anywhere; white-space: normal; }
.stage-copy small { display: -webkit-box; min-width: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: var(--md-sys-typescale-label-small-size); line-height: 1.35; overflow-wrap: anywhere; white-space: normal; }

.workspace-grid { display: grid; grid-template-columns: minmax(0, 1fr) 286px; align-items: start; gap: 18px; }
.stage-panel { min-height: 680px; border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-low); padding: 30px; overflow: clip; }
.stage-content { display: grid; gap: 26px; }
.stage-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding-bottom: 20px; }
.stage-heading h2 { margin: 5px 0 0; font-size: var(--md-sys-typescale-headline-small-size); }
.stage-heading > p { max-width: 520px; margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; text-align: right; }
.form-grid { display: grid; gap: 18px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.full-column { grid-column: 1 / -1; }
.field-block { display: grid; align-content: start; gap: 6px; min-width: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-body-medium-size); font-weight: 500; }
.field-block > small, .section-help { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); font-weight: 400; line-height: 1.45; }

.candidate-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-lowest); padding: 16px 18px; }
.candidate-toolbar > div { display: grid; gap: 3px; }
.candidate-toolbar span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.candidate-toolbar .candidate-toolbar-actions { display: flex; justify-content: flex-end; gap: 8px; }
.ai-suggestion-list { display: grid; gap: 1px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-outline-variant); overflow: hidden; }
.ai-suggestion-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 18px; min-width: 0; background: var(--md-sys-color-surface-container-lowest); padding: 14px 16px; }
.ai-suggestion-list article > div { display: grid; min-width: 0; gap: 4px; }
.ai-suggestion-list p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; overflow-wrap: anywhere; }
.ai-suggestion-list article > :deep(.m3-button) { min-width: max-content; max-width: 100%; }
.direction-suggestions { display: grid; gap: 10px; }
.direction-suggestions > header > div { display: grid; gap: 3px; }
.direction-suggestions > header span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.direction-suggestion-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.direction-suggestion-list :deep(.m3-button) { width: 100%; min-width: 0; min-height: 58px; border-radius: var(--md-sys-shape-corner-medium); padding: 8px 12px; text-align: left; }
.direction-suggestion-list :deep(.m3-button__label) { width: 100%; justify-content: space-between; }
.direction-suggestion-list :deep(.m3-button__label > span) { display: grid; min-width: 0; gap: 2px; }
.direction-suggestion-list :deep(.m3-button strong), .direction-suggestion-list :deep(.m3-button small) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.direction-suggestion-list :deep(.m3-button small) { color: var(--md-sys-color-on-surface-variant); font-weight: 400; }
.candidate-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.candidate-card { display: grid; align-content: start; gap: 14px; padding: 18px; }
.candidate-card header { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: start; gap: 10px; }
.candidate-number { display: grid; width: 32px; height: 32px; place-items: center; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); font-weight: 600; }
.candidate-card small { color: var(--md-sys-color-on-surface-variant); }
.candidate-card h3 { margin: 3px 0 0; font-size: var(--md-sys-typescale-title-medium-size); }
.candidate-card > p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.candidate-card footer { border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 12px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.add-candidate { border: 1px dashed var(--md-sys-color-outline); background: color-mix(in srgb, var(--md-sys-color-primary) 3%, var(--md-sys-color-surface-container-lowest)); }
.add-candidate > p { font-size: var(--md-sys-typescale-body-small-size); }
.add-candidate > :last-child { justify-self: start; }
.destructive-icon { --md-icon-button-icon-color: var(--md-sys-color-error); }
.gentle-notice { display: flex; align-items: flex-start; gap: 9px; border-left: 3px solid var(--md-sys-color-tertiary); background: color-mix(in srgb, var(--md-sys-color-tertiary) 9%, var(--md-sys-color-surface-container-lowest)); padding: 14px; color: var(--md-sys-color-on-surface-variant); line-height: 1.5; }
.gentle-notice.ready { border-left-color: var(--career-sys-color-success); background: color-mix(in srgb, var(--career-sys-color-success) 8%, var(--md-sys-color-surface-container-lowest)); }
.gentle-notice svg { flex: 0 0 auto; margin-top: 2px; }

.understanding-list { display: grid; gap: 16px; }
.understanding-card { padding: 20px; }
.understanding-card > header { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 16px; }
.understanding-card h3 { margin: 3px 0 0; }
.understanding-card header small { color: var(--md-sys-color-primary); }
.understanding-state { border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); padding: 6px 10px; font-size: var(--md-sys-typescale-label-medium-size); }
.understanding-state.ready { background: color-mix(in srgb, var(--career-sys-color-success) 16%, var(--md-sys-color-surface-container)); color: var(--md-sys-color-on-surface); }
.understanding-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.understanding-action { min-height: 76px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface); text-align: left; --md-text-button-container-shape: var(--md-sys-shape-corner-medium); }
.understanding-action :deep(.m3-button__label) { display: grid; grid-template-columns: 24px minmax(0, 1fr) 18px; width: 100%; align-items: center; gap: 10px; justify-content: stretch; text-align: left; }
.understanding-action:hover { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-surface-container); }
.understanding-action:focus-visible { outline: 3px solid var(--md-sys-color-primary); outline-offset: 2px; }
.understanding-action :deep(.m3-button__label > svg:first-child) { color: var(--md-sys-color-primary); }
.understanding-action :deep(.m3-button__label > span) { display: grid; gap: 3px; }
.understanding-action small { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-medium-size); line-height: 1.35; }
.candidate-question { display: grid; gap: 4px; margin-top: 14px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 13px; }
.candidate-question p { margin: 0; color: var(--md-sys-color-on-surface-variant); }

.decision-principles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-outline-variant); overflow: hidden; }
.decision-principles > div { display: grid; align-content: start; gap: 7px; min-height: 96px; background: var(--md-sys-color-surface-container-lowest); padding: 14px; }
.decision-principles strong { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-large-size); }
.decision-principles span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.overall-comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.overall-card { display: grid; align-content: start; gap: 16px; padding: 18px; }
.overall-card > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding-bottom: 13px; }
.overall-card h3 { margin: 3px 0 0; }
.overall-card header small, .overall-card header > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.criterion-checks { display: grid; gap: 12px; }
.criterion-check { display: grid; gap: 10px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-lowest); padding: 13px; }
.criterion-title { display: grid; gap: 3px; }
.criterion-title span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.criterion-title strong { line-height: 1.4; }
.evidence-choices { display: grid; gap: 7px; margin: 0; border: 0; padding: 0; }
.evidence-choices legend { margin-bottom: 5px; font-size: var(--md-sys-typescale-body-medium-size); font-weight: 500; }
.evidence-choices label { display: flex; align-items: flex-start; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.evidence-choices :deep(md-checkbox) { flex: 0 0 auto; margin-top: -10px; margin-bottom: -10px; }
.evidence-choices p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.comparison-more { border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); padding: 12px; }
.comparison-more summary { color: var(--md-sys-color-primary); cursor: pointer; font-weight: 500; }
.comparison-more[open] { display: grid; gap: 14px; }

.saved-choice { display: flex; align-items: flex-start; gap: 14px; border-left: 4px solid var(--career-sys-color-success); padding: 18px; color: var(--career-sys-color-success); }
.saved-choice span { font-size: var(--md-sys-typescale-label-small-size); }
.saved-choice h3 { margin: 3px 0; color: var(--md-sys-color-on-surface); }
.saved-choice p { margin: 0; color: var(--md-sys-color-on-surface-variant); }
.choice-level { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; border: 0; padding: 0; }
.choice-level legend { grid-column: 1 / -1; margin-bottom: 4px; font-weight: 600; }
.choice-level > label { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-lowest); padding: 15px; cursor: pointer; }
.choice-level > label.selected { border-color: var(--md-sys-color-primary); background: var(--md-sys-color-primary-container); color: var(--md-sys-color-on-primary-container); }
.choice-level :deep(md-radio) { flex: 0 0 auto; margin-top: -10px; }
.choice-level label > span { display: grid; gap: 4px; }
.choice-level small { color: inherit; opacity: .78; line-height: 1.45; }
.readiness-panel { overflow: hidden; }
.readiness-panel header, .readiness-row { display: grid; grid-template-columns: minmax(130px, 1fr) repeat(3, minmax(120px, auto)); align-items: center; gap: 10px; padding: 12px 16px; }
.readiness-panel header { background: var(--md-sys-color-surface-container); }
.readiness-panel header span { grid-column: 2 / -1; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.readiness-row { border-top: 1px solid var(--md-sys-color-outline-variant); }
.readiness-row > span { display: inline-flex; align-items: center; gap: 5px; color: var(--md-sys-color-tertiary); font-size: var(--md-sys-typescale-label-small-size); }
.readiness-row > span.ready { color: var(--career-sys-color-success); }
.target-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.confirm-choice { display: grid; align-content: start; gap: 5px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); padding: 12px; }
.confirm-choice > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.4; }
.target-actions, .stage-actions { display: flex; align-items: center; gap: 10px; }
.target-actions { flex-wrap: wrap; }
.stage-actions { justify-content: space-between; margin-top: 30px; border-top: 1px solid var(--md-sys-color-outline-variant); padding-top: 20px; }

.journey-summary { position: sticky; top: 16px; display: grid; gap: 18px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-large); background: var(--md-sys-color-surface-container-lowest); padding: 18px; }
.summary-body { display: contents; }
.summary-toggle { display: none; }
.summary-heading { display: grid; gap: 5px; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding-bottom: 14px; }
.summary-heading strong { line-height: 1.35; }
.journey-summary dl { display: grid; gap: 13px; margin: 0; }
.journey-summary dl > div { display: grid; gap: 3px; }
.journey-summary dt { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.journey-summary dd { margin: 0; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; overflow-wrap: anywhere; }
.summary-next { display: flex; align-items: flex-start; gap: 9px; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-tertiary-container); color: var(--md-sys-color-on-tertiary-container); padding: 12px; }
.summary-next svg { flex: 0 0 auto; margin-top: 2px; }
.summary-next div { display: grid; gap: 4px; }
.summary-next p { margin: 0; font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.summary-progress { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.summary-progress li { display: flex; align-items: center; gap: 8px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-medium-size); }
.summary-progress li > span { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid currentColor; border-radius: var(--md-sys-shape-corner-full); font-size: var(--md-sys-typescale-label-small-size); }
.summary-progress li.active { color: var(--md-sys-color-primary); font-weight: 600; }
.summary-progress li.done { color: var(--career-sys-color-success); }

.resource-sheet-layer { position: fixed; inset: 0; z-index: 1600; display: flex; justify-content: flex-end; background: color-mix(in srgb, var(--md-sys-color-scrim) 38%, transparent); }
.resource-sheet { display: grid; flex: 0 0 min(680px, 100vw); grid-template-rows: auto auto minmax(0, 1fr); width: min(680px, 100vw); height: 100%; background: var(--md-sys-color-surface-container-low); box-shadow: var(--md-sys-elevation-level3); }
.resource-sheet-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 22px 12px; }
.resource-sheet-header h2 { margin: 3px 0 0; font-size: var(--md-sys-typescale-title-large-size); }
.resource-tabs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; margin: 0 22px; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-outline-variant); overflow: hidden; }
.resource-tabs :deep(.m3-button) { min-height: 46px; border-radius: var(--md-sys-shape-corner-none); background: var(--md-sys-color-surface-container-lowest); color: var(--md-sys-color-on-surface-variant); --md-text-button-container-shape: var(--md-sys-shape-corner-none); }
.resource-tabs :deep(.m3-button.active) { background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font-weight: 600; }
.resource-tabs :deep(.m3-button:focus-visible) { position: relative; z-index: 1; outline: 3px solid var(--md-sys-color-primary); outline-offset: -3px; }
.resource-sheet-body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 22px; }
.sheet-section { display: grid; gap: 22px; }
.sheet-section section { display: grid; gap: 10px; }
.sheet-section h3, .sheet-section h4 { margin: 0; }
.sheet-section ul { margin: 0; padding-left: 20px; color: var(--md-sys-color-on-surface-variant); line-height: 1.65; }
.sheet-section section > p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.sheet-intro { display: grid; gap: 5px; border-bottom: 1px solid var(--md-sys-color-outline-variant); padding-bottom: 16px; }
.sheet-intro h3 { font-size: var(--md-sys-typescale-title-large-size); }
.sheet-intro p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.plain-tags { display: flex; flex-wrap: wrap; gap: 7px; }
.plain-tags span { border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding: 6px 10px; font-size: var(--md-sys-typescale-label-medium-size); }
.sheet-empty { display: grid; justify-items: center; gap: 8px; padding: 60px 20px; color: var(--md-sys-color-on-surface-variant); text-align: center; }
.sheet-empty h3, .sheet-empty p { margin: 0; }
.sheet-empty p { max-width: 420px; line-height: 1.55; }
.sheet-empty-copy { margin: 0; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); padding: 14px; line-height: 1.5; }
.resource-list, .selected-job-list, .job-result-list { display: grid; gap: 1px; background: var(--md-sys-color-outline-variant); }
.resource-list article, .selected-job-list article, .job-result-list article { display: flex; align-items: center; justify-content: space-between; gap: 14px; background: var(--md-sys-color-surface-container-lowest); padding: 13px; }
.resource-list article > div, .selected-job-list article > div, .job-result-list article > div { display: grid; min-width: 0; gap: 4px; }
.resource-list p, .job-result-list p { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.resource-list article > div > p { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.row-actions { display: flex; flex: 0 0 auto; }
.sheet-form { display: grid; gap: 15px; border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-lowest); padding: 18px; }
.sheet-form h3 { margin: 0; }
.sheet-form-actions { display: flex; justify-content: flex-end; gap: 9px; }
.inline-check { display: grid; gap: 4px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-surface-container); padding: 11px; }
.inline-check > span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); }
.job-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 9px; }
.selected-job-list span { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.job-result-list article { align-items: flex-start; }
.job-result-list article > div > span { color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-medium-size); }
.job-result-list article > :last-child { flex: 0 0 auto; }
.notes-form { padding: 0; background: transparent; }

.stage-fade-enter-active { transition: opacity var(--md-sys-motion-duration-medium4) var(--md-sys-motion-easing-emphasized-decelerate), transform var(--md-sys-motion-duration-medium4) var(--md-sys-motion-easing-emphasized-decelerate); }
.stage-fade-leave-active { transition: opacity var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-accelerate), transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-accelerate); }
.stage-fade-enter-from { opacity: 0; transform: translateY(12px); }
.stage-fade-leave-to { opacity: 0; transform: translateY(-6px); }
.sheet-fade-enter-active, .sheet-fade-leave-active { transition: background-color var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-standard); }
.sheet-fade-enter-active .resource-sheet, .sheet-fade-leave-active .resource-sheet { transition: transform var(--md-sys-motion-duration-medium4) var(--md-sys-motion-easing-emphasized); }
.sheet-fade-enter-from, .sheet-fade-leave-to { background: transparent; }
.sheet-fade-enter-from .resource-sheet, .sheet-fade-leave-to .resource-sheet { transform: translateX(100%); }

@media (max-width: 1100px) {
  .workspace-grid { grid-template-columns: 1fr; }
  .stage-panel { grid-row: 2; }
  .journey-summary { position: static; grid-row: 1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-heading, .summary-next { grid-column: 1 / -1; }
  .journey-summary dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .summary-progress { grid-column: 1 / -1; grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .summary-progress li { align-items: flex-start; }
  .stage-nav > :deep(.stage-button) { min-height: 76px; padding: 8px 5px; text-align: center; }
  .stage-nav > :deep(.stage-button .m3-button__label) { grid-template-columns: 1fr; justify-items: center; text-align: center; }
  .stage-copy small { display: none; }
  .stage-copy strong { font-size: var(--md-sys-typescale-label-medium-size); line-height: 1.25; }
}

@media (max-width: 820px) {
  .stage-nav > :deep(.stage-button) { min-height: 72px; padding-inline: 4px; }
  .stage-copy strong { font-size: var(--md-sys-typescale-label-small-size); line-height: 1.2; }
  .candidate-grid, .overall-comparison-grid, .understanding-columns, .decision-principles { grid-template-columns: 1fr; }
  .stage-heading { align-items: flex-start; flex-direction: column; }
  .stage-heading > p { max-width: none; text-align: left; }
  .readiness-panel { overflow-x: auto; }
  .readiness-panel header, .readiness-row { min-width: 720px; }
}

@media (max-width: 680px) {
  .workspace-shell { width: min(100% - 24px, 1380px); padding-top: 16px; }
  .workspace-header { grid-template-columns: 42px minmax(0, 1fr); align-items: start; }
  .workspace-title p { display: none; }
  .header-meta { grid-column: 2; justify-content: flex-start; }
  .stage-nav { margin-top: 18px; border-radius: var(--md-sys-shape-corner-small); }
  .stage-nav > :deep(.stage-button) { min-height: 54px; }
  .stage-copy { display: none; }
  .stage-panel { min-height: 600px; border-radius: var(--md-sys-shape-corner-medium); padding: 20px 15px; }
  .two-columns, .target-form-grid, .choice-level { grid-template-columns: 1fr; }
  .full-column { grid-column: auto; }
  .candidate-toolbar { align-items: stretch; flex-direction: column; }
  .ai-suggestion-list article { grid-template-columns: 1fr; align-items: stretch; gap: 11px; padding: 14px; }
  .ai-suggestion-list article > :deep(.m3-button) { justify-self: start; }
  .candidate-toolbar .candidate-toolbar-actions { display: flex; justify-content: stretch; }
  .candidate-toolbar-actions > * { flex: 1; }
  .direction-suggestion-list { grid-template-columns: 1fr; }
  .journey-summary { grid-template-columns: 1fr; }
  .summary-toggle { display: inline-flex; justify-self: start; }
  .summary-toggle .rotated { transform: rotate(90deg); }
  .summary-body { display: none; }
  .summary-body.expanded { display: grid; gap: 14px; }
  .summary-heading, .summary-next, .summary-progress { grid-column: auto; }
  .journey-summary dl { grid-template-columns: 1fr; }
  .summary-progress { display: none; }
  .stage-actions, .target-actions { align-items: stretch; flex-direction: column-reverse; }
  .stage-actions > *, .target-actions > * { width: 100%; }
  .resource-sheet { flex-basis: 100vw; width: 100vw; }
  .resource-tabs { margin: 0 12px; }
  .resource-tabs :deep(.m3-button) { padding: 4px; font-size: var(--md-sys-typescale-label-small-size); }
  .resource-sheet-body { padding: 18px 12px; }
  .resource-list article, .job-result-list article { align-items: stretch; flex-direction: column; }
  .resource-list article > :last-child, .job-result-list article > :last-child { align-self: flex-end; }
}

@media (prefers-reduced-motion: reduce) {
  .stage-fade-enter-active, .stage-fade-leave-active, .sheet-fade-enter-active, .sheet-fade-leave-active,
  .sheet-fade-enter-active .resource-sheet, .sheet-fade-leave-active .resource-sheet { transition: none; }
}
</style>
