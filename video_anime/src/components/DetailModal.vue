<template>
  <Transition name="modal">
    <div v-if="show" class="modal-overlay" @click="closeModal">
      <div class="modal-container" @click.stop>
        <!-- 关闭按钮 -->
        <button class="close-btn" @click="closeModal">✕</button>

        <!-- 图标 -->
        <div v-if="icon" class="modal-icon">{{ icon }}</div>

        <!-- 标题 -->
        <h2 class="modal-title">{{ title }}</h2>

        <!-- 副标题 -->
        <p v-if="subtitle" class="modal-subtitle">{{ subtitle }}</p>

        <!-- 内容 -->
        <div class="modal-content">
          <slot>
            <p>{{ content }}</p>
          </slot>
        </div>

        <!-- 详细信息列表 -->
        <div v-if="details && details.length" class="details-list">
          <div v-for="(detail, index) in details" :key="index" class="detail-item">
            <div class="detail-label">{{ detail.label }}</div>
            <div class="detail-value">{{ detail.value }}</div>
          </div>
        </div>

        <!-- 标签 -->
        <div v-if="tags && tags.length" class="tags-container">
          <span v-for="tag in tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  icon: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    default: ''
  },
  content: {
    type: String,
    default: ''
  },
  details: {
    type: Array,
    default: () => []
  },
  tags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close'])

const closeModal = () => {
  emit('close')
}
</script>

<style scoped>
/* 遮罩层 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

/* 弹窗容器 */
.modal-container {
  position: relative;
  background: white;
  border-radius: 20px;
  padding: 40px;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 关闭按钮 */
.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: none;
  background: #F3F4F6;
  border-radius: 50%;
  font-size: 24px;
  color: #7F8C8D;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #E5E7EB;
  color: #2C3E50;
  transform: rotate(90deg);
}

/* 图标 */
.modal-icon {
  font-size: 80px;
  text-align: center;
  margin-bottom: 20px;
}

/* 标题 */
.modal-title {
  font-size: 32px;
  font-weight: 700;
  color: #2C3E50;
  text-align: center;
  margin-bottom: 12px;
}

/* 副标题 */
.modal-subtitle {
  font-size: 16px;
  color: #7F8C8D;
  text-align: center;
  margin-bottom: 24px;
}

/* 内容 */
.modal-content {
  font-size: 16px;
  line-height: 1.8;
  color: #2C3E50;
  margin-bottom: 24px;
  text-align: left;
}

.modal-content p {
  margin-bottom: 12px;
}

/* 详细信息列表 */
.details-list {
  background: #F9FAFB;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #E5E7EB;
}

.detail-item:last-child {
  border-bottom: none;
}

.detail-label {
  font-size: 14px;
  font-weight: 600;
  color: #7F8C8D;
}

.detail-value {
  font-size: 16px;
  font-weight: 700;
  color: #2C3E50;
}

/* 标签 */
.tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.tag {
  padding: 8px 16px;
  background: linear-gradient(135deg, #667EEA 0%, #764BA2 100%);
  color: white;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
}

/* 过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform 0.3s ease;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: translateY(30px);
}

/* 滚动条样式 */
.modal-container::-webkit-scrollbar {
  width: 8px;
}

.modal-container::-webkit-scrollbar-track {
  background: #F3F4F6;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb {
  background: #CBD5E0;
  border-radius: 4px;
}

.modal-container::-webkit-scrollbar-thumb:hover {
  background: #A0AEC0;
}
</style>
