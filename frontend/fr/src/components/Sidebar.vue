<!--
  组件：侧边栏 Sidebar（动态二级导航）
  职责：根据顶部导航选中的一级菜单，动态展示对应的二级功能列表
        支持折叠/展开，移动端为抽屉式
-->
<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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

// 二级导航菜单配置（根据一级菜单动态切换）
const secondaryNavConfig: Record<string, Array<{ id: string; label: string; path: string; icon: string }>> = {
  assessment: [
    { id: 'mbti', label: 'MBTI性格测评', path: '/assessment/mbti', icon: '🧠' },
    { id: 'holland', label: '霍兰德兴趣测评', path: '/assessment/holland', icon: '🎨' },
    { id: 'skills', label: '技能自评', path: '/entry/comprehensive', icon: '⚡' },
    { id: 'values', label: '价值观测评', path: '/assessment/values', icon: '💎' },
    { id: 'aptitude', label: '能力倾向测评', path: '/assessment/aptitude', icon: '🎯' },
    { id: 'reports', label: '测评报告中心', path: '/assessment/reports', icon: '📊' }
  ],
  explore: [
    { id: 'jobs', label: '岗位库', path: '/job-exploration', icon: '💼' },
    { id: 'majors', label: '专业库', path: '/explore/majors', icon: '🎓' },
    { id: 'industries', label: '行业百科', path: '/explore/industries', icon: '🏢' },
    { id: 'companies', label: '企业库', path: '/explore/companies', icon: '🏭' },
    { id: 'interviews', label: '职业人物访谈', path: '/explore/interviews', icon: '🎤' },
    { id: 'favorites', label: '我的收藏', path: '/explore/favorites', icon: '⭐' }
  ],
  planning: [
    { id: 'profile', label: '能力画像', path: '/capability-profile', icon: '👤' },
    { id: 'path', label: '职业路径规划', path: '/path-planning', icon: '🗺️' },
    { id: 'report', label: '规划报告', path: '/report', icon: '📄' },
    { id: 'timeline', label: '职业时间轴', path: '/planning/timeline', icon: '📅' },
    { id: 'okr', label: 'OKR目标管理', path: '/planning/okr', icon: '🎯' },
    { id: 'review', label: '规划复盘', path: '/planning/review', icon: '🔄' }
  ],
  learning: [
    { id: 'path', label: '学习路径', path: '/learning/path', icon: '🛤️' },
    { id: 'courses', label: '课程资源', path: '/learning/courses', icon: '📚' },
    { id: 'checkin', label: '每日打卡', path: '/learning/checkin', icon: '✅' },
    { id: 'pomodoro', label: '番茄钟', path: '/learning/pomodoro', icon: '🍅' },
    { id: 'notes', label: '学习笔记', path: '/learning/notes', icon: '📝' },
    { id: 'certificates', label: '技能认证', path: '/learning/certificates', icon: '🏆' }
  ],
  career: [
    { id: 'resume', label: '简历工坊', path: '/career/resume', icon: '📋' },
    { id: 'score', label: '简历评分', path: '/career/score', icon: '💯' },
    { id: 'jd', label: 'JD分析', path: '/career/jd', icon: '🔍' },
    { id: 'interview', label: '模拟面试', path: '/career/interview', icon: '🎭' },
    { id: 'questions', label: '面试题库', path: '/career/questions', icon: '❓' },
    { id: 'progress', label: '求职进度', path: '/career/progress', icon: '📈' }
  ],
  profile: [
    { id: 'center', label: '个人中心', path: '/profile/center', icon: '👤' },
    { id: 'dashboard', label: '数据看板', path: '/profile/dashboard', icon: '📊' },
    { id: 'reports', label: '我的报告', path: '/reports', icon: '📄' },
    { id: 'achievements', label: '成就徽章', path: '/profile/achievements', icon: '🏅' },
    { id: 'ranking', label: '等级排行', path: '/profile/ranking', icon: '🏆' },
    { id: 'notifications', label: '通知中心', path: '/profile/notifications', icon: '🔔' },
    { id: 'help', label: '帮助中心', path: '/profile/help', icon: '❓' }
  ]
}

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
  const titles: Record<string, string> = {
    assessment: '测评诊断',
    explore: '职业探索',
    planning: '规划管理',
    learning: '学习成长',
    career: '求职准备',
    profile: '个人中心'
  }
  return titles[props.activeNav] || ''
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
