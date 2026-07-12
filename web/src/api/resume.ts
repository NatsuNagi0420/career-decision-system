import request from '@/utils/request'

export type ResumeParseResult = {
  basic?: {
    name?: string
    phone?: string
    email?: string
    gender?: string
    age?: number
    school?: string
    major?: string
  }
  target?: {
    intentionPosition?: string
    intentionCities?: string[]
    expectedSalary?: string
    jobType?: string
  }
  educations?: Array<{ text?: string }>
  mainCourses?: string[]
  skills?: string[]
  certificates?: string[]
  skillCertificates?: string[]
  workExperiences?: Array<{ title?: string; description?: string }>
  selfEvaluation?: string
}

export type ResumeAnalysis = {
  score: number
  ats_score: number
  keyword_match: number
  issues: string[]
  suggestions: string[]
  improved_fragments?: string[]
  agentRunId?: number
}

export type ResumeAnalysisArchiveSummary = {
  id: number
  agentRunId?: number | null
  targetRole?: string | null
  score?: number | null
  atsScore?: number | null
  keywordMatch?: number | null
  issueCount: number
  suggestionCount: number
  createdAt?: string
}

export type ResumeAnalysisArchiveDetail = Omit<ResumeAnalysisArchiveSummary, 'issueCount' | 'suggestionCount'> & {
  issues: string[]
  suggestions: string[]
  improvedFragments: string[]
}

async function readResumeText(file: File) {
  const text = await file.text()
  const normalized = text.trim()
  if (!normalized) {
    throw new Error('当前后端仅支持可读取文本的简历内容，请先上传 txt/md 文本或粘贴简历文本。')
  }
  return normalized.slice(0, 20000)
}

export const analyzeResumeTextApi = (resumeText: string) => {
  const normalized = resumeText.trim().slice(0, 20000)
  if (!normalized) return Promise.reject(new Error('请先粘贴简历文本或选择 txt/md 文件。'))
  return request<ResumeAnalysis>({
    url: '/resumes/analyze',
    method: 'post',
    data: {
      requestId: `resume-${crypto.randomUUID()}`,
      resumeText: normalized
    },
    timeout: 60000
  })
}

export const archiveResumeAnalysisApi = (resumeText: string, analysis: ResumeAnalysis, targetRole?: string | null) =>
  request<{ id: number }>({
    url: '/resumes/analyses/archive',
    method: 'post',
    data: {
      targetRole: targetRole || null,
      resumeText: resumeText.trim().slice(0, 20000),
      agentRunId: analysis.agentRunId || null,
      analysis: {
        score: analysis.score,
        atsScore: analysis.ats_score,
        keywordMatch: analysis.keyword_match,
        issues: analysis.issues,
        suggestions: analysis.suggestions,
        improvedFragments: analysis.improved_fragments || []
      }
    }
  })

export const listResumeAnalysisArchivesApi = () =>
  request<ResumeAnalysisArchiveSummary[]>({
    url: '/resumes/analyses',
    method: 'get',
    params: { page: 0, size: 50 }
  })

export const getResumeAnalysisArchiveDetailApi = (id: number) =>
  request<ResumeAnalysisArchiveDetail>({
    url: `/resumes/analyses/${id}`,
    method: 'get'
  })

export const deleteResumeAnalysisArchiveApi = (id: number) =>
  request<void>({
    url: `/resumes/analyses/${id}`,
    method: 'delete'
  })

export const parseResumeApi = async (file: File) => {
  const resumeText = await readResumeText(file)
  const analysis = await analyzeResumeTextApi(resumeText)

  const skills = [
    ...analysis.suggestions,
    ...(analysis.improved_fragments ?? [])
  ]
    .flatMap((item) => item.split(/[，,、;；\n]/))
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 12)

  return {
    skills,
    selfEvaluation: `简历评分：${analysis.score}，ATS：${analysis.ats_score}，关键词匹配：${analysis.keyword_match}`,
    workExperiences: analysis.issues.map((issue, index) => ({
      title: `待优化项 ${index + 1}`,
      description: issue
    }))
  } satisfies ResumeParseResult
}
