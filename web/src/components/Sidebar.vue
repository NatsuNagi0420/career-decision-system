<!--
  组件：侧边栏 Sidebar（动态二级导航）
  职责：根据顶部导航选中的一级菜单，动态展示对应的二级功能列表
        支持折叠/展开，移动端为抽屉式
-->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { secondaryNavConfig, sidebarTitles } from '@/config/navigation'

defineOptions({
  name: 'AppSidebar'
})

const props = defineProps<{
  activeNav: string // 当前激活的一级导航 ID
  collapsed?: boolean // 是否折叠（桌面端）
  isMobile?: boolean // 是否移动端
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  close: []
}>()

const router = useRouter()
const route = useRoute()

// 当前显示的二级菜单
const currentMenu = computed(() => {
  return secondaryNavConfig[props.activeNav] || []
})

// 当前激活的二级菜单项
const activeItem = computed(() => {
  const p = route.path
  return currentMenu.value.find(item => item.path === p)?.id || ''
})

// 侧边栏标题
const sidebarTitle = computed(() => {
  return sidebarTitles[props.activeNav] || ''
})

// 处理菜单项点击
const handleItemClick = (path: string) => {
  router.push(path)
  if (props.isMobile) {
    emit('close')
  }
}

// 切换折叠状态
const toggleCollapse = () => {
  emit('update:collapsed', !props.collapsed)
}

// 监听一级导航变化，移动端自动关闭侧边栏
watch(() => props.activeNav, () => {
  if (props.isMobile) {
    emit('close')
  }
})
</script>

<template>
  <aside
    class="sidebar"
    :class="{
      collapsed: collapsed && !isMobile,
      mobile: isMobile,
      'has-menu': currentMenu.length > 0
    }"
  >
    <!-- 侧边栏头部 -->
    <div v-if="currentMenu.length > 0" class="sidebar-header">
      <div class="sidebar-title">
        <span class="title-text">{{ sidebarTitle }}</span>
        <span class="menu-count">{{ currentMenu.length }}</span>
      </div>
      <button
        v-if="!isMobile"
        class="collapse-btn"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        @click="toggleCollapse"
      >
        <span class="collapse-icon" :class="{ collapsed }">◀</span>
      </button>
      <button
        v-if="isMobile"
        class="close-btn"
        type="button"
        aria-label="关闭侧边栏"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- 侧边栏菜单列表 -->
    <nav class="sidebar-nav">
      <div
        v-for="item in currentMenu"
        :key="item.id"
        class="nav-item"
        :class="{ active: activeItem === item.id }"
        @click="handleItemClick(item.path)"
      >
        <span class="item-icon">{{ item.icon }}</span>
        <span v-if="!collapsed || isMobile" class="item-label">{{ item.label }}</span>
      </div>
    </nav>

    <!-- 空状态提示 -->
    <div v-if="currentMenu.length === 0" class="sidebar-empty">
      <div class="empty-icon">📂</div>
      <div class="empty-text">请从顶部导航选择功能模块</div>
    </div>
  </aside>
</template>

<style scoped>
/* 侧边栏基础样式 */
.sidebar {
  position: fixed;
  left: 0;
  top: 64px;
  bottom: 0;
  width: 240px;
  background: var(--clay-surface);
  border-right: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease, transform 0.3s ease;
  z-index: 999;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 72px;
}

/* 移动端侧边栏（抽屉式） */
.sidebar.mobile {
  top: 56px;
  width: 280px;
  transform: translateX(-100%);
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.sidebar.mobile.has-menu {
  transform: translateX(0);
  box-shadow: 4px 0 12px rgba(0, 0, 0, 0.1);
}

/* 侧边栏头部 */
.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--clay-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.title-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--clay-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: var(--clay-radius-pill);
  background: var(--clay-surface-variant);
  font-size: 11px;
  font-weight: 600;
  color: var(--clay-text-subtle);
}

.collapse-btn,
.close-btn {
  width: 28px;
  height: 28px;
  border-radius: var(--clay-radius-standard);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
  flex-shrink: 0;
}

.collapse-btn:hover,
.close-btn:hover {
  background: var(--clay-surface-variant);
  transform: scale(1.05);
}

.collapse-icon {
  font-size: 12px;
  color: var(--clay-text);
  transition: transform 0.3s ease;
  display: inline-block;
}

.collapse-icon.collapsed {
  transform: rotate(180deg);
}

.close-btn {
  font-size: 16px;
  color: var(--clay-text);
  line-height: 1;
}

/* 侧边栏导航列表 */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 8px;
}

.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--clay-scrollbar-thumb);
  border-radius: 3px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: var(--clay-radius-card);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease;
  color: var(--clay-text);
  font-size: 14px;
  font-weight: 500;
}

.nav-item:hover {
  background: var(--clay-surface-variant);
  transform: translateX(2px);
}

.nav-item.active {
  background: #000000;
  color: #ffffff;
  box-shadow: var(--clay-shadow);
}

.item-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.item-label {
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 折叠状态下的样式 */
.sidebar.collapsed .nav-item {
  justify-content: center;
  padding: 12px 8px;
}

.sidebar.collapsed .item-icon {
  font-size: 20px;
}

/* 空状态 */
.sidebar-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  color: var(--clay-text-subtle);
  line-height: 1.6;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .sidebar:not(.mobile) {
    display: none;
  }
}

@media (max-width: 640px) {
  .sidebar.mobile {
    top: 56px;
    width: 100%;
    max-width: 320px;
  }
}
</style>
