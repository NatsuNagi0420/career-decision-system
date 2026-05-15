<template>
  <div class="dataflow-modern">
    <div class="content-area">
      <!-- 标题区域 -->
      <div class="header-section animate-fade-in-up">
        <h1 class="section-title">数据流转架构</h1>
        <p class="section-subtitle">Data Flow - From Input to Intelligence</p>
      </div>

      <!-- 数据流转图 -->
      <div class="flow-diagram">
        <!-- 用户输入 -->
        <div class="flow-node animate-fade-in-up" style="animation-delay: 0.2s">
          <div class="node-card input">
            <div class="node-icon">👤</div>
            <h3 class="node-title">用户输入</h3>
            <div class="node-items">
              <div class="node-item">性格测评数据</div>
              <div class="node-item">技能自评数据</div>
              <div class="node-item">职业偏好</div>
            </div>
          </div>
        </div>

        <!-- 箭头 -->
        <div class="flow-connector animate-fade-in" style="animation-delay: 0.4s">
          <div class="connector-line"></div>
          <div class="connector-label">数据采集</div>
        </div>

        <!-- 数据处理 -->
        <div class="flow-node animate-fade-in-up" style="animation-delay: 0.5s">
          <div class="node-card process">
            <div class="node-icon">⚙️</div>
            <h3 class="node-title">数据处理</h3>
            <div class="node-items">
              <div class="node-item">数据验证</div>
              <div class="node-item">格式转换</div>
              <div class="node-item">存储入库</div>
            </div>
          </div>
        </div>

        <!-- 箭头 -->
        <div class="flow-connector animate-fade-in" style="animation-delay: 0.7s">
          <div class="connector-line"></div>
          <div class="connector-label">数据分析</div>
        </div>

        <!-- AI分析 -->
        <div class="flow-node animate-fade-in-up" style="animation-delay: 0.8s">
          <div class="node-card ai">
            <div class="node-icon">🤖</div>
            <h3 class="node-title">AI智能分析</h3>
            <div class="node-items">
              <div class="node-item">性格分析</div>
              <div class="node-item">能力评估</div>
              <div class="node-item">职业匹配</div>
            </div>
          </div>
        </div>

        <!-- 箭头 -->
        <div class="flow-connector animate-fade-in" style="animation-delay: 1s">
          <div class="connector-line"></div>
          <div class="connector-label">生成结果</div>
        </div>

        <!-- 结果输出 -->
        <div class="flow-node animate-fade-in-up" style="animation-delay: 1.1s">
          <div class="node-card output">
            <div class="node-icon">📊</div>
            <h3 class="node-title">结果输出</h3>
            <div class="node-items">
              <div class="node-item">能力画像</div>
              <div class="node-item">职业路径</div>
              <div class="node-item">综合报告</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 数据特性 -->
      <div class="data-features animate-fade-in-up" style="animation-delay: 1.3s">
        <div class="feature-box">
          <div class="feature-icon">🔒</div>
          <h4 class="feature-title">数据安全</h4>
          <p class="feature-desc">加密存储，隐私保护</p>
        </div>
        <div class="feature-box">
          <div class="feature-icon">⚡</div>
          <h4 class="feature-title">实时处理</h4>
          <p class="feature-desc">毫秒级响应速度</p>
        </div>
        <div class="feature-box">
          <div class="feature-icon">📈</div>
          <h4 class="feature-title">智能分析</h4>
          <p class="feature-desc">AI驱动的深度分析</p>
        </div>
        <div class="feature-box">
          <div class="feature-icon">💾</div>
          <h4 class="feature-title">持久化存储</h4>
          <p class="feature-desc">MySQL + Redis双层存储</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// No script needed
</script>

<style scoped>
.dataflow-modern {
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

/* 数据流转图 */
.flow-diagram {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-bottom: 48px;
}

.flow-node {
  display: flex;
  justify-content: center;
}

.node-card {
  width: 100%;
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
  border: 3px solid transparent;
}

.node-card:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: scale(1.02);
}

.node-card.input {
  border-color: #3B82F6;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(37, 99, 235, 0.05) 100%);
}

.node-card.process {
  border-color: #8B5CF6;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(124, 58, 237, 0.05) 100%);
}

.node-card.ai {
  border-color: #667EEA;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
}

.node-card.output {
  border-color: #10B981;
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.05) 0%, rgba(5, 150, 105, 0.05) 100%);
}

.node-icon {
  font-size: 56px;
  text-align: center;
  margin-bottom: 16px;
}

.node-title {
  font-size: 24px;
  font-weight: 700;
  color: #2C3E50;
  text-align: center;
  margin-bottom: 20px;
}

.node-items {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.node-item {
  padding: 10px 20px;
  background: #F9FAFB;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #2C3E50;
  transition: all 0.2s ease;
}

.node-item:hover {
  background: #F3F4F6;
  transform: translateY(-2px);
}

/* 连接器 */
.flow-connector {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  position: relative;
}

.connector-line {
  width: 3px;
  height: 40px;
  background: linear-gradient(180deg, #CBD5E0 0%, #667EEA 50%, #CBD5E0 100%);
  position: relative;
}

.connector-line::after {
  content: '▼';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  color: #667EEA;
  font-size: 16px;
}

.connector-label {
  margin-top: 8px;
  padding: 6px 16px;
  background: white;
  border: 2px solid #667EEA;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: #667EEA;
}

/* 数据特性 */
.data-features {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.feature-box {
  background: white;
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

.feature-box:hover {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  transform: translateY(-4px);
}

.feature-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.feature-title {
  font-size: 16px;
  font-weight: 700;
  color: #2C3E50;
  margin-bottom: 8px;
}

.feature-desc {
  font-size: 13px;
  color: #7F8C8D;
}
</style>
