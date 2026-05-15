<template>
  <div class="opening-modern">
    <!-- 顶部装饰 -->
    <div class="top-decoration"></div>

    <div class="content-wrapper">
      <!-- Logo区域 -->
      <transition name="scale">
        <div v-if="step >= 1" class="logo-section animate-scale-in">
          <div class="logo-circle">
            <span class="logo-icon">🎯</span>
          </div>
        </div>
      </transition>

      <!-- 主标题 -->
      <transition name="fade">
        <div v-if="step >= 2" class="title-section animate-fade-in-up">
          <h1 class="main-title">职业规划智能系统</h1>
          <p class="main-subtitle">AI-Powered Career Planning System</p>
        </div>
      </transition>

      <!-- 特性卡片 -->
      <transition name="fade">
        <div v-if="step >= 3" class="features-grid animate-fade-in">
          <div class="feature-card" v-for="(feature, index) in features" :key="index"
               :style="{ animationDelay: `${index * 0.1}s` }">
            <div class="feature-icon">{{ feature.icon }}</div>
            <h3 class="feature-title">{{ feature.title }}</h3>
            <p class="feature-desc">{{ feature.desc }}</p>
          </div>
        </div>
      </transition>

      <!-- 底部信息 -->
      <transition name="fade">
        <div v-if="step >= 4" class="bottom-info animate-fade-in">
          <div class="info-item">
            <span class="info-label">团队</span>
            <span class="info-value">Career System Dev</span>
          </div>
          <div class="info-divider"></div>
          <div class="info-item">
            <span class="info-label">技术栈</span>
            <span class="info-value">Vue3 + Spring Boot + AI</span>
          </div>
        </div>
      </transition>
    </div>

    <!-- 底部装饰 -->
    <div class="bottom-decoration"></div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const step = ref(0)

const features = [
  { icon: '📝', title: 'MBTI测评', desc: '专业性格分析' },
  { icon: '🎨', title: '能力画像', desc: 'AI智能生成' },
  { icon: '💼', title: '岗位探索', desc: '精准匹配推荐' },
  { icon: '🗺️', title: '路径规划', desc: '个性化发展' }
]

onMounted(() => {
  setTimeout(() => { step.value = 1 }, 300)
  setTimeout(() => { step.value = 2 }, 800)
  setTimeout(() => { step.value = 3 }, 1300)
  setTimeout(() => { step.value = 4 }, 1800)
})
</script>

<style scoped>
.opening-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #FAF0E6 0%, #FFF8DC 100%);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 装饰元素 */
.top-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 200px;
  background: linear-gradient(180deg, rgba(102, 126, 234, 0.1) 0%, transparent 100%);
}

.bottom-decoration {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 200px;
  background: linear-gradient(0deg, rgba(118, 75, 162, 0.1) 0%, transparent 100%);
}

/* 内容包装器 */
.content-wrapper {
  max-width: 1200px;
  width: 100%;
  padding: 0 80px;
  z-index: 1;
}

/* Logo区域 */
.logo-section {
  text-align: center;
  margin-bottom: 48px;
}

.logo-circle {
  width: 120px;
  height: 120px;
  background: white;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(102, 126, 234, 0.2);
}

.logo-icon {
  font-size: 64px;
}

/* 标题区域 */
.title-section {
  text-align: center;
  margin-bottom: 64px;
}

.main-title {
  font-size: 64px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 16px;
  letter-spacing: -1px;
}

.main-subtitle {
  font-size: 24px;
  color: #7F8C8D;
  font-weight: 400;
  font-family: var(--font-number);
}

/* 特性网格 */
.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
  margin-bottom: 64px;
}

.feature-card {
  background: white;
  border-radius: 16px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out backwards;
}

.feature-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-8px);
}

.feature-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.feature-title {
  font-size: 20px;
  font-weight: 600;
  color: #2C3E50;
  margin-bottom: 8px;
}

.feature-desc {
  font-size: 14px;
  color: #7F8C8D;
}

/* 底部信息 */
.bottom-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 32px;
  padding: 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.info-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.info-label {
  font-size: 14px;
  color: #7F8C8D;
}

.info-value {
  font-size: 18px;
  font-weight: 600;
  color: #2C3E50;
  font-family: var(--font-number);
}

.info-divider {
  width: 1px;
  height: 40px;
  background: #E5E7EB;
}
</style>
