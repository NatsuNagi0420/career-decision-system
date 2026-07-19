<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, type ComponentPublicInstance } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronDown, History, LogOut, MessageCircle, Moon, Settings, Sun, UserRound } from 'lucide-vue-next'
import { logoutApi } from '@/api/user'
import BrandIdentity from '@/components/BrandIdentity.vue'
import { M3IconButton, M3MenuItem } from '@/design-system/components'
import { m3Confirm } from '@/design-system/services/feedback'
import { createThemeTransition } from '@/design-system/theme/themeTransition'
import { useThemeStore } from '@/stores/theme'
import {
  clearSession,
  getStoredUser,
  SESSION_CLEARED_EVENT,
  SESSION_REFRESHED_EVENT,
  type SessionUser
} from '@/utils/session'

defineOptions({ name: 'MainNavbar' })

const router = useRouter()
const themeStore = useThemeStore()
const user = ref<SessionUser | null>(null)
const isDropdownOpen = ref(false)
const userMenuTrigger = ref<ComponentPublicInstance | null>(null)
const isDark = computed(() => themeStore.isDark)
const isLoggedIn = computed(() => Boolean(user.value?.id))
const themeTransition = createThemeTransition()

const syncSession = () => { user.value = getStoredUser() }

const handleNav = async (path: string) => {
  isDropdownOpen.value = false
  await router.push(path)
}

const handleLogout = async () => {
  await m3Confirm('退出后需要重新登录才能继续使用，确认退出吗？', '退出登录', {
    confirmButtonText: '退出登录',
    cancelButtonText: '取消',
    type: 'warning'
  })
  isDropdownOpen.value = false
  try {
    await logoutApi()
  } catch {
    // 即使远端会话已失效，也必须完成本地退出。
  } finally {
    clearSession()
    syncSession()
    await router.push('/login')
  }
}

const handleGlobalClick = (event: MouseEvent) => {
  if (!(event.target as HTMLElement).closest('.user-profile-wrapper')) isDropdownOpen.value = false
}

const handleThemeToggle = (event: MouseEvent) => {
  const trigger = event.currentTarget as HTMLElement | null
  if (!trigger) {
    themeStore.toggleTheme()
    return
  }

  void themeTransition.run(trigger, async () => {
    themeStore.toggleTheme()
    await nextTick()
  })
}

const closeAccountMenu = async (restoreFocus: boolean) => {
  isDropdownOpen.value = false
  if (!restoreFocus) return
  await nextTick()
  ;(userMenuTrigger.value?.$el as HTMLElement | undefined)?.focus()
}

onMounted(() => {
  syncSession()
  window.addEventListener('click', handleGlobalClick)
  window.addEventListener(SESSION_REFRESHED_EVENT, syncSession)
  window.addEventListener(SESSION_CLEARED_EVENT, syncSession)
})

onUnmounted(() => {
  themeTransition.cancel()
  window.removeEventListener('click', handleGlobalClick)
  window.removeEventListener(SESSION_REFRESHED_EVENT, syncSession)
  window.removeEventListener(SESSION_CLEARED_EVENT, syncSession)
})
</script>

<template>
  <M3TopAppBar class="top-app-bar" aria-label="应用栏">
    <M3Button class="brand" variant="text" aria-label="返回工作台" @click="handleNav('/')">
      <BrandIdentity />
    </M3Button>

    <div class="top-actions">
      <M3IconButton :label="isDark ? '切换浅色模式' : '切换深色模式'" @click="handleThemeToggle">
        <Sun v-if="isDark" />
        <Moon v-else />
      </M3IconButton>

      <M3Button v-if="!isLoggedIn" class="login-action" @click="handleNav('/login')">登录 / 注册</M3Button>

      <div v-else class="user-profile-wrapper">
        <M3Button ref="userMenuTrigger" class="user-profile" variant="text" :aria-label="user?.username || '账户菜单'" :aria-expanded="isDropdownOpen" aria-haspopup="menu" @click.stop="isDropdownOpen = !isDropdownOpen">
          <img :src="user?.avatar || '/profile/defaultIcon.png'" alt="" data-magnetic-preserve />
          <span class="user-profile-name">{{ user?.username }}</span>
          <ChevronDown class="user-profile-chevron" :size="18" aria-hidden="true" />
        </M3Button>

        <M3Menu v-if="isDropdownOpen" class="account-menu" label="账户菜单" @close="closeAccountMenu">
          <M3MenuItem class="menu-action" @click="handleNav('/profile')"><template #icon><UserRound :size="19" /></template>个人档案</M3MenuItem>
          <M3MenuItem class="menu-action" @click="handleNav('/history')"><template #icon><History :size="19" /></template>历史记录</M3MenuItem>
          <M3MenuItem class="menu-action" @click="handleNav('/assistant')"><template #icon><MessageCircle :size="19" /></template>穗奈助手</M3MenuItem>
          <M3MenuItem class="menu-action" @click="handleNav('/settings')"><template #icon><Settings :size="19" /></template>设置</M3MenuItem>
          <div class="menu-divider" role="separator"></div>
          <M3MenuItem class="menu-action logout-action" @click="handleLogout"><template #icon><LogOut :size="19" /></template>退出登录</M3MenuItem>
        </M3Menu>
      </div>
    </div>
  </M3TopAppBar>
</template>

<style scoped>
.top-app-bar {
  position: fixed;
  z-index: 110;
  top: 0;
  right: 0;
  left: 0;
  display: flex;
  height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border-bottom: 1px solid var(--md-sys-color-outline-variant);
  padding: 0 20px;
  background: color-mix(in srgb, var(--md-sys-color-surface) 92%, transparent);
  backdrop-filter: blur(16px);
}

.brand {
  --m3-button-label-gap: var(--career-spacing-3);
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: var(--md-sys-shape-corner-small);
  padding: 4px 8px 4px 4px;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  cursor: pointer;
}
.brand:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }

.top-actions { display: flex; align-items: center; gap: 8px; }
.login-action, .user-profile {
  --m3-button-label-gap: var(--career-spacing-2);
  display: inline-flex;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: var(--md-sys-shape-corner-full);
  padding: 0 16px;
  background: transparent;
  color: var(--md-sys-color-on-surface);
  font-size: var(--md-sys-typescale-label-large-size);
  font-weight: 500;
  cursor: pointer;
}
.login-action { background: var(--md-sys-color-primary); color: var(--md-sys-color-on-primary); }
.user-profile:hover { background: color-mix(in srgb, var(--md-sys-color-on-surface) 8%, transparent); }
.user-profile img { width: 36px; height: 36px; border-radius: var(--md-sys-shape-corner-full); object-fit: cover; background: var(--md-sys-color-surface-container-highest); }
.user-profile-wrapper { position: relative; }

.account-menu {
  position: absolute;
  z-index: 120;
  top: calc(100% + 8px);
  right: 0;
  display: grid;
  width: 200px;
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 8px 0;
  background: var(--md-sys-color-surface-container);
  box-shadow: var(--md-sys-elevation-level3);
}
.account-menu .menu-action { width: 100%; min-height: 48px; justify-content: flex-start; text-align: left; }
.account-menu .logout-action { color: var(--md-sys-color-error); --md-menu-item-label-text-color: var(--md-sys-color-error); --md-menu-item-leading-icon-color: var(--md-sys-color-error); }
.menu-divider { height: 1px; margin: 8px 0; background: var(--md-sys-color-outline-variant); }

@media (max-width: 599px) {
  .top-app-bar { padding: 0 8px 0 12px; }
  .brand :deep(.brand-identity__descriptor), .user-profile-name, .user-profile-chevron { display: none; }
  .brand { gap: 8px; padding-right: 4px; }
  .brand :deep(.brand-identity) { gap: var(--career-spacing-2); }
  .brand :deep(.brand-identity__avatar) { width: 36px; height: 36px; }
  .brand :deep(.brand-identity__wordmark) { width: 88px; }
  .user-profile { width: 48px; padding: 0 6px; }
  .account-menu { position: fixed; top: 60px; right: 8px; }
}
</style>
