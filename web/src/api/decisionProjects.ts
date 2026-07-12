import { del, get, patch, post, put } from '@/utils/request'

export type DecisionStage = 'clarify' | 'evidence' | 'candidates' | 'compare' | 'target'

export type DecisionProjectPayload = {
  title: string
  question: string
  decisionDeadline?: string | null
  background?: string | null
  triggerReason?: string | null
  priorities?: string[]
  mustHaves?: string[]
  dealBreakers?: string[]
  expectedVersion?: number
}

export type DecisionCandidatePayload = {
  directionId?: number | null
  name: string
  recommendationReason?: string | null
  opposingFactors?: string | null
  uncertainties?: string | null
  validationActions?: string[]
  sourceType?: 'user' | 'ai' | 'catalog'
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
  updatedAt: string
}

export type ComparisonCriterion = {
  id: number
  code: string
  name: string
  description: string | null
  importance: number
  sortOrder: number
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
  expectedVersion?: number
}

export const listDecisionProjectsApi = () => get<DecisionProjectSummary[]>('/decision-projects')
export const getDecisionProjectApi = (id: number) => get<DecisionProject>(`/decision-projects/${id}`)
export const createDecisionProjectApi = (data: DecisionProjectPayload) =>
  post<DecisionProject>('/decision-projects', data)
export const updateDecisionProjectApi = (id: number, data: DecisionProjectPayload) =>
  put<DecisionProject>(`/decision-projects/${id}`, data)
export const archiveDecisionProjectApi = (id: number, expectedVersion: number) =>
  del<void>(`/decision-projects/${id}`, { expectedVersion })
export const makeCurrentDecisionProjectApi = (id: number, expectedVersion: number) =>
  post<DecisionProject>(`/decision-projects/${id}/current`, { expectedVersion })
export const moveDecisionStageApi = (id: number, stage: DecisionStage, expectedVersion?: number) =>
  patch<DecisionProject>(`/decision-projects/${id}/stage`, { stage, expectedVersion })
export const addDecisionCandidateApi = (projectId: number, data: DecisionCandidatePayload) =>
  post<DecisionProject>(`/decision-projects/${projectId}/candidates`, data)
export const updateDecisionCandidateApi = (
  projectId: number,
  candidateId: number,
  data: DecisionCandidatePayload
) => put<DecisionProject>(`/decision-projects/${projectId}/candidates/${candidateId}`, data)
export const removeDecisionCandidateApi = (projectId: number, candidateId: number, expectedVersion?: number) =>
  del<DecisionProject>(`/decision-projects/${projectId}/candidates/${candidateId}`, { expectedVersion })
export const addProjectJobSampleApi = (
  projectId: number,
  data: { candidateId: number; jobId: number; note?: string; expectedVersion?: number }
) => post<DecisionProject>(`/decision-projects/${projectId}/job-samples`, data)
export const removeProjectJobSampleApi = (projectId: number, sampleId: number, expectedVersion?: number) =>
  del<DecisionProject>(`/decision-projects/${projectId}/job-samples/${sampleId}`, { expectedVersion })
export const addDecisionEvidenceApi = (projectId: number, data: DecisionEvidencePayload) =>
  post<DecisionProject>(`/decision-projects/${projectId}/evidence`, data)
export const updateDecisionEvidenceApi = (
  projectId: number,
  evidenceId: number,
  data: DecisionEvidencePayload
) => put<DecisionProject>(`/decision-projects/${projectId}/evidence/${evidenceId}`, data)
export const removeDecisionEvidenceApi = (projectId: number, evidenceId: number, expectedVersion?: number) =>
  del<DecisionProject>(`/decision-projects/${projectId}/evidence/${evidenceId}`, { expectedVersion })
export const updateComparisonCriterionApi = (
  projectId: number,
  criterionId: number,
  data: { name: string; description?: string | null; importance: number; expectedVersion?: number }
) => put<DecisionProject>(`/decision-projects/${projectId}/criteria/${criterionId}`, data)
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
) => put<DecisionProject>(`/decision-projects/${projectId}/criteria/${criterionId}/results`, data)
export const confirmDecisionTargetsApi = (
  projectId: number,
  data: {
    primaryCandidateId: number
    backupCandidateId?: number | null
    decisionReason: string
    mainRisks?: string | null
    reviewDate?: string | null
    confirmed: boolean
    expectedVersion?: number
  }
) => post<DecisionProject>(`/decision-projects/${projectId}/targets/confirm`, data)
