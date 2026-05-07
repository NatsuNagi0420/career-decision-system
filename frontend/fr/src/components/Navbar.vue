<!--
  组件：全站导航栏 AppNavbar（Clay 风格）。
  职责：展示顶部 Logo、五步流程进度指示器以及登录用户信息和操作入口，
        使用 Clay 设计系统的暖背景、燕麦边框和卡片式导航视觉。
-->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { useThemeStore } from '../stores/theme'

defineOptions({

  name: 'AppNavbar'
})

type NavbarUser = {
  id?: number | string
  username?: string
  avatar?: string
}

const router = useRouter()
const route = useRoute()

// 主题 Store：用于切换深浅色模式
const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
const toggleTheme = () => themeStore.toggleTheme()

// 响应式数据：步骤指示器

const steps = [
  { id: 1, name: '信息录入', path: '/entry/comprehensive' },
  { id: 2, name: '能力画像', path: '/capability-profile' },

  { id: 3, name: '岗位探索', path: '/job-exploration' },
  { id: 4, name: '路径规划', path: '/path-planning' },
  { id: 5, name: '报告生成', path: '/report' }
]

const currentStep = computed(() => {
  const p = route.path
  if (p.startsWith('/entry')) return 1
  if (p === '/capability-profile') return 2
  if (p === '/job-exploration') return 3
  if (p === '/path-planning') return 4
  if (p === '/report' || p === '/reports') return 5

  return 0
})

// 响应式数据：用户信息
const user = ref<NavbarUser | null>(null)
const isLoggedIn = ref(false)
const isDropdownOpen = ref(false)

// 检查登录状态
onMounted(() => {
  const userData = Cookies.get('userInfo')
  if (userData) {
    user.value = JSON.parse(userData)
    isLoggedIn.value = true
  }
  // 点击外部关闭下拉菜单
  window.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick)
})

const handleGlobalClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.user-profile-wrapper')) {
    isDropdownOpen.value = false
  }
}

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

// 登出逻辑
const handleLogout = () => {
  isDropdownOpen.value = false
  Cookies.remove('userInfo')
  Cookies.remove('token')
  user.value = null
  isLoggedIn.value = false
  router.push('/login')
}

// 导航跳转
const handleNav = (path: string) => {
  router.push(path)
}
</script>

<template>
  <nav class="navbar">
    <div class="nav-content">
      <!-- 左侧 Logo -->
      <div class="logo" @click="handleNav('/')">
        <div class="logo-icon">
          <img src="/favicon.png" alt="职业规划平台" class="logo-icon-img" />
        </div>
        <div class="logo-text-wrap">
          <span class="logo-text-main">职业规划平台</span>
          <span class="logo-text-sub">5 步生成专属规划报告</span>
        </div>
      </div>

      <!-- 中间核心区域：五步流程指示器（桌面端可见） -->
      <div class="steps-indicator pc-only">
        <div
          v-for="(step, index) in steps"
          :key="step.id"
          class="step-item"
          :class="{ active: currentStep === step.id }"
          @click="handleNav(step.path)"
        >
          <span class="step-index">{{ step.id }}</span>
          <span class="step-name">{{ step.name }}</span>
          <div
            v-if="index < steps.length - 1"
            class="step-line"
            :class="{ active: currentStep > step.id }"
          ></div>
        </div>
      </div>

      <!-- 右侧区域：暗黑模式切换 + 登录/注册按钮或用户下拉 -->
      <div class="nav-actions">
        <button
          class="theme-toggle"
          type="button"
          :aria-label="isDark ? '切换为浅色模式' : '切换为深色模式'"
          @click="toggleTheme"
        >
          <span v-if="isDark">🌙</span>
          <span v-else>☀️</span>
        </button>

        <template v-if="!isLoggedIn">
          <button class="btn btn-primary" type="button" @click="handleNav('/login')">登录 / 注册</button>
        </template>
        <template v-else>
          <div class="user-profile-wrapper">
            <div class="user-profile" @click.stop="toggleDropdown">
              <img :src="user?.avatar" alt="Avatar" class="user-avatar" />
              <span class="user-name">{{ user?.username }}</span>
              <div class="arrow-icon" :class="{ rotate: isDropdownOpen }"></div>
            </div>

            <!-- 下拉菜单 -->
            <transition name="fade">
              <div v-if="isDropdownOpen" class="dropdown-menu">
                <div class="dropdown-item" @click="handleNav('/reports')">
                  <span class="icon">📄</span>
                  我的报告
                </div>
                <div class="dropdown-item" @click="handleNav('/entry/comprehensive')">
                  <span class="icon">📝</span>
                  完善信息
                </div>

                <div class="dropdown-divider"></div>
                <div class="dropdown-item logout" @click="handleLogout">
                  <span class="icon">🚪</span>
                  退出登录
                </div>
              </div>
            </transition>
          </div>
        </template>
      </div>
    </div>
  </nav>
</template>

<style scoped>
/* Clay 顶部导航骨架 */
.navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 72px;
  background: var(--clay-bg);
  border-bottom: 1px solid var(--clay-border-subtle);
  box-shadow: var(--clay-shadow);
  backdrop-filter: blur(10px);
  z-index: 1000;
}

.nav-content {
  max-width: 1200px;
  height: 100%;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

/* Logo 区域 */
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.logo-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--clay-radius-pill);
  border: 1px solid var(--clay-border);
  background: radial-gradient(circle at 20% 20%, #ffffff 0%, #f5efe5 40%, #e2f7e9 100%);
  box-shadow: var(--clay-shadow);
  overflow: hidden;
}

.logo-icon-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}


.logo-text-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.logo-text-main {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--clay-text);
}

.logo-text-sub {
  font-size: 12px;
  color: var(--clay-text-subtle);
}

/* 五步流程指示器 */
.steps-indicator {
  display: flex;
  align-items: center;
  padding: 8px 14px;
  gap: 4px;
  border-radius: var(--clay-radius-pill);
  border: 1px solid var(--clay-border-subtle);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.step-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--clay-radius-pill);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.step-item:hover {
  background: rgba(0, 0, 0, 0.03);
}

.step-index {
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid var(--clay-border-subtle);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  margin-right: 6px;
  color: var(--clay-text-subtle);
}

.step-name {
  font-size: 13px;
  color: var(--clay-text-subtle);
  white-space: nowrap;
}

.step-item.active {
  background: #000000;
  transform: translateY(-1px);
}

.step-item.active .step-index {
  border-color: transparent;
  background: #ffffff;
  color: #000000;
}

.step-item.active .step-name {
  color: #ffffff;
}

.step-line {
  width: 24px;
  height: 1px;
  margin: 0 4px;
  background-color: var(--clay-border-subtle);
  transition: background-color 0.2s ease;
}

.step-line.active {
  background-color: #000000;
}

/* 右侧操作区域 */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-toggle {
  width: 34px;
  height: 34px;
  border-radius: var(--clay-radius-pill);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: var(--clay-shadow);
  color: var(--clay-text);
  font-size: 16px;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.theme-toggle:hover {
  background: var(--clay-border-subtle);
  transform: translateY(-1px);
  box-shadow: var(--clay-shadow-hard);
}

.btn {

  padding: 8px 18px;
  border-radius: var(--clay-radius-pill);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--clay-text);
  transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease,
    transform 0.2s ease;
}

.btn-outline {
  border-color: var(--clay-border);
  background: #ffffff;
}

.btn-outline:hover {
  background: var(--clay-border-subtle);
  box-shadow: var(--clay-shadow);
}

.btn-primary {
  background: #000000;
  color: #ffffff;
  border-color: #000000;
  box-shadow: var(--clay-shadow);
}

.btn-primary:hover {
  background: var(--clay-ube-800);
  transform: translateY(-1px);
}

/* 用户下拉区域 */
.user-profile-wrapper {
  position: relative;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--clay-radius-pill);
  transition: background-color 0.2s ease;
}

.user-profile:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--clay-border-subtle);
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
}

.arrow-icon {
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 4px solid var(--clay-text-subtle);
  transition: transform 0.3s ease;
  margin-left: 2px;
}

.arrow-icon.rotate {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 180px;
  background-color: var(--clay-surface);
  border-radius: var(--clay-radius-card);
  box-shadow: var(--clay-shadow);
  border: 1px solid var(--clay-border-subtle);
  padding: 6px 0;
  z-index: 1000;
}

.dropdown-item {
  padding: 10px 14px;
  font-size: 14px;
  color: var(--clay-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.dropdown-item:hover {
  background-color: #f3eee4;
}

.dropdown-item .icon {
  font-size: 16px;
}

.dropdown-divider {
  height: 1px;
  background-color: var(--clay-border-subtle);
  margin: 4px 0;
}

.dropdown-item.logout {
  color: #b42318;
}

.dropdown-item.logout:hover {
  background-color: #fef0ee;
}

/* 动画效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .pc-only {
    display: none;
  }

  .nav-content {
    padding: 0 16px;
  }

  .logo-text-sub {
    display: none;
  }
}

@media (max-width: 640px) {
  .logo-text-main {
    font-size: 16px;
  }
}
</style>
