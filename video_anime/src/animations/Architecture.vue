<template>
  <div class="architecture-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">系统架构设计</h1>
        <p class="section-subtitle">4-Layer Architecture - Modern Tech Stack</p>
      </div>

      <!-- 架构层级 -->
      <div class="architecture-layers">
        <!-- 前端层 -->
        <div class="layer-card animate-fade-in-up" style="animation-delay: 0.2s">
          <div class="layer-header">
            <div class="layer-icon">🎨</div>
            <h3 class="layer-title">前端层 Frontend Layer</h3>
          </div>
          <div class="tech-tags">
            <span class="tech-tag">Vue 3</span>
            <span class="tech-tag">TypeScript</span>
            <span class="tech-tag">Vite</span>
            <span class="tech-tag">Element Plus</span>
            <span class="tech-tag">ECharts</span>
          </div>
        </div>

        <!-- 连接线 -->
        <div class="connection-line animate-fade-in" style="animation-delay: 0.4s">
          <div class="line-label">HTTP / RESTful API</div>
        </div>

        <!-- 后端层 -->
        <div class="layer-card animate-fade-in-up" style="animation-delay: 0.5s">
          <div class="layer-header">
            <div class="layer-icon">⚙️</div>
            <h3 class="layer-title">后端层 Backend Layer</h3>
          </div>
          <div class="tech-tags">
            <span class="tech-tag">Spring Boot</span>
            <span class="tech-tag">MyBatis</span>
            <span class="tech-tag">JWT</span>
            <span class="tech-tag">Maven</span>
          </div>
        </div>

        <!-- 连接线 -->
        <div class="connection-line animate-fade-in" style="animation-delay: 0.7s">
          <div class="line-label">Data Access</div>
        </div>

        <!-- 数据层和AI层 -->
        <div class="dual-layers animate-fade-in-up" style="animation-delay: 0.8s">
          <div class="layer-card half">
            <div class="layer-header">
              <div class="layer-icon">🗄️</div>
              <h3 class="layer-title">数据层</h3>
            </div>
            <div class="tech-tags">
              <span class="tech-tag">MySQL 8.0</span>
              <span class="tech-tag">Redis</span>
              <span class="tech-tag">MyBatis</span>
            </div>
          </div>

          <div class="layer-card half highlight">
            <div class="layer-header">
              <div class="layer-icon">🤖</div>
              <h3 class="layer-title">AI服务层</h3>
            </div>
            <div class="tech-tags">
              <span class="tech-tag highlight">通义千问</span>
              <span class="tech-tag">SSE流式</span>
              <span class="tech-tag">多模型</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 架构特性 -->
      <div class="features-grid animate-fade-in-up" style="animation-delay: 1s">
        <div class="feature-item">
          <div class="feature-icon">🔒</div>
          <div class="feature-text">
            <h4>安全认证</h4>
            <p>JWT + 权限管理</p>
          </div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">⚡</div>
          <div class="feature-text">
            <h4>高性能</h4>
            <p>Redis缓存优化</p>
          </div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">🔄</div>
          <div class="feature-text">
            <h4>可扩展</h4>
            <p>模块化设计</p>
          </div>
        </div>
        <div class="feature-item">
          <div class="feature-icon">📦</div>
          <div class="feature-text">
            <h4>易维护</h4>
            <p>清晰的分层架构</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// No script needed for this static display
</script>

<style scoped>
.architecture-modern {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #FAF0E6 0%, #FFF8DC 100%);
  overflow-y: auto;
  overflow-x: hidden;
}

.content-area {
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 80px 120px 80px;
}

/* 标题区域 */
.header-section {
  text-align: center;
  margin-bottom: 48px;
}

/* 架构层级 */
.architecture-layers {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 48px;
}

.layer-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.layer-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.layer-card.highlight {
  border: 2px solid #667EEA;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.layer-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.layer-icon {
  font-size: 40px;
}

.layer-title {
  font-size: 20px;
  font-weight: 700;
  color: #2C3E50;
}

.tech-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.tech-tag {
  padding: 8px 16px;
  background: #F3F4F6;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #2C3E50;
  transition: all 0.2s ease;
}

.tech-tag:hover {
  background: #E5E7EB;
  transform: translateY(-2px);
}

.tech-tag.highlight {
  background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
  color: white;
}

/* 连接线 */
.connection-line {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px 0;
  position: relative;
}

.connection-line::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, #CBD5E0 0%, #667EEA 50%, #CBD5E0 100%);
  transform: translateX(-50%);
}

.line-label {
  background: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: #667EEA;
  border: 2px solid #667EEA;
  position: relative;
  z-index: 1;
}

/* 双层布局 */
.dual-layers {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.layer-card.half {
  margin: 0;
}

/* 特性网格 */
.features-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.feature-item {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  text-align: center;
  transition: all 0.3s ease;
}

.feature-item:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.feature-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.feature-text h4 {
  font-size: 16px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 4px;
}

.feature-text p {
  font-size: 13px;
  color: #7F8C8D;
}
</style>
