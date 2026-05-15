import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/components/Home.vue')
  },
  {
    path: '/presentation',
    name: 'Presentation',
    component: () => import('@/components/Presentation.vue')
  },
  {
    path: '/opening',
    name: 'Opening',
    component: () => import('@/animations/Opening.vue')
  },
  {
    path: '/feature-roadmap',
    name: 'FeatureRoadmap',
    component: () => import('@/animations/FeatureRoadmap.vue')
  },
  {
    path: '/stats',
    name: 'Stats',
    component: () => import('@/animations/Stats.vue')
  },
  {
    path: '/flow',
    name: 'Flow',
    component: () => import('@/animations/Flow.vue')
  },
  {
    path: '/architecture',
    name: 'Architecture',
    component: () => import('@/animations/Architecture.vue')
  },
  {
    path: '/techstack',
    name: 'TechStack',
    component: () => import('@/animations/TechStack.vue')
  },
  {
    path: '/models',
    name: 'Models',
    component: () => import('@/animations/Models.vue')
  },
  {
    path: '/dataflow',
    name: 'DataFlow',
    component: () => import('@/animations/DataFlow.vue')
  },
  {
    path: '/ending',
    name: 'Ending',
    component: () => import('@/animations/Ending.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
