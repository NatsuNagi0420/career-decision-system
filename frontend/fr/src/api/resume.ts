/**
 * 模块：简历解析接口封装。
 * 职责：封装前端上传简历文件到后端进行解析的请求，以及解析结果类型定义。
 */
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

export const parseResumeApi = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)

  return request<ResumeParseResult>({
    url: '/resume/parse',
    method: 'post',
    data: formData
  })
}
