/**
 * 模块：前端主路由配置。
 * 职责：定义职业规划平台的所有前端路由（首页、登录注册、信息录入、能力画像、
 *       岗位探索、路径规划、当前报告页以及历史报告列表页等），
 *       并在全局前置守卫中控制登录访问权限。
 */
import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Login from '../pages/Login.vue'
import ComprehensiveEntry from '../pages/ComprehensiveEntry.vue'
import CapabilityProfile from '../pages/CapabilityProfile.vue'
import JobExploration from '../pages/JobExploration.vue'
import PathPlanning from '../pages/PathPlanning.vue'
import Report from '../pages/Report.vue'
import ReportsList from '../pages/ReportsList.vue'

import { isLoggedIn } from '../utils/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home
    },
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    // 信息录入模块路由（直接进入综合信息录入页）
    {
      path: '/entry/comprehensive',
      name: 'comprehensive-entry',
      component: ComprehensiveEntry
    },
    // 能力画像
    {
      path: '/capability-profile',
      name: 'capability-profile',
      component: CapabilityProfile
    },
    {
      path: '/job-exploration',
      name: 'job-exploration',
      component: JobExploration
    },
    {
      path: '/path-planning',
      name: 'path-planning',
      component: PathPlanning
    },
    {
      path: '/report',
      name: 'report',
      component: Report
    },
    {
      path: '/reports',
      name: 'reports',
      component: ReportsList,
    },
  ],
})

router.beforeEach((to) => {
  const needAuth =
    to.path.startsWith('/entry') ||
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

export default router
