<template>
  <div class="flow-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">系统功能流程</h1>
        <p class="section-subtitle">8 Core Functions - Complete User Journey</p>
      </div>

      <!-- 流程步骤 -->
      <div class="flow-container">
        <div v-for="(item, index) in steps" :key="item.name"
             class="flow-step animate-fade-in-up"
             :class="{ active: currentStep >= index }"
             :style="{ animationDelay: `${index * 0.1}s` }">

          <!-- 步骤卡片 -->
          <div class="step-card">
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-icon">{{ item.icon }}</div>
            <div class="step-content">
              <h3 class="step-name">{{ item.name }}</h3>
              <p class="step-desc">{{ item.desc }}</p>
            </div>
            <div v-if="item.implemented" class="step-badge">
              <span class="badge badge-success">已实现</span>
            </div>
          </div>

          <!-- 连接箭头 -->
          <div v-if="index < steps.length - 1" class="flow-arrow">
            <svg width="40" height="80" viewBox="0 0 40 80">
              <path d="M 20 0 L 20 60 L 10 50 M 20 60 L 30 50"
                    stroke="#CBD5E0"
                    stroke-width="2"
                    fill="none"
                    :class="{ active: currentStep > index }" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 进度指示 -->
      <div class="progress-section animate-fade-in-up" style="animation-delay: 0.8s">
        <div class="progress-header">
          <span class="progress-label">流程进度</span>
          <span class="progress-value">{{ currentStep + 1 }} / {{ steps.length }}</span>
        </div>
        <div class="progress-bar-modern">
          <div class="progress-fill-modern"
               :style="{ width: `${((currentStep + 1) / steps.length) * 100}%` }"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const currentStep = ref(-1)

const steps = [
  {
    name: '用户注册登录',
    icon: '👤',
    desc: '用户身份认证与权限管理',
    implemented: true
  },
  {
    name: 'MBTI性格测评',
    icon: '📝',
    desc: '93题专业性格测评分析',
    implemented: true
  },
  {
    name: '技能自评',
    icon: '⭐',
    desc: '多维度技能水平评估',
    implemented: true
  },
  {
    name: '能力画像生成',
    icon: '🎨',
    desc: 'AI分析生成个人能力雷达图',
    implemented: true
  },
  {
    name: '岗位探索',
    icon: '💼',
    desc: '浏览岗位库，了解职业信息',
    implemented: true
  },
  {
    name: '职业路径规划',
    icon: '🗺️',
    desc: 'AI生成个性化职业发展路径',
    implemented: true
  },
  {
    name: '综合报告',
    icon: '📊',
    desc: '生成完整的职业规划报告',
    implemented: true
  },
  {
    name: 'AI智能助手',
    icon: '🤖',
    desc: '实时对话解答职业疑问',
    implemented: true
  }
]

onMounted(() => {
  const interval = setInterval(() => {
    if (currentStep.value < steps.length - 1) {
      currentStep.value++
    } else {
      clearInterval(interval)
    }
  }, 600)
})
</script>

<style scoped>
.flow-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #FAF0E6 0%, #FFF8DC 100%);
  overflow-y: auto;
  overflow-x: hidden;
}

.content-area {
  max-width: 900px;
  margin: 0 auto;
  padding: 60px 80px 120px 80px;
}

/* 标题区域 */
.header-section {
  text-align: center;
  margin-bottom: 48px;
}

/* 流程容器 */
.flow-container {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 48px;
}

.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 步骤卡片 */
.step-card {
  width: 100%;
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex;
  align-items: center;
  gap: 24px;
  transition: all 0.3s ease;
  position: relative;
}

.flow-step.active .step-card {
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.2);
  transform: scale(1.02);
  border: 2px solid #667EEA;
}

.step-number {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  font-family: var(--font-number);
  flex-shrink: 0;
}

.step-icon {
  font-size: 48px;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
}

.step-name {
  font-size: 20px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 8px;
}

.step-desc {
  font-size: 14px;
  color: #7F8C8D;
}

.step-badge {
  flex-shrink: 0;
}

/* 连接箭头 */
.flow-arrow {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.flow-arrow svg path {
  transition: stroke 0.3s ease;
}

.flow-arrow svg path.active {
  stroke: #667EEA;
  stroke-width: 3;
}

/* 进度区域 */
.progress-section {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.progress-label {
  font-size: 16px;
  font-weight: 600;
  color: #2C3E50;
}

.progress-value {
  font-size: 20px;
  font-weight: 700;
  color: #667EEA;
  font-family: var(--font-number);
}
</style>
