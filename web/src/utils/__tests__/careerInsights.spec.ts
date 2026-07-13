import { describe, expect, it } from 'vitest'
import type { JobInfo } from '@/api/jobs'
import type { PersonalEvidence } from '@/api/personalEvidence'
import {
  aggregateJobs, careerJobSearchTerms, collectJobRequirements,
  compareResumeToJob, matchEvidence
} from '@/utils/careerInsights'

const job = (overrides: Partial<JobInfo>): JobInfo => ({
  id: 1,
  jobName: '后端工程师',
  companyName: '真实样本公司',
  updateDate: '',
  salaryRange: '15k-25k',
  location: '杭州',
  jobSourceUrl: 'https://example.test/job/1',
  tags: ['Java', 'Spring Boot', 'MySQL'],
  requirements: [],
  ...overrides
})

const evidence = (overrides: Partial<PersonalEvidence>): PersonalEvidence => ({
  id: 1,
  evidenceType: 'project',
  title: 'Java 课程项目',
  description: '使用 SpringBoot 完成后端接口',
  roleName: '后端开发',
  resultSummary: '交付 8 个接口并通过测试',
  linkUrl: null,
  proficiency: '熟悉',
  lastUsedAt: null,
  feedback: null,
  sourceType: 'manual',
  sourceRefType: null,
  sourceRefId: null,
  credibility: 'high',
  visibility: 'private',
  occurredAt: null,
  createdAt: '2026-07-01T10:00:00',
  updatedAt: '2026-07-01T10:00:00',
  ...overrides
})

describe('career insights', () => {
  it('aggregates real job samples without treating missing salary as zero', () => {
    const result = aggregateJobs([
      job({ id: 1, salaryMin: 15000, salaryMax: 25000, sourceUpdatedAt: '2026-07-01', experienceLevel: '1-3年', education: '本科' }),
      job({ id: 2, salaryMin: 18000, salaryMax: 30000, sourceUpdatedAt: '2026-07-10', tags: ['Java', 'Redis'], experienceLevel: '1-3年', education: '本科' }),
      job({ id: 3, salaryMin: null, salaryMax: null, sourceUpdatedAt: null, tags: ['Go'] })
    ])

    expect(result.sampleCount).toBe(3)
    expect(result.topSkills[0]).toMatchObject({ label: 'Java', count: 2, ratio: 67 })
    expect(result.salarySampleCount).toBe(2)
    expect(result.salaryMin).toBe(15000)
    expect(result.salaryMax).toBe(30000)
    expect(result.latestSourceAt).toBe('2026-07-10')
  })

  it('uses a shortened career name and skills to find related real jobs', () => {
    expect(careerJobSearchTerms('后端开发', ['Java', '数据库', '沟通'])).toEqual(['后端开发', '后端', 'Java', '数据库'])
  })

  it('matches evidence through normalized aliases and leaves unsupported requirements missing', () => {
    const matches = matchEvidence(['Spring Boot', 'Redis'], [evidence({})])
    expect(matches[0]).toMatchObject({ requirement: 'Spring Boot', confidence: 'direct' })
    expect(matches[1]).toMatchObject({ requirement: 'Redis', confidence: 'missing', evidence: null })
  })

  it('compares resume text only against structured JD requirements', () => {
    const target = job({ tags: ['Java', 'Spring Boot', 'MySQL'] })
    expect(collectJobRequirements(target)).toEqual(['Java', 'Spring Boot', 'MySQL'])
    const result = compareResumeToJob('使用 Java 和 SpringBoot 完成课程项目', target)
    expect(result.matched).toEqual(['Java', 'Spring Boot'])
    expect(result.missing).toEqual(['MySQL'])
    expect(result.score).toBe(67)
  })
})
