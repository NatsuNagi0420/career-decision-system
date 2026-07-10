/**
 * 模块：前端主路由配置。
 * 职责：定义职业规划平台的所有前端路由（首页、登录注册、信息录入、能力画像、
 *       岗位探索、路径规划、当前报告页以及历史报告列表页等），
 *       并在全局前置守卫中控制登录访问权限。
 *
 * 性能优化：所有路由组件使用懒加载，减少初始包体积
 */
import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../utils/auth'
import { activityMonitor } from '../utils/activityMonitor'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../pages/Home.vue')
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/Login.vue')
    },
    // 测评模块路由
    {
      path: '/assessment/mbti',
      name: 'mbti-assessment',
      component: () => import('../pages/MbtiAssessment.vue')
    },
    // 信息录入模块路由（直接进入综合信息录入页）
    {
      path: '/entry/comprehensive',
      name: 'comprehensive-entry',
      component: () => import('../pages/ComprehensiveEntry.vue')
    },
    // 能力画像
    {
      path: '/capability-profile',
      name: 'capability-profile',
      component: () => import('../pages/CapabilityProfile.vue')
    },
    {
      path: '/job-exploration',
      name: 'job-exploration',
      component: () => import('../pages/JobExploration.vue')
    },
    {
      path: '/path-planning',
      name: 'path-planning',
      component: () => import('../pages/PathPlanning.vue')
    },
    {
      path: '/report',
      name: 'report',
      component: () => import('../pages/Report.vue')
    },
    {
      path: '/reports',
      name: 'reports',
      component: () => import('../pages/ReportsList.vue')
    }
  ]
})

router.beforeEach((to) => {
  const needAuth =
    to.path.startsWith('/entry') ||
    to.path.startsWith('/assessment') ||
    to.path === '/capability-profile' ||
    to.path === '/job-exploration' ||
    to.path === '/path-planning' ||
    to.path === '/report' ||
    to.path === '/reports'

  if (!needAuth) return true
  if (to.path === '/login') return true
  if (isLoggedIn()) return true
  return { path: '/login', query: { redirect: to.fullPath } }
})

router.afterEach((to) => {
  // 页面切换时通知 activityMonitor
  activityMonitor.onPageChange(to.path)
})

// 初始化 activityMonitor
activityMonitor.init()

export default router
