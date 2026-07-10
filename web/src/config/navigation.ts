export type PrimaryNavId = 'home' | 'flow' | 'jobs' | 'records'

export type PrimaryNavItem = {
  id: PrimaryNavId
  label: string
  path: string
}

export type SecondaryNavItem = {
  id: string
  label: string
  path: string
  icon: string
}

export type WorkflowStep = {
  id: string
  index: number
  label: string
  path: string
  routes: string[]
}

export const primaryNavItems: PrimaryNavItem[] = [
  { id: 'home', label: '工作台', path: '/' },
  { id: 'flow', label: '决策流程', path: '/entry/comprehensive' },
  { id: 'jobs', label: '岗位库', path: '/job-exploration' },
  { id: 'records', label: '我的记录', path: '/reports' }
]

export const workflowSteps: WorkflowStep[] = [
  {
    id: 'entry',
    index: 1,
    label: '信息录入',
    path: '/entry/comprehensive',
    routes: ['/entry/comprehensive', '/assessment/mbti']
  },
  {
    id: 'profile',
    index: 2,
    label: '能力画像',
    path: '/capability-profile',
    routes: ['/capability-profile']
  },
  {
    id: 'jobs',
    index: 3,
    label: '岗位选择',
    path: '/job-exploration',
    routes: ['/job-exploration']
  },
  {
    id: 'path',
    index: 4,
    label: '路径规划',
    path: '/path-planning',
    routes: ['/path-planning']
  },
  {
    id: 'report',
    index: 5,
    label: '报告生成',
    path: '/report',
    routes: ['/report']
  }
]

export const secondaryNavConfig: Record<string, SecondaryNavItem[]> = {
  flow: [
    { id: 'entry', label: '综合信息录入', path: '/entry/comprehensive', icon: '录' },
    { id: 'mbti', label: 'MBTI 测评', path: '/assessment/mbti', icon: '测' },
    { id: 'profile', label: '能力画像', path: '/capability-profile', icon: '像' },
    { id: 'path', label: '路径规划', path: '/path-planning', icon: '径' },
    { id: 'report', label: '报告生成', path: '/report', icon: '报' }
  ],
  jobs: [
    { id: 'jobs', label: '岗位探索', path: '/job-exploration', icon: '岗' }
  ],
  records: [
    { id: 'reports', label: '报告归档', path: '/reports', icon: '记' }
  ]
}

export const sidebarTitles: Record<string, string> = {
  flow: '决策流程',
  jobs: '岗位库',
  records: '我的记录'
}

export const bottomNavItems: Array<PrimaryNavItem & { icon: string }> = [
  { id: 'home', label: '工作台', path: '/', icon: '首' },
  { id: 'flow', label: '流程', path: '/entry/comprehensive', icon: '流' },
  { id: 'jobs', label: '岗位', path: '/job-exploration', icon: '岗' },
  { id: 'records', label: '记录', path: '/reports', icon: '记' }
]

export const getActivePrimaryNav = (path: string): PrimaryNavId | '' => {
  if (path === '/') return 'home'
  if (path.startsWith('/assessment') || path.startsWith('/entry')) return 'flow'
  if (path === '/capability-profile' || path === '/path-planning' || path === '/report') return 'flow'
  if (path === '/job-exploration') return 'jobs'
  if (path === '/reports') return 'records'
  return ''
}

export const isWorkflowPath = (path: string) => {
  return workflowSteps.some(step => step.routes.includes(path))
}
