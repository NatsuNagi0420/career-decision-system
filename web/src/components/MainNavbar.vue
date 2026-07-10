<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { logoutApi } from '@/api/user'
import { useThemeStore } from '@/stores/theme'
import { getActivePrimaryNav, primaryNavItems } from '@/config/navigation'
import {
  clearSession,
  getStoredUser,
  SESSION_CLEARED_EVENT,
  SESSION_REFRESHED_EVENT,
  type SessionUser
} from '@/utils/session'

defineOptions({ name: 'MainNavbar' })

const emit = defineEmits<{
  'nav-change': [navId: string]
}>()

const router = useRouter()
const route = useRoute()
const themeStore = useThemeStore()

const isDark = computed(() => themeStore.isDark)
const user = ref<SessionUser | null>(null)
const isDropdownOpen = ref(false)
const isMobileMenuOpen = ref(false)

const activeNav = computed(() => {
  return getActivePrimaryNav(route.path)
})

const isLoggedIn = computed(() => !!user.value?.id)

const syncSession = () => {
  user.value = getStoredUser()
}

const toggleTheme = () => themeStore.toggleTheme()

const handleNav = (path: string) => {
  router.push(path)
  isMobileMenuOpen.value = false
}

const handleNavClick = (navId: string, path: string) => {
  emit('nav-change', navId)
  handleNav(path)
}

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const handleLogout = async () => {
  isDropdownOpen.value = false
  try {
    await logoutApi()
  } catch {
    // Local logout should still complete if the remote session is already invalid.
  } finally {
    clearSession()
    syncSession()
    router.push('/login')
  }
}

const handleGlobalClick = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  if (!target.closest('.user-profile-wrapper')) {
    isDropdownOpen.value = false
  }
  if (!target.closest('.mobile-menu-wrapper') && !target.closest('.mobile-menu-btn')) {
    isMobileMenuOpen.value = false
  }
}

onMounted(() => {
  syncSession()
  window.addEventListener('click', handleGlobalClick)
  window.addEventListener(SESSION_REFRESHED_EVENT, syncSession)
  window.addEventListener(SESSION_CLEARED_EVENT, syncSession)
})

onUnmounted(() => {
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener(SESSION_REFRESHED_EVENT, syncSession)
  window.removeEventListener(SESSION_CLEARED_EVENT, syncSession)
})
</script>

<template>
  <nav class="main-navbar">
    <div class="nav-content">
      <button class="logo" type="button" @click="handleNav('/')">
        <img src="/favicon.png" alt="" class="logo-icon-img" />
        <span class="logo-text-wrap">
          <span class="logo-text-main">职业决策系统</span>
          <span class="logo-text-sub">AI Career Decision</span>
        </span>
      </button>

      <div class="primary-nav desktop-only">
        <button
          v-for="nav in primaryNavItems"
          :key="nav.id"
          class="nav-item"
          :class="{ active: activeNav === nav.id }"
          type="button"
          @click="handleNavClick(nav.id, nav.path)"
        >
          {{ nav.label }}
        </button>
      </div>

      <div class="nav-actions">
        <button class="theme-toggle" type="button" @click="toggleTheme">
          {{ isDark ? '浅色' : '深色' }}
        </button>

        <button v-if="!isLoggedIn" class="btn btn-primary" type="button" @click="handleNav('/login')">
          登录 / 注册
        </button>

        <div v-else class="user-profile-wrapper">
          <button class="user-profile" type="button" @click.stop="toggleDropdown">
            <img :src="user?.avatar || '/profile/defaultIcon.png'" alt="" class="user-avatar" />
            <span class="user-name desktop-only">{{ user?.username }}</span>
          </button>
          <div v-if="isDropdownOpen" class="dropdown-menu">
            <button class="dropdown-item" type="button" @click="handleNav('/reports')">我的报告</button>
            <button class="dropdown-item logout" type="button" @click="handleLogout">退出登录</button>
          </div>
        </div>

        <button class="mobile-menu-btn mobile-only" type="button" @click.stop="toggleMobileMenu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </div>

    <div v-if="isMobileMenuOpen" class="mobile-menu mobile-only">
      <button
        v-for="nav in primaryNavItems"
        :key="nav.id"
        class="mobile-nav-item"
        :class="{ active: activeNav === nav.id }"
        type="button"
        @click="handleNavClick(nav.id, nav.path)"
      >
        {{ nav.label }}
      </button>
    </div>
  </nav>
</template>

<style scoped>
.main-navbar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 1000;
  background: var(--clay-bg);
  border-bottom: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
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

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--clay-text);
}

.logo-icon-img {
  width: 36px;
  height: 36px;
  border-radius: 999px;
}

.logo-text-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.logo-text-main {
  font-size: 16px;
  font-weight: 700;
}

.logo-text-sub {
  font-size: 11px;
  color: var(--clay-text-subtle);
}

.primary-nav,
.nav-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.primary-nav {
  flex: 1;
  justify-content: center;
}

.nav-item,
.btn,
.theme-toggle,
.user-profile,
.dropdown-item,
.mobile-nav-item {
  border: 1px solid transparent;
  background: transparent;
  color: var(--clay-text);
  cursor: pointer;
  font: inherit;
}

.nav-item {
  padding: 8px 16px;
  border-radius: 999px;
}

.nav-item:hover,
.nav-item.active {
  background: var(--clay-surface-variant);
}

.btn-primary {
  padding: 8px 18px;
  border-radius: 999px;
  background: #000;
  color: #fff;
}

.theme-toggle {
  padding: 7px 12px;
  border-radius: 999px;
  border-color: var(--clay-border);
  background: var(--clay-surface);
}

.user-profile-wrapper {
  position: relative;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 999px;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}

.dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: 160px;
  padding: 6px;
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.dropdown-item {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  text-align: left;
}

.dropdown-item:hover {
  background: var(--clay-dropdown-hover);
}

.logout {
  color: #b42318;
}

.mobile-menu-btn {
  display: none;
  width: 36px;
  height: 36px;
  border: 1px solid var(--clay-border);
  border-radius: 8px;
  background: var(--clay-surface);
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.mobile-menu-btn span {
  width: 18px;
  height: 2px;
  background: var(--clay-text);
}

.mobile-menu {
  padding: 12px 16px;
  border-top: 1px solid var(--clay-border-subtle);
  background: var(--clay-surface);
}

.mobile-nav-item {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  text-align: left;
}

.mobile-nav-item.active {
  background: var(--clay-surface-variant);
}

.mobile-only {
  display: none;
}

@media (max-width: 1024px) {
  .desktop-only {
    display: none;
  }

  .mobile-only,
  .mobile-menu-btn {
    display: flex;
  }

  .mobile-menu {
    display: block;
  }
}
</style>
