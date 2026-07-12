export type PrimaryNavId = 'dashboard' | 'explore' | 'decisions' | 'actions'

export type PrimaryNavItem = {
  id: PrimaryNavId
  label: string
  shortLabel: string
  path: string
  icon: 'layout-dashboard' | 'compass' | 'git-compare' | 'list-checks'
}

export const primaryNavItems: PrimaryNavItem[] = [
  {
    id: 'dashboard',
    label: '工作台',
    shortLabel: '工作台',
    path: '/',
    icon: 'layout-dashboard'
  },
  {
    id: 'explore',
    label: '职业探索',
    shortLabel: '探索',
    path: '/explore',
    icon: 'compass'
  },
  {
    id: 'decisions',
    label: '决策项目',
    shortLabel: '决策',
    path: '/decision-projects',
    icon: 'git-compare'
  },
  {
    id: 'actions',
    label: '行动计划',
    shortLabel: '行动',
    path: '/action-plans',
    icon: 'list-checks'
  }
]

export const bottomNavItems = primaryNavItems

export const getActivePrimaryNav = (path: string): PrimaryNavId | '' => {
  if (path === '/') return 'dashboard'
  if (path.startsWith('/explore') || path.startsWith('/job-exploration')) return 'explore'
  if (path.startsWith('/decision-projects')) return 'decisions'
  if (path.startsWith('/action-plans') || path.startsWith('/weekly-reviews')) return 'actions'
  return ''
}
