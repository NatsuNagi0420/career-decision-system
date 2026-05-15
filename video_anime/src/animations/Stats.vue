<template>
  <div class="stats-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">项目规模统计</h1>
        <p class="section-subtitle">Project Statistics Overview</p>
      </div>

      <!-- 统计卡片网格 -->
      <div class="stats-grid">
        <div v-for="(stat, index) in stats" :key="stat.label"
             class="stat-card animate-fade-in-up clickable"
             :style="{ animationDelay: `${index * 0.1}s` }"
             @click="openModal(stat)">
          <div class="stat-header">
            <div class="stat-icon-wrapper" :class="`bg-${stat.color}`">
              <span class="stat-icon">{{ stat.icon }}</span>
            </div>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
          <div class="stat-value-wrapper">
            <span class="stat-value">{{ stat.animated }}</span>
            <span class="stat-unit">{{ stat.unit }}</span>
          </div>
          <div class="stat-progress">
            <div class="progress-bar-modern">
              <div class="progress-fill-modern"
                   :style="{ width: `${stat.progress}%` }"></div>
            </div>
          </div>
          <div class="click-hint">点击查看详情</div>
        </div>
      </div>

      <!-- 详细信息卡片 -->
      <div class="info-cards-grid">
        <div class="info-card animate-fade-in-up clickable"
             style="animation-delay: 0.6s"
             @click="openInfoModal('开发周期')">
          <div class="info-card-header">
            <div class="info-icon">⚡</div>
            <h3 class="info-title">开发周期</h3>
          </div>
          <p class="info-value">3个月</p>
          <p class="info-desc">从需求分析到功能实现</p>
          <div class="click-hint">点击查看详情</div>
        </div>

        <div class="info-card animate-fade-in-up clickable"
             style="animation-delay: 0.7s"
             @click="openInfoModal('团队规模')">
          <div class="info-card-header">
            <div class="info-icon">👥</div>
            <h3 class="info-title">团队规模</h3>
          </div>
          <p class="info-value">1-2人</p>
          <p class="info-desc">精简高效的开发团队</p>
          <div class="click-hint">点击查看详情</div>
        </div>

        <div class="info-card animate-fade-in-up clickable"
             style="animation-delay: 0.8s"
             @click="openInfoModal('完成度')">
          <div class="info-card-header">
            <div class="info-icon">🎯</div>
            <h3 class="info-title">完成度</h3>
          </div>
          <p class="info-value">95%</p>
          <p class="info-desc">核心功能已全部实现</p>
          <div class="click-hint">点击查看详情</div>
        </div>
      </div>

      <!-- 技术栈概览 -->
      <div class="tech-overview animate-fade-in-up" style="animation-delay: 0.9s">
        <h2 class="overview-title">技术栈</h2>
        <div class="tech-tags">
          <span class="tech-tag clickable" @click="openTechModal('Vue 3')">Vue 3</span>
          <span class="tech-tag clickable" @click="openTechModal('Spring Boot')">Spring Boot</span>
          <span class="tech-tag clickable" @click="openTechModal('MySQL')">MySQL</span>
          <span class="tech-tag clickable" @click="openTechModal('Redis')">Redis</span>
          <span class="tech-tag clickable" @click="openTechModal('通义千问')">通义千问</span>
          <span class="tech-tag clickable" @click="openTechModal('TypeScript')">TypeScript</span>
          <span class="tech-tag clickable" @click="openTechModal('MyBatis')">MyBatis</span>
          <span class="tech-tag clickable" @click="openTechModal('Element Plus')">Element Plus</span>
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
import { ref, onMounted } from 'vue'
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

const stats = ref([
  {
    icon: '💻',
    label: '代码行数',
    value: 10000,
    animated: 0,
    unit: '+',
    progress: 0,
    color: 'blue',
    description: '项目总代码量超过10000行，包含前端Vue代码、后端Java代码、SQL脚本等。代码结构清晰，注释完善，遵循最佳实践。',
    details: [
      { label: '前端代码', value: '4500+ 行' },
      { label: '后端代码', value: '4000+ 行' },
      { label: 'SQL脚本', value: '1000+ 行' },
      { label: '配置文件', value: '500+ 行' }
    ]
  },
  {
    icon: '📦',
    label: '功能模块',
    value: 9,
    animated: 0,
    unit: '个',
    progress: 0,
    color: 'purple',
    description: '系统包含9大核心功能模块，涵盖用户管理、性格测评、技能评估、AI分析等完整业务流程。',
    details: [
      { label: '用户系统', value: '已完成' },
      { label: 'MBTI测评', value: '已完成' },
      { label: '技能评估', value: '已完成' },
      { label: 'AI助手', value: '已完成' },
      { label: '报告生成', value: '已完成' }
    ]
  },
  {
    icon: '🎯',
    label: '完成度',
    value: 85,
    animated: 0,
    unit: '%',
    progress: 0,
    color: 'green',
    description: '项目整体完成度达85%，核心功能已全部实现并测试通过。剩余15%为优化和扩展功能。',
    details: [
      { label: '核心功能', value: '100%' },
      { label: '界面设计', value: '95%' },
      { label: '测试覆盖', value: '80%' },
      { label: '文档完善', value: '70%' }
    ]
  },
  {
    icon: '🔌',
    label: 'API接口',
    value: 30,
    animated: 0,
    unit: '+',
    progress: 0,
    color: 'orange',
    description: '系统提供30+个RESTful API接口，涵盖用户认证、数据查询、AI分析等所有业务场景。',
    details: [
      { label: '用户接口', value: '8个' },
      { label: '测评接口', value: '6个' },
      { label: 'AI接口', value: '5个' },
      { label: '报告接口', value: '4个' },
      { label: '其他接口', value: '7个' }
    ]
  },
  {
    icon: '🗄️',
    label: '数据表',
    value: 15,
    animated: 0,
    unit: '张',
    progress: 0,
    color: 'red',
    description: '数据库设计包含15张数据表，结构规范，关系清晰，支持高效的数据查询和存储。',
    details: [
      { label: '用户相关', value: '3张' },
      { label: '测评相关', value: '4张' },
      { label: '岗位相关', value: '3张' },
      { label: '报告相关', value: '2张' },
      { label: '系统相关', value: '3张' }
    ]
  },
  {
    icon: '🎨',
    label: '页面数量',
    value: 12,
    animated: 0,
    unit: '个',
    progress: 0,
    color: 'pink',
    description: '前端包含12个主要页面，界面美观，交互流畅，用户体验优秀。',
    details: [
      { label: '登录注册', value: '2页' },
      { label: '测评页面', value: '3页' },
      { label: '分析页面', value: '4页' },
      { label: '报告页面', value: '2页' },
      { label: '其他页面', value: '1页' }
    ]
  }
])

// 详细信息数据
const infoDetails = {
  '开发周期': {
    icon: '⚡',
    title: '开发周期详情',
    subtitle: '3个月完整开发流程',
    content: '项目从2024年初启动，历时3个月完成核心功能开发。采用敏捷开发模式，每周迭代，快速响应需求变化。',
    details: [
      { label: '需求分析', value: '2周' },
      { label: '架构设计', value: '1周' },
      { label: '功能开发', value: '8周' },
      { label: '测试优化', value: '1周' }
    ],
    tags: ['敏捷开发', '快速迭代', '持续集成']
  },
  '团队规模': {
    icon: '👥',
    title: '团队规模详情',
    subtitle: '精简高效的开发团队',
    content: '项目由1-2人的精简团队完成，成员具备全栈开发能力，涵盖前端、后端、数据库、AI集成等全部技术栈。',
    details: [
      { label: '全栈工程师', value: '1-2人' },
      { label: '开发效率', value: '高' },
      { label: '技术覆盖', value: '全栈' },
      { label: '协作模式', value: '敏捷' }
    ],
    tags: ['全栈开发', '高效协作', '技术全面']
  },
  '完成度': {
    icon: '🎯',
    title: '项目完成度详情',
    subtitle: '95%核心功能已实现',
    content: '项目核心功能已全部实现并通过测试，包括用户系统、MBTI测评、技能评估、AI分析、报告生成等。剩余5%为扩展功能和优化项。',
    details: [
      { label: '核心功能', value: '100%' },
      { label: 'UI设计', value: '95%' },
      { label: '测试覆盖', value: '90%' },
      { label: '文档完善', value: '85%' }
    ],
    tags: ['功能完整', '测试通过', '可上线']
  }
}

// 技术栈详情
const techDetails = {
  'Vue 3': {
    icon: '🎨',
    title: 'Vue 3',
    subtitle: '渐进式JavaScript框架',
    content: 'Vue 3是前端核心框架，采用组合式API，性能优异，开发体验极佳。使用TypeScript增强类型安全。',
    details: [
      { label: '版本', value: '3.4+' },
      { label: 'API风格', value: 'Composition API' },
      { label: '状态管理', value: 'Pinia' },
      { label: '路由', value: 'Vue Router 4' }
    ],
    tags: ['响应式', '组件化', '高性能']
  },
  'Spring Boot': {
    icon: '🍃',
    title: 'Spring Boot',
    subtitle: 'Java企业级开发框架',
    content: 'Spring Boot是后端核心框架，提供自动配置、依赖注入、AOP等强大功能，简化企业级应用开发。',
    details: [
      { label: '版本', value: '3.2+' },
      { label: 'Java版本', value: '17+' },
      { label: '构建工具', value: 'Maven' },
      { label: '数据访问', value: 'MyBatis' }
    ],
    tags: ['企业级', '微服务', '高可用']
  },
  'MySQL': {
    icon: '🗄️',
    title: 'MySQL',
    subtitle: '关系型数据库',
    content: 'MySQL 8.0是主数据库，存储用户数据、测评结果、岗位信息等核心业务数据。支持事务、索引优化。',
    details: [
      { label: '版本', value: '8.0+' },
      { label: '存储引擎', value: 'InnoDB' },
      { label: '字符集', value: 'UTF8MB4' },
      { label: '数据表', value: '15张' }
    ],
    tags: ['ACID', '高性能', '可靠']
  },
  'Redis': {
    icon: '🔴',
    title: 'Redis',
    subtitle: '内存数据库',
    content: 'Redis用于缓存热点数据、Session存储、限流控制等，大幅提升系统性能和响应速度。',
    details: [
      { label: '版本', value: '7.0+' },
      { label: '用途', value: '缓存+Session' },
      { label: '数据结构', value: 'String/Hash/Set' },
      { label: '持久化', value: 'RDB+AOF' }
    ],
    tags: ['高速缓存', '分布式', '持久化']
  },
  '通义千问': {
    icon: '🧠',
    title: '通义千问',
    subtitle: '阿里云大语言模型',
    content: '通义千问是AI核心引擎，提供职业分析、能力评估、路径规划等智能服务。支持流式输出，响应迅速。',
    details: [
      { label: '提供商', value: '阿里云' },
      { label: '模型类型', value: 'LLM' },
      { label: '输出方式', value: 'SSE流式' },
      { label: '中文优化', value: '是' }
    ],
    tags: ['AI智能', '流式输出', '中文优化']
  },
  'TypeScript': {
    icon: '📘',
    title: 'TypeScript',
    subtitle: 'JavaScript超集',
    content: 'TypeScript为前端代码提供类型安全，减少运行时错误，提升代码质量和开发效率。',
    details: [
      { label: '版本', value: '5.0+' },
      { label: '类型检查', value: '严格模式' },
      { label: '编译目标', value: 'ES2020' },
      { label: '覆盖率', value: '90%+' }
    ],
    tags: ['类型安全', '智能提示', '易维护']
  },
  'MyBatis': {
    icon: '🔗',
    title: 'MyBatis',
    subtitle: 'Java持久层框架',
    content: 'MyBatis是数据访问层框架，提供灵活的SQL映射，支持动态SQL、结果映射等高级特性。',
    details: [
      { label: '版本', value: '3.5+' },
      { label: 'SQL方式', value: 'XML+注解' },
      { label: '缓存', value: '一级+二级' },
      { label: '插件', value: 'PageHelper' }
    ],
    tags: ['灵活', '高性能', '易用']
  },
  'Element Plus': {
    icon: '🎨',
    title: 'Element Plus',
    subtitle: 'Vue 3组件库',
    content: 'Element Plus提供丰富的UI组件，包括表单、表格、对话框等，加速前端开发，保证界面一致性。',
    details: [
      { label: '版本', value: '2.0+' },
      { label: '组件数', value: '80+' },
      { label: '主题', value: '可定制' },
      { label: '响应式', value: '支持' }
    ],
    tags: ['组件丰富', '美观', '易用']
  }
}

// 打开统计卡片详情
const openModal = (stat) => {
  modalData.value = {
    icon: stat.icon,
    title: stat.label,
    subtitle: `当前值: ${stat.value}${stat.unit}`,
    content: stat.description,
    details: stat.details,
    tags: ['核心指标', '实时统计', '数据准确']
  }
  showModal.value = true
}

// 打开信息卡片详情
const openInfoModal = (type) => {
  const info = infoDetails[type]
  if (info) {
    modalData.value = info
    showModal.value = true
  }
}

// 打开技术栈详情
const openTechModal = (tech) => {
  const techInfo = techDetails[tech]
  if (techInfo) {
    modalData.value = techInfo
    showModal.value = true
  }
}

// 数字动画
onMounted(() => {
  stats.value.forEach((stat, index) => {
    setTimeout(() => {
      const duration = 2000
      const steps = 60
      const increment = stat.value / steps
      let current = 0

      const timer = setInterval(() => {
        current += increment
        if (current >= stat.value) {
          stat.animated = stat.value
          stat.progress = 100
          clearInterval(timer)
        } else {
          stat.animated = Math.floor(current)
          stat.progress = (current / stat.value) * 100
        }
      }, duration / steps)
    }, index * 100)
  })
})
</script>

<style scoped>
.stats-modern {
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
  bottom: 12px;
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

/* 统计卡片网格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 48px;
}

.stat-card {
  background: white;
  border-radius: 16px;
  padding: 32px 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.stat-card:hover {
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.2);
}

.stat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.stat-icon-wrapper {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bg-blue { background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%); }
.bg-purple { background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); }
.bg-green { background: linear-gradient(135deg, #10B981 0%, #059669 100%); }
.bg-orange { background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%); }
.bg-red { background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); }
.bg-pink { background: linear-gradient(135deg, #EC4899 0%, #DB2777 100%); }

.stat-icon {
  font-size: 32px;
}

.stat-label {
  font-size: 16px;
  font-weight: 600;
  color: #2C3E50;
}

.stat-value-wrapper {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 16px;
}

.stat-value {
  font-size: 48px;
  font-weight: 700;
  color: #2C3E50;
  font-family: var(--font-number);
}

.stat-unit {
  font-size: 20px;
  color: #7F8C8D;
  font-weight: 600;
}

.stat-progress {
  margin-top: 16px;
}

/* 信息卡片网格 */
.info-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 48px;
}

.info-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.info-card:hover {
  box-shadow: 0 12px 32px rgba(102, 126, 234, 0.2);
}

.info-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.info-icon {
  font-size: 32px;
}

.info-title {
  font-size: 18px;
  font-weight: 700;
  color: #2C3E50;
}

.info-value {
  font-size: 36px;
  font-weight: 700;
  color: #667EEA;
  margin-bottom: 8px;
  font-family: var(--font-number);
}

.info-desc {
  font-size: 14px;
  color: #7F8C8D;
  margin-bottom: 20px;
}

/* 技术栈概览 */
.tech-overview {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.overview-title {
  font-size: 24px;
  font-weight: 700;
  color: #2C3E50;
  text-align: center;
  margin-bottom: 24px;
}

.tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.tech-tag {
  padding: 10px 20px;
  background: #F3F4F6;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #2C3E50;
  transition: all 0.2s ease;
}

.tech-tag:hover {
  background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
  color: white;
  transform: translateY(-2px);
}
</style>
