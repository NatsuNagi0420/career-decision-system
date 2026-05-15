/**
 * 核心数据模型类型定义
 */

// ==================== 用户相关 ====================
export interface UserInfo {
  id: number
  username: string
  phone?: string
  email?: string
  avatar?: string
  createdAt?: string
}

// ==================== 信息录入相关 ====================
export interface BasicInfo {
  name?: string
  age?: number
  gender?: string
  phone?: string
  email?: string
  school?: string
  major?: string
  degree?: string
  graduationYear?: string
}

export interface TargetJob {
  role?: string
  jobType?: string
  cities?: string[]
  expectedSalary?: string
}

export interface WorkExperience {
  company?: string
  position?: string
  startDate?: string
  endDate?: string
  description?: string
}

export interface ProjectExperience {
  name?: string
  role?: string
  startDate?: string
  endDate?: string
  description?: string
  achievements?: string
}

export interface EntryData {
  basic?: BasicInfo
  target?: TargetJob
  skills?: string[]
  certificates?: string[]
  workExperiences?: WorkExperience[]
  projectExperiences?: ProjectExperience[]
  links?: string[]
}

// ==================== 测评相关 ====================
export interface MbtiQuestion {
  id: number
  question: string
  options: MbtiOption[]
}

export interface MbtiOption {
  id: number
  text: string
  dimension: string
  direction: string
}

export interface MbtiResult {
  type: string // e.g., "INTJ"
  dimensions: {
    EI: number
    SN: number
    TF: number
    JP: number
  }
  description?: string
  strengths?: string[]
  weaknesses?: string[]
}

export interface AssessmentData {
  mbtiResult?: MbtiResult
  deepAssessment?: {
    values?: string[]
    interests?: string[]
    personality?: string[]
    workStyle?: string[]
  }
}

// ==================== 岗位相关 ====================
export interface JobInfo {
  id: number
  title: string
  company?: string
  location?: string
  salaryRange?: string
  experience?: string
  education?: string
  description?: string
  requirements?: string[]
  benefits?: string[]
  tags?: string[]
}

export interface JobMatchScore {
  jobId: number
  score: number
  matchReasons?: string[]
}

// ==================== 能力画像相关 ====================
export interface CapabilityProfile {
  completenessScore: number
  competitivenessStars: number
  tags: string[]
  radar: {
    indicators: Array<{ name: string; max: number }>
    values: number[]
  }
  skillMatrix: Array<{
    name: string
    level: number
    evidence?: string
  }>
  suggestions: {
    shortTerm: string[]
    longTerm: string[]
  }
}

// ==================== 路径规划相关 ====================
export interface PathNode {
  id: string
  name: string
  type: 'current' | 'milestone' | 'target'
  description?: string
  timeframe?: string
  requirements?: string[]
}

export interface PathLink {
  source: string
  target: string
  label?: string
}

export interface CareerPath {
  nodes: PathNode[]
  links: PathLink[]
  recommendations: string[]
  gapAnalysis?: {
    currentLevel: string
    targetLevel: string
    gaps: string[]
  }
}

// ==================== 报告相关 ====================
export interface Report {
  id: number
  userId: number
  title: string
  type: 'capability' | 'path' | 'comprehensive'
  content: {
    entryData?: EntryData
    assessmentData?: AssessmentData
    capabilityProfile?: CapabilityProfile
    careerPath?: CareerPath
    recommendedJobs?: JobInfo[]
  }
  createdAt: string
  updatedAt?: string
}

export interface ReportListItem {
  id: number
  title: string
  type: string
  createdAt: string
  preview?: string
}
