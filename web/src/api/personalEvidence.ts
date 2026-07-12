import { del, get, post, put } from '@/utils/request'

export type PersonalEvidence = {
  id: number
  evidenceType: string
  title: string
  description: string | null
  roleName: string | null
  resultSummary: string | null
  linkUrl: string | null
  proficiency: string | null
  lastUsedAt: string | null
  feedback: string | null
  sourceType: string
  sourceRefType: string | null
  sourceRefId: number | null
  credibility: 'low' | 'medium' | 'high'
  visibility: string
  occurredAt: string | null
  createdAt: string
  updatedAt: string
}

export type PersonalEvidencePayload = {
  evidenceType: string
  title: string
  description?: string | null
  roleName?: string | null
  resultSummary?: string | null
  linkUrl?: string | null
  proficiency?: string | null
  lastUsedAt?: string | null
  feedback?: string | null
  sourceType?: string
  sourceRefType?: string | null
  sourceRefId?: number | null
  credibility?: 'low' | 'medium' | 'high'
  occurredAt?: string | null
}

export const listPersonalEvidenceApi = (type?: string) =>
  get<PersonalEvidence[]>('/personal-evidence', type ? { type } : undefined)
export const createPersonalEvidenceApi = (data: PersonalEvidencePayload) =>
  post<PersonalEvidence>('/personal-evidence', data)
export const updatePersonalEvidenceApi = (id: number, data: PersonalEvidencePayload) =>
  put<PersonalEvidence>(`/personal-evidence/${id}`, data)
export const deletePersonalEvidenceApi = (id: number) => del<void>(`/personal-evidence/${id}`)
