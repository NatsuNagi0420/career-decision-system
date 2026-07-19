import { del, get, patch, post, put } from '@/utils/request'

const WORKSPACE_ERROR_CONFIG = { showError: false } as const

export type DecisionStage = 'brief' | 'candidates' | 'validate' | 'compare' | 'commit'
export type DecisionJourneyStage = DecisionStage

export type InitialDecisionCandidatePayload = {
  directionId?: number | null
  name: string
  sourceType?: 'user' | 'ai' | 'catalog' | 'profile'
}

export type DecisionProjectPayload = {
  title?: string | null
  question: string
  decisionDeadline?: string | null
  background?: string | null
  triggerReason?: string | null
  priorities?: string[]
  mustHaves?: string[]
  dealBreakers?: string[]
  initialCandidates?: InitialDecisionCandidatePayload[]
  expectedVersion?: number
}

export type DecisionCandidatePayload = {
  directionId?: number | null
  name: string
  recommendationReason?: string | null
  opposingFactors?: string | null
  uncertainties?: string | null
  validationActions?: string[]
  sourceType?: 'user' | 'ai' | 'catalog' | 'profile'
  expectedVersion?: number
}

export type DecisionCandidate = {
  id: number
  directionId: number | null
  name: string
  sourceType: string
  recommendationReason: string | null
  opposingFactors: string | null
  uncertainties: string | null
  validationActions: string[]
  sortOrder: number
  updatedAt: string
}

export type DecisionJobSample = {
  id: number
  candidateId: number
  jobId: number
  title: string
  company: string
  city: string | null
  salaryText: string | null
  note: string | null
  reviewedAt: string | null
  createdAt: string
}

export type DecisionEvidence = {
  id: number
  candidateId: number | null
  personalEvidenceId: number | null
  title: string
  detail: string | null
  sourceType: string
  sourceRef: string | null
  credibility: 'low' | 'medium' | 'high'
  stance: 'support' | 'oppose' | 'neutral'
  updatedAt: string
}

export type ComparisonResult = {
  id: number
  candidateId: number
  score: number | null
  assessment: string | null
  evidenceIds: number[]
  uncertainty: string | null
  validationAction: string | null
  verdict: ComparisonVerdict | null
  confirmedAt: string | null
  updatedAt: string
}

export type ComparisonVerdict =
  | 'meets'
  | 'partial'
  | 'does_not_meet'
  | 'unknown'
  | 'not_found'
  | 'needs_attention'
  | 'present'
  | 'good_fit'
  | 'trade_off'
  | 'poor_fit'

export type ComparisonCriterion = {
  id: number
  code: string
  name: string
  description: string | null
  importance: number
  sortOrder: number
  criterionKind: 'must_have' | 'deal_breaker' | 'priority' | 'legacy' | string
  sourceType: 'brief' | 'system' | 'user' | string
  results: ComparisonResult[]
}

export type DecisionTarget = {
  id: number
  candidateId: number
  targetType: 'primary' | 'backup'
  targetName: string
  decisionReason: string
  mainRisks: string | null
  reviewDate: string | null
  verificationStatus: 'provisional' | 'verified'
  verifiedAt: string | null
  overrideReason: string | null
  confirmedAt: string
}

export type DecisionProjectSummary = {
  id: number
  title: string
  question: string
  status: string
  currentStage: DecisionStage
  current: boolean
  version: number
  candidateCount: number
  jobSampleCount: number
  primaryTarget: string | null
  decisionDeadline: string | null
  createdAt: string
  updatedAt: string
}

export type DecisionProject = {
  id: number
  title: string
  question: string
  decisionDeadline: string | null
  background: string | null
  triggerReason: string | null
  priorities: string[]
  mustHaves: string[]
  dealBreakers: string[]
  status: string
  currentStage: DecisionStage
  current: boolean
  version: number
  candidates: DecisionCandidate[]
  jobSamples: DecisionJobSample[]
  evidence: DecisionEvidence[]
  criteria: ComparisonCriterion[]
  targets: DecisionTarget[]
  flowVersion: number
  comparisonReviewedAt: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

export type DecisionEvidencePayload = {
  candidateId?: number | null
  personalEvidenceId?: number | null
  title: string
  detail?: string | null
  sourceType?: string
  sourceRef?: string | null
  credibility?: 'low' | 'medium' | 'high'
  stance?: 'support' | 'oppose' | 'neutral'
  syncToProfile?: boolean
  expectedVersion?: number
}

export type DecisionCandidateJourney = {
  candidateId: number
  state: 'unverified' | 'partial' | 'validated' | 'excluded'
  evidenceCount: number
  jobSampleCount: number
  comparisonCount: number
  remainingItems: string[]
}

export type DecisionJourneyStageState = {
  code: DecisionJourneyStage
  ready: boolean
  complete: boolean
  remainingItems: string[]
}

export type DecisionJourney = {
  projectId: number
  currentStage: DecisionJourneyStage
  projectStatus: 'draft' | 'exploring' | 'provisional' | 'verified' | 'archived' | string
  canSaveProvisional: boolean
  canVerify: boolean
  stages: DecisionJourneyStageState[]
  candidates: DecisionCandidateJourney[]
  nextSteps: string[]
}

export type ComparisonBatchItem = {
  criterionId: number
  candidateId: number
  verdict: ComparisonVerdict
  assessment?: string | null
  evidenceIds?: number[]
  uncertainty?: string | null
  validationAction?: string | null
  confirmed?: boolean
}

export const listDecisionProjectsApi = () => get<DecisionProjectSummary[]>('/decision-projects')
export const getDecisionProjectApi = (id: number) => get<DecisionProject>(`/decision-projects/${id}`)
export const getDecisionJourneyApi = (id: number) => get<DecisionJourney>(`/decision-projects/${id}/journey`)
export const createDecisionProjectApi = (data: DecisionProjectPayload) =>
  post<DecisionProject>('/decision-projects', data, WORKSPACE_ERROR_CONFIG)
export const updateDecisionProjectApi = (id: number, data: DecisionProjectPayload) =>
  put<DecisionProject>(`/decision-projects/${id}`, data, WORKSPACE_ERROR_CONFIG)
export const archiveDecisionProjectApi = (id: number, expectedVersion: number) =>
  del<void>(`/decision-projects/${id}`, { expectedVersion }, WORKSPACE_ERROR_CONFIG)
export const makeCurrentDecisionProjectApi = (id: number, expectedVersion: number) =>
  post<DecisionProject>(`/decision-projects/${id}/current`, { expectedVersion }, WORKSPACE_ERROR_CONFIG)
export const moveDecisionStageApi = (id: number, stage: DecisionStage, expectedVersion?: number) =>
  patch<DecisionProject>(`/decision-projects/${id}/stage`, { stage, expectedVersion }, WORKSPACE_ERROR_CONFIG)
export const addDecisionCandidateApi = (projectId: number, data: DecisionCandidatePayload) =>
  post<DecisionProject>(`/decision-projects/${projectId}/candidates`, data, WORKSPACE_ERROR_CONFIG)
export const updateDecisionCandidateApi = (
  projectId: number,
  candidateId: number,
  data: DecisionCandidatePayload
) => put<DecisionProject>(`/decision-projects/${projectId}/candidates/${candidateId}`, data, WORKSPACE_ERROR_CONFIG)
export const removeDecisionCandidateApi = (
  projectId: number,
  candidateId: number,
  expectedVersion?: number,
  reason = '暂时不再考虑这个方向'
) => del<DecisionProject>(`/decision-projects/${projectId}/candidates/${candidateId}`, { expectedVersion, reason }, WORKSPACE_ERROR_CONFIG)
export const addProjectJobSampleApi = (
  projectId: number,
  data: { candidateId: number; jobId: number; note?: string; expectedVersion?: number }
) => post<DecisionProject>(`/decision-projects/${projectId}/job-samples`, data, WORKSPACE_ERROR_CONFIG)
export const removeProjectJobSampleApi = (projectId: number, sampleId: number, expectedVersion?: number) =>
  del<DecisionProject>(`/decision-projects/${projectId}/job-samples/${sampleId}`, { expectedVersion }, WORKSPACE_ERROR_CONFIG)
export const addDecisionEvidenceApi = (projectId: number, data: DecisionEvidencePayload) =>
  post<DecisionProject>(`/decision-projects/${projectId}/evidence`, data, WORKSPACE_ERROR_CONFIG)
export const updateDecisionEvidenceApi = (
  projectId: number,
  evidenceId: number,
  data: DecisionEvidencePayload
) => put<DecisionProject>(`/decision-projects/${projectId}/evidence/${evidenceId}`, data, WORKSPACE_ERROR_CONFIG)
export const removeDecisionEvidenceApi = (projectId: number, evidenceId: number, expectedVersion?: number) =>
  del<DecisionProject>(`/decision-projects/${projectId}/evidence/${evidenceId}`, { expectedVersion }, WORKSPACE_ERROR_CONFIG)
export const updateComparisonCriterionApi = (
  projectId: number,
  criterionId: number,
  data: { name: string; description?: string | null; importance: number; expectedVersion?: number }
) => put<DecisionProject>(`/decision-projects/${projectId}/criteria/${criterionId}`, data, WORKSPACE_ERROR_CONFIG)
export const saveComparisonResultApi = (
  projectId: number,
  criterionId: number,
  data: {
    candidateId: number
    score?: number | null
    assessment?: string | null
    evidenceIds?: number[]
    uncertainty?: string | null
    validationAction?: string | null
    expectedVersion?: number
  }
) => put<DecisionProject>(`/decision-projects/${projectId}/criteria/${criterionId}/results`, data, WORKSPACE_ERROR_CONFIG)
export const saveComparisonResultsBatchApi = (
  projectId: number,
  data: { results: ComparisonBatchItem[]; expectedVersion?: number }
) => put<DecisionProject>(`/decision-projects/${projectId}/comparisons`, data, WORKSPACE_ERROR_CONFIG)
export const confirmDecisionTargetsApi = (
  projectId: number,
  data: {
    primaryCandidateId: number
    backupCandidateId?: number | null
    decisionReason: string
    mainRisks?: string | null
    reviewDate?: string | null
    verificationStatus?: 'provisional' | 'verified'
    overrideReason?: string | null
    confirmed: boolean
    expectedVersion?: number
  }
) => post<DecisionProject>(`/decision-projects/${projectId}/targets/confirm`, data, WORKSPACE_ERROR_CONFIG)
