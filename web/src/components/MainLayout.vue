<!--
  组件：主布局 MainLayout（整合顶部导航 + 侧边栏 + 内容区）
  职责：提供统一的页面布局框架，管理导航状态和响应式行为
-->
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import MainNavbar from './MainNavbar.vue'
import Sidebar from './Sidebar.vue'
import WorkflowStepper from './WorkflowStepper.vue'
import { bottomNavItems, getActivePrimaryNav, isWorkflowPath } from '@/config/navigation'

defineOptions({
  name: 'MainLayout'
})

const route = useRoute()

// 响应式状态
const isMobile = ref(false)
const sidebarCollapsed = ref(false)
const mobileSidebarOpen = ref(false)
const mobileBottomNavVisible = ref(true)

// 当前激活的一级导航
const activeNav = computed(() => {
  return getActivePrimaryNav(route.path)
})

const showWorkflowStepper = computed(() => {
  return isWorkflowPath(route.path)
})

// 是否显示侧边栏（首页和登录页不显示）
const showSidebar = computed(() => {
  return activeNav.value !== 'home' && activeNav.value !== '' && route.path !== '/login'
})

// 内容区域的左边距（桌面端根据侧边栏状态调整）
const contentMarginLeft = computed(() => {
  if (isMobile.value) return '0'
  if (!showSidebar.value) return '0'
  return sidebarCollapsed.value ? '72px' : '240px'
})

// 检测屏幕尺寸
const checkMobile = () => {
  isMobile.value = window.innerWidth <= 1024
  if (!isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

onMounted(() => {
  checkMobile()
  window.addEventListener('resize', checkMobile)
})

onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
})

// 处理导航切换
const handleNavChange = (navId: string) => {
  // 移动端：切换导航时打开侧边栏
  if (isMobile.value && navId !== 'home') {
    mobileSidebarOpen.value = true
  }
}

// 关闭移动端侧边栏
const closeMobileSidebar = () => {
  mobileSidebarOpen.value = false
}

</script>

<template>
  <div class="main-layout">
    <!-- 顶部导航栏 -->
    <MainNavbar @nav-change="handleNavChange" />

    <!-- 侧边栏（桌面端固定，移动端抽屉式） -->
    <Sidebar
      v-if="showSidebar"
      :active-nav="activeNav"
      :collapsed="sidebarCollapsed"
      :is-mobile="isMobile"
      :class="{ 'mobile-open': mobileSidebarOpen && isMobile }"
      @update:collapsed="sidebarCollapsed = $event"
      @close="closeMobileSidebar"
    />

    <!-- 移动端侧边栏遮罩 -->
    <transition name="fade">
      <div
        v-if="mobileSidebarOpen && isMobile"
        class="sidebar-overlay"
        @click="closeMobileSidebar"
      ></div>
    </transition>

    <!-- 主内容区域 -->
    <main
      class="main-content"
      :style="{ marginLeft: contentMarginLeft }"
      :class="{ 'with-bottom-nav': isMobile && mobileBottomNavVisible }"
    >
      <WorkflowStepper v-if="showWorkflowStepper" />
      <slot />
    </main>

    <!-- 移动端底部导航栏 -->
    <nav v-if="isMobile && mobileBottomNavVisible" class="bottom-nav">
      <router-link
        v-for="item in bottomNavItems"
        :key="item.id"
        :to="item.path"
        class="bottom-nav-item"
        :class="{ active: activeNav === item.id }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </nav>
  </div>
</template>

<style scoped>
/* 主布局容器 */
.main-layout {
  min-height: 100vh;
  background: var(--clay-bg);
  display: flex;
  flex-direction: column;
}

/* 主内容区域 */
.main-content {
  flex: 1;
  margin-top: 64px;
  padding: 24px;
  transition: margin-left 0.3s ease;
  min-height: calc(100vh - 64px);
}

.main-content.with-bottom-nav {
  margin-bottom: 64px;
  min-height: calc(100vh - 64px - 64px);
}

/* 移动端侧边栏遮罩 */
.sidebar-overlay {
  position: fixed;
  top: 56px;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
  backdrop-filter: blur(2px);
}

/* 移动端底部导航栏 */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 64px;
  background: var(--clay-surface);
  border-top: 1px solid var(--clay-border);
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-around;
  padding: 0 8px;
  z-index: 1000;
}

.bottom-nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: var(--clay-radius-card);
  text-decoration: none;
  color: var(--clay-text-subtle);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
  flex: 1;
  max-width: 80px;
}

.bottom-nav-item:hover {
  background: var(--clay-surface-variant);
}

.bottom-nav-item.active {
  background: #000000;
  color: #ffffff;
  transform: translateY(-2px);
}

.bottom-nav-item .nav-icon {
  font-size: 20px;
  line-height: 1;
}

.bottom-nav-item .nav-label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
}

/* 动画效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .main-content {
    margin-left: 0 !important;
  }
}

@media (max-width: 640px) {
  .main-content {
    margin-top: 56px;
    padding: 16px;
    min-height: calc(100vh - 56px);
  }

  .main-content.with-bottom-nav {
    min-height: calc(100vh - 56px - 64px);
  }

  .sidebar-overlay {
    top: 56px;
  }
}
</style>
