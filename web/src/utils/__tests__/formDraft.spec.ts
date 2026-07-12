import { beforeEach, describe, expect, it } from 'vitest'
import { clearFormDraft, loadFormDraft, saveFormDraft } from '@/utils/formDraft'

describe('formDraft', () => {
  beforeEach(() => localStorage.clear())

  it('keeps drafts isolated by user and scope', () => {
    saveFormDraft('decision-1', 1, { title: '用户一草稿' })
    saveFormDraft('decision-1', 2, { title: '用户二草稿' })

    expect(loadFormDraft<{ title: string }>('decision-1', 1)?.data.title).toBe('用户一草稿')
    expect(loadFormDraft<{ title: string }>('decision-1', 2)?.data.title).toBe('用户二草稿')
    expect(loadFormDraft('decision-2', 1)).toBeNull()
  })

  it('removes a submitted draft', () => {
    saveFormDraft('weekly-review-1', 1, { summary: '尚未提交' })
    clearFormDraft('weekly-review-1', 1)
    expect(loadFormDraft('weekly-review-1', 1)).toBeNull()
  })
})
