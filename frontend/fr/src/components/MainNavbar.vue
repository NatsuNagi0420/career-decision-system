<!--
  组件：主导航栏 MainNavbar（基于信息架构的顶部导航）
  职责：展示6个一级导航入口（首页、测评、探索、规划、学习、求职、我的），
        使用 Clay 设计系统，支持响应式适配
-->
<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import { useThemeStore } from '../stores/theme'

defineOptions({
  name: 'MainNavbar'
})

type NavbarUser = {
  id?: number | string
  username?: string
  avatar?: string
}

const router = useRouter()
const route = useRoute()

// 主题 Store
const themeStore = useThemeStore()
const isDark = computed(() => themeStore.isDark)
const toggleTheme = () => themeStore.toggleTheme()

// 一级导航菜单（6个入口）
const primaryNav = [
  { id: 'home', label: '首页', path: '/', icon: '🏠' },
  { id: 'assessment', label: '测评', path: '/assessment', icon: '🎯' },
  { id: 'explore', label: '探索', path: '/explore', icon: '🔍' },
  { id: 'planning', label: '规划', path: '/planning', icon: '📋' },
  { id: 'learning', label: '学习', path: '/learning', icon: '📚' },
  { id: 'career', label: '求职', path: '/career', icon: '💼' },
  { id: 'profile', label: '我的', path: '/profile', icon: '👤' }
]

// 当前激活的一级菜单
const activeNav = computed(() => {
  const p = route.path
  if (p === '/') return 'home'
  if (p.startsWith('/assessment') || p.startsWith('/entry')) return 'assessment'
  if (p.startsWith('/explore') || p === '/job-exploration') return 'explore'
  if (p.startsWith('/planning') || p === '/capability-profile' || p === '/path-planning') return 'planning'
  if (p.startsWith('/learning')) return 'learning'
  if (p.startsWith('/career')) return 'career'
  if (p.startsWith('/profile') || p === '/reports') return 'profile'
  return ''
})

// 用户信息
const user = ref<NavbarUser | null>(null)
const isLoggedIn = ref(false)
const isDropdownOpen = ref(false)
const isMobileMenuOpen = ref(false)

// 检查登录状态
onMounted(() => {
  const userData = Cookies.get('userInfo')
  if (userData) {
    user.value = JSON.parse(userData)
    isLoggedIn.value = true
  }
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
  if (!target.closest('.mobile-menu-wrapper')) {
    isMobileMenuOpen.value = false
  }
}

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
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
  isMobileMenuOpen.value = false
}

// 触发侧边栏切换事件（通知父组件或全局状态）
const emit = defineEmits<{
  'nav-change': [navId: string]
}>()

const handleNavClick = (navId: string, path: string) => {
  handleNav(path)
  emit('nav-change', navId)
}
</script>

<template>
  <nav class="main-navbar">
    <div class="nav-content">
      <!-- 左侧 Logo -->
      <div class="logo" @click="handleNav('/')">
        <div class="logo-icon">
          <img src="/favicon.png" alt="职业规划平台" class="logo-icon-img" />
        </div>
        <div class="logo-text-wrap">
          <span class="logo-text-main">职业规划平台</span>
          <span class="logo-text-sub">智能职业决策支持系统</span>
        </div>
      </div>

      <!-- 中间：一级导航菜单（桌面端） -->
      <div class="primary-nav desktop-only">
        <button
          v-for="nav in primaryNav"
          :key="nav.id"
          class="nav-item"
          :class="{ active: activeNav === nav.id }"
          type="button"
          @click="handleNavClick(nav.id, nav.path)"
        >
          <span class="nav-icon">{{ nav.icon }}</span>
          <span class="nav-label">{{ nav.label }}</span>
        </button>
      </div>

      <!-- 右侧：主题切换 + 用户信息 -->
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
          <button class="btn btn-primary" type="button" @click="handleNav('/login')">
            登录 / 注册
          </button>
        </template>
        <template v-else>
          <div class="user-profile-wrapper">
            <div class="user-profile" @click.stop="toggleDropdown">
              <img :src="user?.avatar" alt="Avatar" class="user-avatar" />
              <span class="user-name desktop-only">{{ user?.username }}</span>
              <div class="arrow-icon" :class="{ rotate: isDropdownOpen }"></div>
            </div>

            <!-- 下拉菜单 -->
            <transition name="fade">
              <div v-if="isDropdownOpen" class="dropdown-menu">
                <div class="dropdown-item" @click="handleNav('/profile/center')">
                  <span class="icon">👤</span>
                  个人中心
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

        <!-- 移动端菜单按钮 -->
        <button class="mobile-menu-btn mobile-only" type="button" @click="toggleMobileMenu">
          <span class="hamburger-icon" :class="{ open: isMobileMenuOpen }">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>
    </div>

    <!-- 移动端导航菜单 -->
    <transition name="slide-down">
      <div v-if="isMobileMenuOpen" class="mobile-menu mobile-only">
        <div
          v-for="nav in primaryNav"
          :key="nav.id"
          class="mobile-nav-item"
          :class="{ active: activeNav === nav.id }"
          @click="handleNavClick(nav.id, nav.path)"
        >
          <span class="nav-icon">{{ nav.icon }}</span>
          <span class="nav-label">{{ nav.label }}</span>
        </div>
      </div>
    </transition>
  </nav>
</template>

<style scoped>
/* Clay 主导航栏 */
.main-navbar {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  background: var(--clay-bg);
  border-bottom: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  backdrop-filter: blur(10px);
  z-index: 1000;
}

.nav-content {
  max-width: 1400px;
  height: 64px;
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
  flex-shrink: 0;
}

.logo-icon {
  width: 36px;
  height: 36px;
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
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--clay-text);
  line-height: 1.2;
}

.logo-text-sub {
  font-size: 11px;
  color: var(--clay-text-subtle);
  line-height: 1.2;
}

/* 一级导航菜单 */
.primary-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: center;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--clay-radius-pill);
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
}

.nav-item:hover {
  background: var(--clay-surface-variant);
}

.nav-item.active {
  background: #000000;
  color: #ffffff;
  box-shadow: var(--clay-shadow);
  transform: translateY(-1px);
}

.nav-icon {
  font-size: 16px;
  line-height: 1;
}

.nav-label {
  line-height: 1;
}

/* 右侧操作区域 */
.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.theme-toggle {
  width: 36px;
  height: 36px;
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
  transition: background-color 0.2s ease, transform 0.2s ease;
}

.theme-toggle:hover {
  background: var(--clay-surface-variant);
  transform: translateY(-1px);
}

.btn {
  padding: 8px 18px;
  border-radius: var(--clay-radius-pill);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  color: var(--clay-text);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
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
  background-color: var(--clay-surface-variant);
}

.user-avatar {
  width: 32px;
  height: 32px;
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
  border: 1px solid var(--clay-border);
  padding: 6px 0;
  z-index: 1001;
}

.dropdown-item {
  padding: 10px 14px;
  font-size: 14px;
  color: var(--clay-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  transition: background-color 0.2s ease;
}

.dropdown-item:hover {
  background-color: var(--clay-dropdown-hover);
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
  background-color: var(--clay-surface-error-hover);
}

/* 移动端菜单按钮 */
.mobile-menu-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--clay-radius-standard);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  display: none;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
}

.hamburger-icon {
  width: 20px;
  height: 16px;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.hamburger-icon span {
  display: block;
  width: 100%;
  height: 2px;
  background: var(--clay-text);
  border-radius: 2px;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.hamburger-icon.open span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.hamburger-icon.open span:nth-child(2) {
  opacity: 0;
}

.hamburger-icon.open span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

/* 移动端导航菜单 */
.mobile-menu {
  background: var(--clay-surface);
  border-top: 1px solid var(--clay-border-subtle);
  padding: 12px 16px;
  display: none;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: var(--clay-radius-card);
  cursor: pointer;
  transition: background-color 0.2s ease;
  font-size: 15px;
  font-weight: 500;
  color: var(--clay-text);
}

.mobile-nav-item:hover {
  background: var(--clay-surface-variant);
}

.mobile-nav-item.active {
  background: #000000;
  color: #ffffff;
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

.slide-down-enter-active,
.slide-down-leave-active {
  transition: max-height 0.3s ease, opacity 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
  max-height: 500px;
  opacity: 1;
}

/* 响应式适配 */
.desktop-only {
  display: flex;
}

.mobile-only {
  display: none;
}

@media (max-width: 1024px) {
  .primary-nav {
    display: none;
  }

  .mobile-menu-btn {
    display: flex;
  }

  .mobile-menu {
    display: block;
  }

  .logo-text-sub {
    display: none;
  }
}

@media (max-width: 640px) {
  .nav-content {
    padding: 0 16px;
    height: 56px;
  }

  .logo-text-main {
    font-size: 14px;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
  }

  .user-name {
    display: none;
  }

  .theme-toggle {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }

  .btn-primary {
    padding: 6px 14px;
    font-size: 13px;
  }
}
</style>
