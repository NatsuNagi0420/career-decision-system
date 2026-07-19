import { describe, expect, it } from 'vitest'
import { formatSourceReferenceLabels } from '@/utils/sourceReferences'

describe('formatSourceReferenceLabels', () => {
  it('hides internal ids behind names people can understand', () => {
    expect(formatSourceReferenceLabels([
      'decision-project:36',
      'profile',
      'profile:targetRole',
      'personal-evidence:1',
      'job:1002'
    ])).toEqual(['这次思考', '个人档案', '个人经历', '真实岗位'])
  })

  it('keeps unknown internal references from leaking into the page', () => {
    expect(formatSourceReferenceLabels(['custom-source:secret-id'])).toEqual(['其他参考信息'])
  })
})
