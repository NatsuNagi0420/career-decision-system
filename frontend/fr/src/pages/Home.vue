<!--
  页面：首页 Home（/）- 重构版
  职责：展示所有功能模块入口，提供清晰的导航和引导
  使用 Clay 设计系统 + 功能卡片网格布局
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import MainNavbar from '../components/MainNavbar.vue'
import FeatureCard from '../components/FeatureCard.vue'
import { clearAllLocalCareerData } from '@/utils/storage'

defineOptions({
  name: 'HomePage'
})

const router = useRouter()

// 用户登录状态
const isLoggedIn = ref(false)
const userName = ref('')

// 检查登录状态
onMounted(() => {
  const userData = Cookies.get('userInfo')
  if (userData) {
    try {
      const user = JSON.parse(userData)
      isLoggedIn.value = true
      userName.value = user.username || '用户'
    } catch {
      isLoggedIn.value = false
    }
  }
})

// 功能模块配置（9大模块）
const featureModules = [
  {
    id: 'assessment',
    icon: '🎯',
    title: '测评诊断',
    description: 'MBTI性格、霍兰德兴趣、技能自评等专业测评工具',
    path: '/assessment/mbti',
    color: 'matcha' as const,
    status: 'available' as const,
    badge: ''
  },
  {
    id: 'explore',
    icon: '🔍',
    title: '职业探索',
    description: '岗位库、专业库、行业百科，全面了解职业信息',
    path: '/job-exploration',
    color: 'slushie' as const,
    status: 'available' as const,
    badge: ''
  },
  {
    id: 'planning',
    icon: '📋',
    title: '规划管理',
    description: '能力画像、职业路径规划、生成专属规划报告',
    path: '/capability-profile',
    color: 'ube' as const,
    status: 'available' as const,
    badge: ''
  },
  {
    id: 'learning',
    icon: '📚',
    title: '学习成长',
    description: '学习路径推荐、每日打卡、课程资源与技能认证',
    path: '/learning',
    color: 'lemon' as const,
    status: 'coming-soon' as const,
    badge: ''
  },
  {
    id: 'career',
    icon: '💼',
    title: '求职准备',
    description: '简历工坊、JD分析、模拟面试、求职进度追踪',
    path: '/career',
    color: 'pomegranate' as const,
    status: 'coming-soon' as const,
    badge: ''
  },
  {
    id: 'achievements',
    icon: '🏅',
    title: '激励体系',
    description: '成就徽章、等级成长、排行榜、每日任务签到',
    path: '/profile/achievements',
    color: 'lemon' as const,
    status: 'coming-soon' as const,
    badge: ''
  },
  {
    id: 'community',
    icon: '👥',
    title: '社交互动',
    description: '智能助手、导师匹配、同伴学习、社区问答',
    path: '/community',
    color: 'slushie' as const,
    status: 'coming-soon' as const,
    badge: ''
  },
  {
    id: 'insights',
    icon: '📈',
    title: '数据洞察',
    description: '个人数据看板、能力成长曲线、学习效率分析',
    path: '/profile/dashboard',
    color: 'blueberry' as const,
    status: 'coming-soon' as const,
    badge: ''
  },
  {
    id: 'profile',
    icon: '⚙️',
    title: '个人中心',
    description: '账户设置、通知中心、帮助文档、数据导入导出',
    path: '/profile/center',
    color: 'matcha' as const,
    status: 'available' as const,
    badge: ''
  }
]

// 快速开始流程
const quickStartSteps = [
  { step: 1, label: '完成测评', icon: '🎯' },
  { step: 2, label: '生成画像', icon: '👤' },
  { step: 3, label: '探索岗位', icon: '🔍' },
  { step: 4, label: '规划路径', icon: '🗺️' },
  { step: 5, label: '获取报告', icon: '📄' }
]

// 处理功能卡片点击
const handleFeatureClick = (feature: typeof featureModules[0]) => {
  if (feature.status === 'coming-soon') {
    // 即将上线的功能，显示提示
    return
  }

  if (!isLoggedIn.value && feature.id !== 'explore') {
    // 未登录且不是探索模块，跳转到登录页
    router.push('/login')
    return
  }

  // 如果是测评模块，清理本地数据
  if (feature.id === 'assessment') {
    clearAllLocalCareerData()
  }

  router.push(feature.path)
}

// 快速开始
const quickStart = () => {
  if (!isLoggedIn.value) {
    router.push('/login')
  } else {
    clearAllLocalCareerData()
    router.push('/assessment/mbti')
  }
}
</script>

<template>
  <div class="home-page">
    <!-- 顶部导航 -->
    <MainNavbar />

    <!-- 主内容区 -->
    <main class="home-content">
      <!-- Hero 区域 -->
      <section class="hero-section">
        <div class="hero-container">
          <div class="hero-text">
            <h1 class="hero-title">
              智能职业规划平台
              <span class="title-highlight">助力你的职业成长</span>
            </h1>
            <p class="hero-subtitle">
              基于专业测评与AI智能分析，为大学生提供个性化职业路径规划
            </p>
          </div>

          <!-- 快速开始流程 -->
          <div class="quick-start-section">
            <div class="quick-start-header">
              <h3 class="section-title">5步生成专属规划</h3>
              <button class="start-btn clay-btn-primary" type="button" @click="quickStart">
                {{ isLoggedIn ? '立即开始' : '登录开始' }}
              </button>
            </div>
            <div class="steps-flow">
              <div
                v-for="(step, index) in quickStartSteps"
                :key="step.step"
                class="step-item"
              >
                <div class="step-icon">{{ step.icon }}</div>
                <div class="step-label">{{ step.label }}</div>
                <div v-if="index < quickStartSteps.length - 1" class="step-arrow">→</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 功能模块区域 -->
      <section class="features-section">
        <div class="features-container">
          <div class="section-header">
            <h2 class="section-title">功能模块</h2>
            <p class="section-subtitle">探索平台提供的完整职业规划工具链</p>
          </div>

          <div class="features-grid">
            <FeatureCard
              v-for="feature in featureModules"
              :key="feature.id"
              :icon="feature.icon"
              :title="feature.title"
              :description="feature.description"
              :color="feature.color"
              :status="feature.status"
              :badge="feature.badge"
              :disabled="feature.status === 'coming-soon'"
              @click="handleFeatureClick(feature)"
            />
          </div>
        </div>
      </section>

      <!-- 用户状态提示 -->
      <section v-if="isLoggedIn" class="user-status-section">
        <div class="status-card">
          <div class="status-icon">👋</div>
          <div class="status-content">
            <h3 class="status-title">欢迎回来，{{ userName }}！</h3>
            <p class="status-text">继续你的职业规划之旅，或查看已生成的报告</p>
          </div>
          <div class="status-actions">
            <el-button type="primary" @click="router.push('/reports')">
              我的报告
            </el-button>
            <el-button @click="router.push('/profile/center')">
              个人中心
            </el-button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--clay-bg);
}

.home-content {
  margin-top: 64px;
  padding: 40px 24px 80px;
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
}

/* Hero 区域 */
.hero-section {
  margin-bottom: 64px;
}

.hero-container {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-section);
  padding: 48px;
  box-shadow: var(--clay-shadow);
  display: flex;
  flex-direction: column;
  gap: 40px;
}

.hero-text {
  text-align: center;
}

.hero-title {
  font-size: 44px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 16px 0;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.title-highlight {
  display: inline-block;
  background: linear-gradient(135deg, var(--clay-matcha-600) 0%, var(--clay-slushie-500) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 18px;
  color: var(--clay-text-subtle);
  margin: 0;
  line-height: 1.6;
}

/* 快速开始流程 */
.quick-start-section {
  background: var(--clay-surface-variant);
  border: 1px solid var(--clay-border-subtle);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
}

.quick-start-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
}

.section-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0;
}

.steps-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.step-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  box-shadow: var(--clay-shadow);
}

.step-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--clay-text);
}

.step-arrow {
  font-size: 20px;
  color: var(--clay-text-subtle);
  margin: 0 8px;
}

/* 功能模块区域 */
.features-section {
  margin-bottom: 64px;
}

.features-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.section-header {
  text-align: center;
}

.section-subtitle {
  font-size: 16px;
  color: var(--clay-text-subtle);
  margin: 8px 0 0 0;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

/* 用户状态区域 */
.user-status-section {
  margin-bottom: 32px;
}

.status-card {
  background: linear-gradient(135deg, var(--clay-surface) 0%, var(--clay-surface-lemon) 100%);
  border: 1px solid var(--clay-lemon-400);
  border-radius: var(--clay-radius-feature);
  padding: 32px;
  box-shadow: var(--clay-shadow);
  display: flex;
  align-items: center;
  gap: 24px;
}

.status-icon {
  font-size: 48px;
  flex-shrink: 0;
}

.status-content {
  flex: 1;
}

.status-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 8px 0;
}

.status-text {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin: 0;
}

.status-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .home-content {
    padding: 32px 20px 64px;
  }

  .hero-container {
    padding: 36px 28px;
  }

  .hero-title {
    font-size: 36px;
  }

  .features-grid {
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
  }
}

@media (max-width: 768px) {
  .home-content {
    margin-top: 56px;
    padding: 24px 16px 80px;
  }

  .hero-container {
    padding: 28px 20px;
    gap: 32px;
  }

  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .quick-start-section {
    padding: 24px 20px;
  }

  .quick-start-header {
    flex-direction: column;
    align-items: stretch;
  }

  .start-btn {
    width: 100%;
  }

  .steps-flow {
    flex-direction: column;
    align-items: stretch;
  }

  .step-item {
    justify-content: flex-start;
  }

  .step-arrow {
    display: none;
  }

  .features-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .status-card {
    flex-direction: column;
    padding: 24px 20px;
    text-align: center;
  }

  .status-actions {
    width: 100%;
    flex-direction: column;
  }

  .status-actions :deep(.el-button) {
    width: 100%;
  }
}
</style>
