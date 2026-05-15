<template>
  <div class="ending-modern">
    <div class="content-area">
      <!-- 主要内容 -->
      <div class="main-content animate-fade-in-up">
        <!-- Logo -->
        <div class="logo-section">
          <div class="logo-circle">
            <div class="logo-text">职业</div>
            <div class="logo-text">决策</div>
          </div>
        </div>

        <!-- 标题 -->
        <h1 class="main-title">职业决策辅助系统</h1>
        <p class="main-subtitle">Career Decision Support System</p>

        <!-- 项目总结 -->
        <div class="summary-cards">
          <div class="summary-card animate-fade-in-up" style="animation-delay: 0.2s">
            <div class="card-icon">✨</div>
            <div class="card-label">核心功能</div>
            <div class="card-value">8+</div>
          </div>
          <div class="summary-card animate-fade-in-up" style="animation-delay: 0.3s">
            <div class="card-icon">🎯</div>
            <div class="card-label">完成度</div>
            <div class="card-value">85%</div>
          </div>
          <div class="summary-card animate-fade-in-up" style="animation-delay: 0.4s">
            <div class="card-icon">🚀</div>
            <div class="card-label">技术栈</div>
            <div class="card-value">20+</div>
          </div>
        </div>

        <!-- 感谢语 -->
        <div class="thank-you animate-fade-in-up" style="animation-delay: 0.6s">
          <h2 class="thank-title">感谢观看</h2>
          <p class="thank-subtitle">Thank You For Watching</p>
        </div>

        <!-- 联系信息 -->
        <div class="contact-info animate-fade-in-up" style="animation-delay: 0.8s">
          <div class="contact-item">
            <div class="contact-icon">📧</div>
            <div class="contact-text">Email: career@example.com</div>
          </div>
          <div class="contact-item">
            <div class="contact-icon">🌐</div>
            <div class="contact-text">Website: www.career-system.com</div>
          </div>
          <div class="contact-item">
            <div class="contact-icon">💻</div>
            <div class="contact-text">GitHub: github.com/career-system</div>
          </div>
        </div>

        <!-- 装饰元素 -->
        <div class="decorations">
          <div v-for="i in 20" :key="i"
               class="star"
               :style="{
                 left: `${Math.random() * 100}%`,
                 top: `${Math.random() * 100}%`,
                 animationDelay: `${Math.random() * 3}s`,
                 animationDuration: `${2 + Math.random() * 2}s`
               }">
            ⭐
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// No script needed
</script>

<style scoped>
.ending-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
  overflow: hidden;
  position: relative;
}

.content-area {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

.main-content {
  text-align: center;
  max-width: 800px;
  padding: 40px;
}

/* Logo */
.logo-section {
  margin-bottom: 32px;
}

.logo-circle {
  width: 160px;
  height: 160px;
  margin: 0 auto;
  background: white;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  animation: float 3s ease-in-out infinite;
}

.logo-text {
  font-size: 32px;
  font-weight: 700;
  color: #667EEA;
  line-height: 1.2;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

/* 标题 */
.main-title {
  font-size: 56px;
  font-weight: 700;
  color: white;
  margin-bottom: 16px;
  text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.main-subtitle {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 48px;
  font-family: var(--font-en);
}

/* 总结卡片 */
.summary-cards {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-bottom: 48px;
}

.summary-card {
  background: white;
  border-radius: 16px;
  padding: 24px 32px;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
}

.card-icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.card-label {
  font-size: 14px;
  color: #7F8C8D;
  margin-bottom: 8px;
}

.card-value {
  font-size: 32px;
  font-weight: 700;
  color: #667EEA;
  font-family: var(--font-number);
}

/* 感谢语 */
.thank-you {
  margin-bottom: 40px;
}

.thank-title {
  font-size: 48px;
  font-weight: 700;
  color: white;
  margin-bottom: 12px;
  text-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.thank-subtitle {
  font-size: 20px;
  color: rgba(255, 255, 255, 0.9);
  font-family: var(--font-en);
}

/* 联系信息 */
.contact-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  padding: 12px 24px;
  border-radius: 12px;
  transition: all 0.3s ease;
}

.contact-item:hover {
  background: rgba(255, 255, 255, 0.25);
  transform: translateX(8px);
}

.contact-icon {
  font-size: 24px;
}

.contact-text {
  font-size: 16px;
  color: white;
  font-family: var(--font-en);
}

/* 装饰星星 */
.decorations {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: hidden;
}

.star {
  position: absolute;
  font-size: 20px;
  animation: twinkle 2s ease-in-out infinite;
  opacity: 0;
}

@keyframes twinkle {
  0%, 100% {
    opacity: 0;
    transform: scale(0.5) rotate(0deg);
  }
  50% {
    opacity: 1;
    transform: scale(1) rotate(180deg);
  }
}
</style>
