import request from '@/utils/request'

export interface MbtiOption {
  id: number
  qId?: number
  optCode: string
  optContent: string
}

export interface MbtiQuestion {
  id: number
  qType: string
  content: string
  options: MbtiOption[]
}

type BackendMbtiQuestion = {
  id: number
  text: string
  options: Array<{
    code: string
    text: string
    dimension: string
    direction: string
  }>
}

type BackendMbtiResult = {
  type: string
  scores: Record<string, number>
  description: string
}

export type MbtiHistoryItem = BackendMbtiResult & {
  id: number
  submittedAt: string
}

export const listMbtiHistoryApi = () => request<MbtiHistoryItem[]>({
  url: '/assessments/mbti/history',
  method: 'get'
})

export const getMbtiQuestionsApi = async () => {
  const questions = await request<BackendMbtiQuestion[]>({
    url: '/assessments/mbti/questions',
    method: 'get'
  })

  return questions.map((question) => ({
    id: question.id,
    qType: 'single',
    content: question.text,
    options: question.options.map((option, index) => ({
      id: index + 1,
      qId: question.id,
      optCode: option.code,
      optContent: option.text
    }))
  })) satisfies MbtiQuestion[]
}

export const submitMbtiApi = async (answers: Record<number, string>, _userId?: number | string) => {
  const result = await request<BackendMbtiResult>({
    url: '/assessments/mbti/submit',
    method: 'post',
    data: {
      answers
    }
  })
  return result.type
}
