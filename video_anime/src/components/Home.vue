<template>
  <div class="home container center">
    <div class="menu">
      <h1 class="title">职业规划系统 - 动画演示</h1>

      <!-- Presentation Mode Button -->
      <router-link to="/presentation" class="presentation-mode-btn">
        <div class="btn-icon">🎬</div>
        <div class="btn-content">
          <div class="btn-title">演示模式</div>
          <div class="btn-desc">自动播放所有动画 · 支持键盘控制</div>
        </div>
        <div class="btn-arrow">→</div>
      </router-link>

      <div class="section-title">单独查看动画</div>
      <div class="menu-grid">
        <router-link to="/opening" class="menu-item">
          <div class="icon">🎬</div>
          <div class="name">开场动画</div>
          <div class="duration">20-30秒</div>
        </router-link>

        <router-link to="/feature-roadmap" class="menu-item featured">
          <div class="icon">🗺️</div>
          <div class="name">功能规划展示</div>
          <div class="duration">30-40秒</div>
          <div class="badge">最高优先级</div>
        </router-link>

        <router-link to="/stats" class="menu-item">
          <div class="icon">📊</div>
          <div class="name">统计数据</div>
          <div class="duration">15-20秒</div>
        </router-link>

        <router-link to="/flow" class="menu-item">
          <div class="icon">🔄</div>
          <div class="name">功能流程</div>
          <div class="duration">30-40秒</div>
        </router-link>

        <router-link to="/architecture" class="menu-item">
          <div class="icon">🏗️</div>
          <div class="name">系统架构</div>
          <div class="duration">40-60秒</div>
        </router-link>

        <router-link to="/techstack" class="menu-item">
          <div class="icon">⚙️</div>
          <div class="name">技术栈</div>
          <div class="duration">20-30秒</div>
        </router-link>

        <router-link to="/models" class="menu-item">
          <div class="icon">🤖</div>
          <div class="name">AI模型</div>
          <div class="duration">25-35秒</div>
        </router-link>

        <router-link to="/dataflow" class="menu-item">
          <div class="icon">💫</div>
          <div class="name">数据流转</div>
          <div class="duration">20-30秒</div>
        </router-link>

        <router-link to="/ending" class="menu-item">
          <div class="icon">🎉</div>
          <div class="name">结尾动画</div>
          <div class="duration">10-15秒</div>
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
// Home page with animation menu
</script>

<style scoped>
.home {
  background: var(--bg-dark);
}

.menu {
  width: 100%;
  max-width: 1400px;
  padding: var(--spacing-2xl);
}

.title {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  text-align: center;
  margin-bottom: var(--spacing-lg);
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Presentation Mode Button */
.presentation-mode-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-lg);
  padding: var(--spacing-xl);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
  border: 3px solid var(--primary);
  border-radius: var(--radius-xl);
  text-decoration: none;
  color: var(--text-white);
  margin-bottom: var(--spacing-xl);
  transition: all var(--duration-normal) var(--ease-out);
  position: relative;
  overflow: hidden;
}

.presentation-mode-btn::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s;
}

.presentation-mode-btn:hover::before {
  left: 100%;
}

.presentation-mode-btn:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
  border-color: var(--accent);
  transform: translateY(-5px);
  box-shadow: 0 10px 40px rgba(59, 130, 246, 0.4);
}

.btn-icon {
  font-size: 64px;
  filter: drop-shadow(0 0 20px rgba(59, 130, 246, 0.5));
}

.btn-content {
  flex: 1;
}

.btn-title {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-xs);
}

.btn-desc {
  font-size: var(--font-size-body);
  color: var(--text-secondary);
}

.btn-arrow {
  font-size: 48px;
  color: var(--primary);
  animation: arrowBounce 1.5s ease-in-out infinite;
}

@keyframes arrowBounce {
  0%, 100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(10px);
  }
}

.section-title {
  font-size: var(--font-size-h3);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
  margin-bottom: var(--spacing-lg);
  text-align: center;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-lg);
}

.menu-item {
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  text-decoration: none;
  color: var(--text-white);
  transition: all var(--duration-normal) var(--ease-out);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--primary);
  transform: translateY(-5px);
  box-shadow: var(--shadow-xl);
}

.menu-item.featured {
  border-color: var(--accent);
  background: rgba(245, 158, 11, 0.1);
}

.menu-item.featured:hover {
  border-color: var(--accent);
  background: rgba(245, 158, 11, 0.2);
}

.icon {
  font-size: 48px;
  text-align: center;
  margin-bottom: var(--spacing-sm);
}

.name {
  font-size: var(--font-size-h4);
  font-weight: var(--font-weight-bold);
  text-align: center;
  margin-bottom: var(--spacing-xs);
}

.duration {
  font-size: var(--font-size-small);
  color: var(--text-secondary);
  text-align: center;
}

.badge {
  position: absolute;
  top: var(--spacing-sm);
  right: var(--spacing-sm);
  background: var(--accent);
  color: var(--text-white);
  padding: 4px 12px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-tiny);
  font-weight: var(--font-weight-bold);
}
</style>
