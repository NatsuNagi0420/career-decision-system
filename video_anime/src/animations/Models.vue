<template>
  <div class="models-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">AI模型架构</h1>
        <p class="section-subtitle">Multi-Model Architecture - Flexible & Scalable</p>
      </div>

      <!-- 当前模型 -->
      <div class="current-model animate-fade-in-up" style="animation-delay: 0.2s">
        <div class="model-badge">当前使用</div>
        <div class="model-icon">🧠</div>
        <h2 class="model-name">通义千问</h2>
        <p class="model-provider">阿里云大语言模型</p>
        <div class="model-features">
          <span class="feature-tag">✓ 中文优化</span>
          <span class="feature-tag">✓ 高准确率</span>
          <span class="feature-tag">✓ 流式输出</span>
        </div>
      </div>

      <!-- 架构流程 -->
      <div class="architecture-flow animate-fade-in-up" style="animation-delay: 0.4s">
        <div class="flow-step">
          <div class="flow-icon">👤</div>
          <div class="flow-label">用户输入</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="flow-icon">🔌</div>
          <div class="flow-label">API网关</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step highlight">
          <div class="flow-icon">🤖</div>
          <div class="flow-label">AI模型</div>
        </div>
        <div class="flow-arrow">→</div>
        <div class="flow-step">
          <div class="flow-icon">💬</div>
          <div class="flow-label">流式响应</div>
        </div>
      </div>

      <!-- 可扩展模型 -->
      <div class="expandable-section animate-fade-in-up" style="animation-delay: 0.6s">
        <h3 class="section-subtitle-small">可扩展模型</h3>
        <div class="models-grid">
          <div v-for="model in models" :key="model.name"
               class="model-card"
               :class="{ available: model.available }">
            <div class="card-icon">{{ model.icon }}</div>
            <div class="card-name">{{ model.name }}</div>
            <div class="card-status">
              {{ model.available ? '✓ 可配置' : '○ 规划中' }}
            </div>
          </div>
        </div>
      </div>

      <!-- AI特性 -->
      <div class="ai-features animate-fade-in-up" style="animation-delay: 0.8s">
        <div class="feature-card">
          <div class="feature-icon">🔄</div>
          <h4 class="feature-title">多模型切换</h4>
          <p class="feature-desc">支持配置切换不同AI模型</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">📡</div>
          <h4 class="feature-title">流式输出</h4>
          <p class="feature-desc">SSE实时流式响应</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">💾</div>
          <h4 class="feature-title">上下文记忆</h4>
          <p class="feature-desc">多轮对话上下文管理</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const models = [
  { name: '通义千问', icon: '🧠', available: true },
  { name: '文心一言', icon: '🎯', available: false },
  { name: 'ChatGPT', icon: '💡', available: false },
  { name: 'Claude', icon: '🤖', available: false },
  { name: '讯飞星火', icon: '⚡', available: false },
  { name: '智谱AI', icon: '🌟', available: false }
]
</script>

<style scoped>
.models-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #FAF0E6 0%, #FFF8DC 100%);
  overflow-y: auto;
  overflow-x: hidden;
}

.content-area {
  max-width: 1200px;
  margin: 0 auto;
  padding: 60px 80px 120px 80px;
}

/* 标题区域 */
.header-section {
  text-align: center;
  margin-bottom: 40px;
}

/* 当前模型 */
.current-model {
  position: relative;
  background: white;
  border: 3px solid #667EEA;
  border-radius: 20px;
  padding: 48px;
  text-align: center;
  margin-bottom: 40px;
  box-shadow: 0 8px 24px rgba(102, 126, 234, 0.15);
}

.model-badge {
  position: absolute;
  top: 20px;
  right: 20px;
  background: #667EEA;
  color: white;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 700;
}

.model-icon {
  font-size: 80px;
  margin-bottom: 16px;
}

.model-name {
  font-size: 40px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 8px;
}

.model-provider {
  font-size: 18px;
  color: #7F8C8D;
  margin-bottom: 24px;
}

.model-features {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.feature-tag {
  padding: 8px 16px;
  background: #D1FAE5;
  color: #065F46;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}

/* 架构流程 */
.architecture-flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  margin-bottom: 40px;
}

.flow-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  background: #F9FAFB;
  border-radius: 12px;
  min-width: 120px;
  transition: all 0.3s ease;
}

.flow-step:hover {
  background: #F3F4F6;
  transform: translateY(-4px);
}

.flow-step.highlight {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
  border: 2px solid #667EEA;
}

.flow-icon {
  font-size: 40px;
}

.flow-label {
  font-size: 14px;
  font-weight: 600;
  color: #2C3E50;
}

.flow-arrow {
  font-size: 32px;
  color: #CBD5E0;
  font-weight: 700;
}

/* 可扩展模型 */
.expandable-section {
  margin-bottom: 40px;
}

.section-subtitle-small {
  font-size: 24px;
  font-weight: 700;
  color: #2C3E50;
  text-align: center;
  margin-bottom: 24px;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
}

.model-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.model-card.available {
  border-color: #10B981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.05) 100%);
}

.model-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.card-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.card-name {
  font-size: 18px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 8px;
}

.card-status {
  font-size: 13px;
  color: #7F8C8D;
  font-weight: 600;
}

/* AI特性 */
.ai-features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.feature-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.feature-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.feature-icon {
  font-size: 56px;
  margin-bottom: 16px;
}

.feature-title {
  font-size: 18px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 8px;
}

.feature-desc {
  font-size: 14px;
  color: #7F8C8D;
}
</style>
