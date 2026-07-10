<!--
  组件：MBTI 测评须知
  职责：展示测评说明和快速输入入口
-->
<script setup lang="ts">
defineProps<{
  manualInput: string
}>()

const emit = defineEmits<{
  'update:manualInput': [value: string]
  start: []
  submitManual: []
}>()

const handleInput = (value: string) => {
  emit('update:manualInput', value)
}
</script>

<template>
  <div class="mbti-notice">
    <div class="notice-card">
      <div class="notice-icon">🧠</div>
      <h3 class="notice-title">MBTI 测试前须知</h3>

      <!-- 快速输入已知类型 -->
      <div class="quick-input-section">
        <div class="quick-title">已有 MBTI 类型？</div>
        <div class="quick-input-row">
          <el-input
            :model-value="manualInput"
            placeholder="例如：INFP、ENTJ"
            size="large"
            maxlength="4"
            class="mbti-input"
            @update:model-value="handleInput"
          />
          <el-button type="primary" size="large" @click="emit('submitManual')">
            直接填写
          </el-button>
        </div>
      </div>

      <el-divider>或完成测评</el-divider>

      <!-- 测评说明 -->
      <div class="notice-content">
        <p><strong>1、MBTI 是什么？</strong></p>
        <p>MBTI（Myers-Briggs Type Indicator）是一种性格分类工具，将人的性格分为16种类型。通过了解自己的性格类型，可以更好地认识自己的优势和劣势。</p>

        <p><strong>2、如何作答？</strong></p>
        <p>请根据你的真实想法和习惯作答，不要过度思考。选择最接近你日常行为的选项，而不是你认为"应该"的答案。</p>

        <p><strong>3、测评结果的意义</strong></p>
        <p>MBTI 提供的性格类型描述仅供参考。性格类型没有好坏，只有不同。每一种性格特征都有其价值和优点，也有缺点和需要注意的地方。</p>
      </div>

      <el-button type="primary" size="large" class="start-btn" @click="emit('start')">
        开始测评（约 10 分钟）
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.mbti-notice {
  max-width: 700px;
  margin: 0 auto;
}

.notice-card {
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  border-radius: var(--clay-radius-feature);
  padding: 40px;
  box-shadow: var(--clay-shadow);
  text-align: center;
}

.notice-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.notice-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 24px 0;
}

.quick-input-section {
  background: var(--clay-surface-lemon);
  border: 1px solid var(--clay-lemon-400);
  border-radius: var(--clay-radius-card);
  padding: 20px;
  margin-bottom: 24px;
}

.quick-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--clay-text);
  margin-bottom: 12px;
}

.quick-input-row {
  display: flex;
  gap: 12px;
}

.mbti-input {
  flex: 1;
  text-transform: uppercase;
}

.notice-content {
  text-align: left;
  margin: 24px 0;
}

.notice-content p {
  margin: 12px 0;
  line-height: 1.6;
  color: var(--clay-text);
}

.notice-content strong {
  color: var(--clay-text);
  font-weight: 600;
}

.start-btn {
  width: 100%;
  margin-top: 24px;
}

@media (max-width: 768px) {
  .notice-card {
    padding: 24px 20px;
  }

  .quick-input-row {
    flex-direction: column;
  }
}
</style>
