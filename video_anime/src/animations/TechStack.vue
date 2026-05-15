<template>
  <div class="techstack-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">技术栈全景</h1>
        <p class="section-subtitle">Modern Technology Stack - 6 Categories</p>
      </div>

      <!-- 技术分类网格 -->
      <div class="tech-categories">
        <div v-for="(category, index) in categories" :key="category.name"
             class="category-card animate-fade-in-up"
             :style="{ animationDelay: `${index * 0.1}s` }">
          <div class="category-header">
            <div class="category-icon">{{ category.icon }}</div>
            <h3 class="category-name">{{ category.name }}</h3>
          </div>
          <div class="tech-list">
            <div v-for="tech in category.techs" :key="tech.name"
                 class="tech-item">
              <div class="tech-logo" :style="{ background: tech.color }">
                {{ tech.logo }}
              </div>
              <div class="tech-info">
                <div class="tech-name">{{ tech.name }}</div>
                <div class="tech-version">{{ tech.version }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 技术总结 -->
      <div class="tech-summary animate-fade-in-up" style="animation-delay: 0.6s">
        <div class="summary-item">
          <div class="summary-icon">🎨</div>
          <div class="summary-text">现代化前端框架</div>
        </div>
        <div class="summary-item">
          <div class="summary-icon">⚡</div>
          <div class="summary-text">高性能后端服务</div>
        </div>
        <div class="summary-item">
          <div class="summary-icon">🤖</div>
          <div class="summary-text">AI智能赋能</div>
        </div>
        <div class="summary-item">
          <div class="summary-icon">🔒</div>
          <div class="summary-text">企业级安全</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const categories = [
  {
    name: '前端技术',
    icon: '🎨',
    techs: [
      { name: 'Vue.js', version: '3.4+', logo: 'V', color: 'linear-gradient(135deg, #42b883 0%, #35495e 100%)' },
      { name: 'TypeScript', version: '5.0+', logo: 'TS', color: 'linear-gradient(135deg, #3178c6 0%, #235a97 100%)' },
      { name: 'Vite', version: '5.0+', logo: '⚡', color: 'linear-gradient(135deg, #646cff 0%, #747bff 100%)' },
      { name: 'Element Plus', version: '2.0+', logo: 'E', color: 'linear-gradient(135deg, #409eff 0%, #53a8ff 100%)' }
    ]
  },
  {
    name: '后端技术',
    icon: '⚙️',
    techs: [
      { name: 'Spring Boot', version: '3.2+', logo: '🍃', color: 'linear-gradient(135deg, #6db33f 0%, #5a9e31 100%)' },
      { name: 'Java', version: '17+', logo: '☕', color: 'linear-gradient(135deg, #f89820 0%, #e67e22 100%)' },
      { name: 'MyBatis', version: '3.5+', logo: 'M', color: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' },
      { name: 'Maven', version: '3.9+', logo: '📦', color: 'linear-gradient(135deg, #c71a36 0%, #a0152b 100%)' }
    ]
  },
  {
    name: '数据存储',
    icon: '🗄️',
    techs: [
      { name: 'MySQL', version: '8.0+', logo: '🐬', color: 'linear-gradient(135deg, #00758f 0%, #005f73 100%)' },
      { name: 'Redis', version: '7.0+', logo: '🔴', color: 'linear-gradient(135deg, #dc382d 0%, #b8312a 100%)' },
      { name: 'MyBatis', version: '3.5+', logo: 'M', color: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)' }
    ]
  },
  {
    name: 'AI服务',
    icon: '🤖',
    techs: [
      { name: '通义千问', version: 'API', logo: '🧠', color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
      { name: 'SSE', version: 'Stream', logo: '📡', color: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
      { name: '多模型', version: 'Config', logo: '🔄', color: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' }
    ]
  },
  {
    name: '开发工具',
    icon: '🛠️',
    techs: [
      { name: 'Git', version: '2.0+', logo: '📝', color: 'linear-gradient(135deg, #f05032 0%, #d94e2a 100%)' },
      { name: 'VS Code', version: 'Latest', logo: '💻', color: 'linear-gradient(135deg, #007acc 0%, #005a9e 100%)' },
      { name: 'IntelliJ', version: 'Latest', logo: '💡', color: 'linear-gradient(135deg, #fe315d 0%, #f44336 100%)' }
    ]
  },
  {
    name: '部署运维',
    icon: '🚀',
    techs: [
      { name: 'Docker', version: 'Latest', logo: '🐳', color: 'linear-gradient(135deg, #2496ed 0%, #1d7fc1 100%)' },
      { name: 'Nginx', version: '1.24+', logo: '🌐', color: 'linear-gradient(135deg, #009639 0%, #007a2f 100%)' },
      { name: 'Linux', version: 'Ubuntu', logo: '🐧', color: 'linear-gradient(135deg, #e95420 0%, #dd4814 100%)' }
    ]
  }
]
</script>

<style scoped>
.techstack-modern {
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

/* 标题区域 */
.header-section {
  text-align: center;
  margin-bottom: 48px;
}

/* 技术分类网格 */
.tech-categories {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 48px;
}

.category-card {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.category-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.category-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px solid #F3F4F6;
}

.category-icon {
  font-size: 36px;
}

.category-name {
  font-size: 20px;
  font-weight: 700;
  color: #2C3E50;
}

/* 技术列表 */
.tech-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tech-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px;
  background: #F9FAFB;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.tech-item:hover {
  background: #F3F4F6;
  transform: translateX(4px);
}

.tech-logo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
  color: white;
  flex-shrink: 0;
}

.tech-info {
  flex: 1;
}

.tech-name {
  font-size: 15px;
  font-weight: 600;
  color: #2C3E50;
  margin-bottom: 2px;
}

.tech-version {
  font-size: 12px;
  color: #7F8C8D;
  font-family: var(--font-number);
}

/* 技术总结 */
.tech-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px;
}

.summary-item {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  text-align: center;
  transition: all 0.3s ease;
}

.summary-item:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.summary-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.summary-text {
  font-size: 15px;
  font-weight: 600;
  color: #2C3E50;
}
</style>
