<template>
  <div class="feature-roadmap-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">功能规划全景图</h1>
        <p class="section-subtitle">Complete Feature Roadmap - 43 Features Across 9 Modules</p>
      </div>

      <!-- 统计概览 -->
      <div class="stats-overview animate-fade-in-up" style="animation-delay: 0.2s">
        <div class="stat-item">
          <div class="stat-number">{{ animatedImplemented }}</div>
          <div class="stat-label">已实现</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <div class="stat-number">{{ animatedPlanned }}</div>
          <div class="stat-label">规划中</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <div class="stat-number">{{ animatedTotal }}</div>
          <div class="stat-label">功能总数</div>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <div class="stat-number">{{ animatedModules }}</div>
          <div class="stat-label">功能模块</div>
        </div>
      </div>

      <!-- 完成度进度条 -->
      <div class="completion-card animate-fade-in-up" style="animation-delay: 0.3s">
        <div class="completion-header">
          <span class="completion-label">功能完整度</span>
          <span class="completion-percentage">{{ completionPercentage }}%</span>
        </div>
        <div class="progress-bar-modern">
          <div class="progress-fill-modern"
               :style="{ width: `${animatedCompletion}%` }"></div>
        </div>
      </div>

      <!-- 模块网格 -->
      <div class="modules-grid">
        <div v-for="(module, index) in modules" :key="module.name"
             class="module-card animate-fade-in-up clickable"
             :style="{ animationDelay: `${0.4 + index * 0.05}s` }"
             @click="openModuleModal(module)">
          <div class="module-header">
            <div class="module-icon">{{ module.icon }}</div>
            <div class="module-info">
              <h3 class="module-name">{{ module.name }}</h3>
              <span class="module-count">{{ module.features.length }} 项功能</span>
            </div>
          </div>
          <div class="features-list">
            <div v-for="feature in module.features" :key="feature.name"
                 class="feature-item"
                 :class="{ implemented: feature.implemented }">
              <span class="feature-status">
                {{ feature.implemented ? '✓' : '○' }}
              </span>
              <span class="feature-name">{{ feature.name }}</span>
            </div>
          </div>
          <div class="click-hint">点击查看模块详情</div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <DetailModal
      :show="showModal"
      :icon="modalData.icon"
      :title="modalData.title"
      :subtitle="modalData.subtitle"
      :content="modalData.content"
      :details="modalData.details"
      :tags="modalData.tags"
      @close="showModal = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import DetailModal from '../components/DetailModal.vue'

const showModal = ref(false)
const modalData = ref({
  icon: '',
  title: '',
  subtitle: '',
  content: '',
  details: [],
  tags: []
})

const animatedImplemented = ref(0)
const animatedPlanned = ref(0)
const animatedTotal = ref(0)
const animatedModules = ref(0)
const animatedCompletion = ref(0)

const modules = ref([
  {
    name: '用户系统',
    icon: '👤',
    description: '完整的用户认证和权限管理系统，支持注册、登录、权限控制等功能。',
    techStack: ['JWT', 'Spring Security', 'Redis Session'],
    features: [
      { name: '用户注册', implemented: true },
      { name: '用户登录', implemented: true },
      { name: '密码加密', implemented: true },
      { name: '权限管理', implemented: true },
      { name: '个人信息管理', implemented: true }
    ]
  },
  {
    name: 'MBTI性格测评',
    icon: '📝',
    description: '专业的MBTI性格测评系统，包含93道测评题目，自动计算性格类型。',
    techStack: ['Vue 3', 'Element Plus', 'ECharts'],
    features: [
      { name: '93题测评', implemented: true },
      { name: '自动计算', implemented: true },
      { name: '结果展示', implemented: true },
      { name: '历史记录', implemented: true },
      { name: '结果分析', implemented: false }
    ]
  },
  {
    name: '技能自评',
    icon: '⭐',
    description: '多维度技能评估系统，支持自定义技能项和评分标准。',
    techStack: ['Vue 3', 'Vuex', 'Element Plus'],
    features: [
      { name: '技能列表', implemented: true },
      { name: '自评打分', implemented: true },
      { name: '雷达图展示', implemented: true },
      { name: '技能对比', implemented: false },
      { name: '技能推荐', implemented: false }
    ]
  },
  {
    name: '能力画像',
    icon: '🎨',
    description: 'AI驱动的能力画像生成系统，综合分析用户的性格和技能。',
    techStack: ['通义千问', 'ECharts', 'Canvas'],
    features: [
      { name: 'AI分析', implemented: true },
      { name: '雷达图生成', implemented: true },
      { name: '能力评分', implemented: true },
      { name: '优势分析', implemented: false },
      { name: '改进建议', implemented: false }
    ]
  },
  {
    name: '岗位探索',
    icon: '💼',
    description: '丰富的岗位信息库，支持搜索、筛选和详情查看。',
    techStack: ['Spring Boot', 'MyBatis', 'MySQL'],
    features: [
      { name: '岗位列表', implemented: true },
      { name: '岗位搜索', implemented: true },
      { name: '岗位详情', implemented: true },
      { name: '岗位收藏', implemented: false },
      { name: '岗位推荐', implemented: false }
    ]
  },
  {
    name: '职业路径规划',
    icon: '🗺️',
    description: 'AI生成个性化职业发展路径，提供清晰的职业规划建议。',
    techStack: ['通义千问', 'SSE', 'Vue 3'],
    features: [
      { name: 'AI路径生成', implemented: true },
      { name: '流式输出', implemented: true },
      { name: '路径可视化', implemented: true },
      { name: '路径保存', implemented: false },
      { name: '路径分享', implemented: false }
    ]
  },
  {
    name: '综合报告',
    icon: '📊',
    description: '生成完整的职业规划报告，包含所有分析结果和建议。',
    techStack: ['通义千问', 'PDF.js', 'ECharts'],
    features: [
      { name: '报告生成', implemented: true },
      { name: '报告查看', implemented: true },
      { name: '报告列表', implemented: true },
      { name: '报告导出', implemented: false },
      { name: '报告分享', implemented: false }
    ]
  },
  {
    name: 'AI智能助手',
    icon: '🤖',
    description: '实时对话的AI助手，解答职业规划相关问题。',
    techStack: ['通义千问', 'SSE', 'WebSocket'],
    features: [
      { name: '实时对话', implemented: true },
      { name: '流式输出', implemented: true },
      { name: '上下文记忆', implemented: true },
      { name: '多轮对话', implemented: false },
      { name: '语音输入', implemented: false }
    ]
  },
  {
    name: '数据统计',
    icon: '📈',
    description: '系统数据统计和可视化展示，支持多维度数据分析。',
    techStack: ['ECharts', 'Spring Boot', 'Redis'],
    features: [
      { name: '用户统计', implemented: false },
      { name: '测评统计', implemented: false },
      { name: '岗位统计', implemented: false },
      { name: '报告统计', implemented: false },
      { name: '趋势分析', implemented: false }
    ]
  }
])

const implementedCount = computed(() => {
  return modules.value.reduce((sum, module) => {
    return sum + module.features.filter(f => f.implemented).length
  }, 0)
})

const plannedCount = computed(() => {
  return modules.value.reduce((sum, module) => {
    return sum + module.features.filter(f => !f.implemented).length
  }, 0)
})

const totalCount = computed(() => implementedCount.value + plannedCount.value)
const completionPercentage = computed(() =>
  Math.round((implementedCount.value / totalCount.value) * 100)
)

// 打开模块详情
const openModuleModal = (module) => {
  const implemented = module.features.filter(f => f.implemented).length
  const total = module.features.length
  const percentage = Math.round((implemented / total) * 100)

  modalData.value = {
    icon: module.icon,
    title: module.name,
    subtitle: `${implemented}/${total} 功能已实现 (${percentage}%)`,
    content: module.description,
    details: [
      { label: '已实现功能', value: `${implemented}个` },
      { label: '规划中功能', value: `${total - implemented}个` },
      { label: '完成度', value: `${percentage}%` },
      { label: '技术栈', value: module.techStack.join(', ') }
    ],
    tags: module.techStack
  }
  showModal.value = true
}

// 数字动画
onMounted(() => {
  const animateNumber = (target, current, setter, duration = 2000) => {
    const steps = 60
    const increment = target / steps
    let value = 0

    const timer = setInterval(() => {
      value += increment
      if (value >= target) {
        setter(target)
        clearInterval(timer)
      } else {
        setter(Math.floor(value))
      }
    }, duration / steps)
  }

  setTimeout(() => {
    animateNumber(implementedCount.value, animatedImplemented, (v) => animatedImplemented.value = v)
    animateNumber(plannedCount.value, animatedPlanned, (v) => animatedPlanned.value = v)
    animateNumber(totalCount.value, animatedTotal, (v) => animatedTotal.value = v)
    animateNumber(modules.value.length, animatedModules, (v) => animatedModules.value = v)
    animateNumber(completionPercentage.value, animatedCompletion, (v) => animatedCompletion.value = v)
  }, 300)
})
</script>

<style scoped>
.feature-roadmap-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #FAF0E6 0%, #FFF8DC 100%);
  overflow-y: auto;
  overflow-x: hidden;
}

.content-area {
  max-width: 1400px;
  margin: 0 auto;
  padding: 60px 80px 120px 80px;
}

/* 可点击样式 */
.clickable {
  cursor: pointer;
  position: relative;
}

.clickable:hover {
  transform: translateY(-8px) !important;
}

.click-hint {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #667EEA;
  opacity: 0;
  transition: opacity 0.3s ease;
  font-weight: 600;
}

.clickable:hover .click-hint {
  opacity: 1;
}

/* 统计概览 */
.stats-overview {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  background: white;
  border-radius: 16px;
  padding: 32px;
  margin-bottom: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stat-item {
  text-align: center;
}

.stat-number {
  font-size: 48px;
  font-weight: 700;
  color: #667EEA;
  font-family: var(--font-number);
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #7F8C8D;
  font-weight: 600;
}

.stat-divider {
  width: 2px;
  height: 60px;
  background: #E5E7EB;
}

/* 完成度卡片 */
.completion-card {
  background: white;
  border-radius: 16px;
  padding: 24px 32px;
  margin-bottom: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.completion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.completion-label {
  font-size: 16px;
  font-weight: 600;
  color: #2C3E50;
}

.completion-percentage {
  font-size: 24px;
  font-weight: 700;
  color: #667EEA;
  font-family: var(--font-number);
}

/* 模块网格 */
.modules-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.module-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.module-card:hover {
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.2);
}

.module-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 2px solid #F3F4F6;
}

.module-icon {
  font-size: 40px;
}

.module-info {
  flex: 1;
}

.module-name {
  font-size: 18px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 4px;
}

.module-count {
  font-size: 13px;
  color: #7F8C8D;
}

/* 功能列表 */
.features-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #F9FAFB;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.feature-item:hover {
  background: #F3F4F6;
}

.feature-item.implemented {
  background: #D1FAE5;
}

.feature-item.implemented:hover {
  background: #A7F3D0;
}

.feature-status {
  font-size: 14px;
  font-weight: 700;
}

.feature-item.implemented .feature-status {
  color: #059669;
}

.feature-item:not(.implemented) .feature-status {
  color: #CBD5E0;
}

.feature-name {
  font-size: 14px;
  color: #2C3E50;
  font-weight: 500;
}
</style>
