import type { JobInfo } from '@/api/jobs'
import type { PersonalEvidence } from '@/api/personalEvidence'

export type FrequencyItem = { label: string; count: number; ratio: number }

export type JobAggregate = {
  sampleCount: number
  topSkills: FrequencyItem[]
  cities: FrequencyItem[]
  experienceLevels: FrequencyItem[]
  educationLevels: FrequencyItem[]
  salarySampleCount: number
  salaryMin: number | null
  salaryMax: number | null
  latestSourceAt: string | null
}

export type EvidenceRequirementMatch = {
  requirement: string
  evidence: PersonalEvidence | null
  confidence: 'direct' | 'related' | 'missing'
}

const STOPWORDS = new Set([
  '技术研发', '数据分析', '企业服务', '互联网', '不限', '其他', '岗位', '职责', '要求',
  '负责', '相关', '优先', '以上', '能力', '工作', '具备', '熟悉', '掌握', '了解', '良好'
])

const ALIASES: Record<string, string[]> = {
  javascript: ['javascript', 'js'],
  typescript: ['typescript', 'ts'],
  'spring boot': ['spring boot', 'springboot'],
  mysql: ['mysql', 'sql', '数据库'],
  python: ['python'],
  java: ['java'],
  vue: ['vue', 'vue.js', 'vuejs'],
  react: ['react', 'react.js', 'reactjs'],
  excel: ['excel', '电子表格'],
  sql: ['sql', '数据库查询'],
  figma: ['figma'],
  '用户研究': ['用户研究', '访谈', '可用性测试'],
  '数据分析': ['数据分析', '指标分析', '业务分析'],
  '沟通协作': ['沟通', '协作', '跨团队']
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[\s_./·-]+/g, '')
}

function terms(value: string) {
  const key = value.trim().toLocaleLowerCase()
  const aliases = ALIASES[key] || [key]
  return aliases.map(normalized).filter((item) => item.length >= 2)
}

function frequencies(values: Array<string | null | undefined>, total: number, limit = 8): FrequencyItem[] {
  const counts = new Map<string, number>()
  for (const raw of values) {
    const label = raw?.trim()
    if (!label || STOPWORDS.has(label)) continue
    counts.set(label, (counts.get(label) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, ratio: total ? Math.round(count / total * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-CN'))
    .slice(0, limit)
}

function latestDate(jobs: JobInfo[]) {
  const dates = jobs
    .map((job) => job.sourceUpdatedAt || job.updateDate)
    .filter(Boolean)
    .map((value) => ({ value: value!, timestamp: new Date(value!).getTime() }))
    .filter((item) => Number.isFinite(item.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)
  return dates[0]?.value || null
}

export function aggregateJobs(jobs: JobInfo[]): JobAggregate {
  const sampleCount = jobs.length
  const salaryJobs = jobs.filter((job) => job.salaryMin != null || job.salaryMax != null)
  const salaryMins = salaryJobs.map((job) => job.salaryMin).filter((value): value is number => value != null)
  const salaryMaxes = salaryJobs.map((job) => job.salaryMax).filter((value): value is number => value != null)
  return {
    sampleCount,
    topSkills: frequencies(jobs.flatMap((job) => job.tags || []), sampleCount),
    cities: frequencies(jobs.map((job) => job.location?.split(/[·\s]/)[0]), sampleCount, 6),
    experienceLevels: frequencies(jobs.map((job) => job.experienceLevel), sampleCount, 6),
    educationLevels: frequencies(jobs.map((job) => job.education), sampleCount, 6),
    salarySampleCount: salaryJobs.length,
    salaryMin: salaryMins.length ? Math.min(...salaryMins) : null,
    salaryMax: salaryMaxes.length ? Math.max(...salaryMaxes) : null,
    latestSourceAt: latestDate(jobs)
  }
}

export function careerJobSearchTerms(name: string, commonSkills: string[]): string[] {
  const cleanName = name.trim()
  const shortened = cleanName.replace(/(?:开发|工程师?|管理|设计|分析|研究|服务|运营|咨询|研发)$/, '')
  return Array.from(new Set([
    cleanName,
    shortened.length >= 2 ? shortened : '',
    ...commonSkills.filter((item) => item.trim().length >= 2).slice(0, 2)
  ].filter(Boolean))).slice(0, 4)
}

function evidenceText(evidence: PersonalEvidence) {
  return normalized([
    evidence.title,
    evidence.description,
    evidence.roleName,
    evidence.resultSummary,
    evidence.proficiency,
    evidence.feedback
  ].filter(Boolean).join(' '))
}

export function collectJobRequirements(job: JobInfo): string[] {
  const structured = [...(job.tags || []), ...(job.requirements || [])]
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 80 && !STOPWORDS.has(item))
  return Array.from(new Set(structured)).slice(0, 20)
}

export function matchEvidence(requirements: string[], evidence: PersonalEvidence[]): EvidenceRequirementMatch[] {
  const rows = evidence.map((item) => ({ item, text: evidenceText(item) }))
  return requirements.map((requirement) => {
    const variants = terms(requirement)
    const direct = rows.find((row) => variants.some((term) => row.text.includes(term)))
    if (direct) return { requirement, evidence: direct.item, confidence: 'direct' as const }

    const words = requirement.split(/[，,、/\s；;（）()]+/).map(normalized).filter((item) => item.length >= 2)
    const related = rows.find((row) => words.some((word) => row.text.includes(word)))
    return related
      ? { requirement, evidence: related.item, confidence: 'related' as const }
      : { requirement, evidence: null, confidence: 'missing' as const }
  })
}

export function compareResumeToJob(resumeText: string, job: JobInfo) {
  const normalizedResume = normalized(resumeText)
  const requirements = collectJobRequirements(job)
  const matched = requirements.filter((requirement) => terms(requirement).some((term) => normalizedResume.includes(term)))
  const missing = requirements.filter((requirement) => !matched.includes(requirement))
  const score = requirements.length ? Math.round(matched.length / requirements.length * 100) : 0
  return { requirements, matched, missing, score }
}
