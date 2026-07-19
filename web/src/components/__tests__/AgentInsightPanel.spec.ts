import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { CoachingResponse } from '@/api/coaching'
import M3Card from '@/design-system/components/M3Card.vue'
import AgentInsightPanel from '../AgentInsightPanel.vue'

const result: CoachingResponse = {
  generationMode: 'llm',
  modelName: 'test-coach',
  confidence: 0.76,
  conclusion: '两个方向都值得继续了解，但暂时不需要马上做出最终决定。',
  evidenceBasis: [
    {
      statement: '已经参考了这次思考和一段个人经历。',
      sourceRefs: ['decision-project:36', 'personal-evidence:1']
    }
  ],
  counterArguments: ['还没有查看足够的真实岗位。'],
  uncertainties: ['暂时不清楚每周能够投入多少时间。'],
  nextActions: [
    {
      actionType: 'career_research',
      title: '查看三个真实岗位',
      rationale: '先看看岗位共同在找什么。',
      acceptanceCriteria: '记下三个共同要求。'
    },
    {
      actionType: 'project',
      title: '完成一次小练习',
      rationale: '感受自己是否喜欢这类工作。',
      acceptanceCriteria: null
    }
  ]
}

describe('AgentInsightPanel', () => {
  it('uses a clear content hierarchy and does not expose internal source ids', () => {
    const wrapper = mount(AgentInsightPanel, {
      props: { result, title: '可以参考的方向' },
      global: { components: { M3Card } }
    })

    expect(wrapper.get('.agent-evidence').text()).toContain('参考了这些信息')
    expect(wrapper.get('.agent-cautions').text()).toContain('还需要留意')
    expect(wrapper.get('.agent-next').text()).toContain('接下来可以这样了解')
    expect(wrapper.findAll('.agent-action-list > li')).toHaveLength(2)
    expect(wrapper.text()).toContain('参考：这次思考 · 个人经历')
    expect(wrapper.text()).toContain('完成时可以看看：记下三个共同要求。')
    expect(wrapper.text()).not.toContain('decision-project:36')
    expect(wrapper.text()).not.toContain('personal-evidence:1')
  })
})
