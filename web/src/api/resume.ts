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

type BackendResumeAnalysis = {
  score: number
  ats_score: number
  keyword_match: number
  issues: string[]
  suggestions: string[]
  improved_fragments?: string[]
}

async function readResumeText(file: File) {
  const text = await file.text()
  const normalized = text.trim()
  if (!normalized) {
    throw new Error('当前后端仅支持可读取文本的简历内容，请先上传 txt/md 文本或粘贴简历文本。')
  }
  return normalized.slice(0, 20000)
}

export const parseResumeApi = async (file: File) => {
  const resumeText = await readResumeText(file)
  const analysis = await request<BackendResumeAnalysis>({
    url: '/resumes/analyze',
    method: 'post',
    data: {
      requestId: `resume-${Date.now()}`,
      resumeText
    },
    timeout: 60000
  })

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
