const SOURCE_LABELS: Readonly<Record<string, string>> = {
  profile: '个人档案',
  'personal-evidence': '个人经历',
  'decision-project': '这次思考',
  job: '真实岗位',
  'action-plan': '行动计划',
  'weekly-review': '阶段回顾',
  project: '项目经历',
  'page-context': '当前页面',
  'user-message': '你刚才的问题',
  dashboard: '工作台'
}

const sourceType = (sourceRef: string) => {
  const separatorIndex = sourceRef.indexOf(':')
  return separatorIndex < 0 ? sourceRef : sourceRef.slice(0, separatorIndex)
}

export const formatSourceReferenceLabels = (sourceRefs: readonly string[]) => {
  const labels = sourceRefs
    .map((sourceRef) => SOURCE_LABELS[sourceType(sourceRef.trim())] ?? '其他参考信息')
    .filter(Boolean)

  return [...new Set(labels)]
}
