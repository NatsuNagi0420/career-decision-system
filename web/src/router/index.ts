import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '@/utils/auth'
import { activityMonitor } from '@/utils/activityMonitor'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('@/pages/Home.vue'), meta: { auth: true } },
    { path: '/login', name: 'login', component: () => import('@/pages/Login.vue') },
    { path: '/onboarding', name: 'onboarding', component: () => import('@/pages/Onboarding.vue'), meta: { auth: true } },
    { path: '/profile', name: 'profile', component: () => import('@/pages/Profile.vue'), meta: { auth: true } },
    { path: '/explore', name: 'explore', component: () => import('@/pages/CareerExplore.vue'), meta: { auth: true } },
    { path: '/decision-projects', name: 'decision-projects', component: () => import('@/pages/DecisionProjects.vue'), meta: { auth: true } },
    { path: '/decision-projects/new', name: 'decision-project-new', component: () => import('@/pages/DecisionProjectWorkspace.vue'), meta: { auth: true } },
    { path: '/decision-projects/:id', name: 'decision-project', component: () => import('@/pages/DecisionProjectWorkspace.vue'), meta: { auth: true } },
    { path: '/action-plans', name: 'action-plans', component: () => import('@/pages/ActionPlans.vue'), meta: { auth: true } },
    { path: '/action-plans/new', name: 'action-plan-new', component: () => import('@/pages/ActionPlans.vue'), meta: { auth: true } },
    { path: '/action-plans/:id', name: 'action-plan', component: () => import('@/pages/ActionPlanWorkspace.vue'), meta: { auth: true } },
    { path: '/weekly-reviews/new', name: 'weekly-review-new', component: () => import('@/pages/WeeklyReview.vue'), meta: { auth: true } },
    { path: '/weekly-reviews/:id', name: 'weekly-review', component: () => import('@/pages/WeeklyReview.vue'), meta: { auth: true } },
    { path: '/history', name: 'history', component: () => import('@/pages/ReportsList.vue'), meta: { auth: true } },
    { path: '/settings', name: 'settings', component: () => import('@/pages/Settings.vue'), meta: { auth: true } },
    { path: '/assessment/mbti', name: 'mbti-assessment', component: () => import('@/pages/MbtiAssessment.vue'), meta: { auth: true } },
    { path: '/capability-profile', redirect: '/profile?section=assessment' },

    // First-version compatibility redirects for saved legacy links.
    { path: '/entry/:pathMatch(.*)*', redirect: '/profile' },
    { path: '/job-exploration', redirect: '/explore?tab=jobs' },
    { path: '/path-planning', redirect: '/action-plans' },
    { path: '/report', redirect: '/history' },
    { path: '/reports', redirect: '/history' },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach((to) => {
  if (!to.meta.auth) return true
  if (isLoggedIn()) return true
  return { path: '/login', query: { redirect: to.fullPath } }
})

router.afterEach((to) => activityMonitor.onPageChange(to.path))
activityMonitor.init()

export default router
