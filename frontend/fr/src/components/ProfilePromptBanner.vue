<template>
  <div class="profile-prompt-banner" :class="bannerClass">
    <div class="banner-icon">{{ icon }}</div>
    <div class="banner-content">
      <h4 class="banner-title">{{ title }}</h4>
      <p class="banner-text">{{ message }}</p>
    </div>
    <div class="banner-actions">
      <el-button type="primary" @click="handleAction">
        {{ actionText }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  level: 'info' | 'warning' | 'success'
  icon: string
  title: string
  message: string
  actionText: string
  actionPath: string
}>()

const emit = defineEmits<{
  action: []
}>()

const router = useRouter()

const bannerClass = computed(() => `banner-${props.level}`)

const handleAction = () => {
  emit('action')
  router.push(props.actionPath)
}
</script>

<style scoped>
.profile-prompt-banner {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 20px 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
  margin-bottom: 24px;
  transition: all 0.3s ease;
}

.profile-prompt-banner:hover {
  box-shadow: var(--clay-shadow-hard);
  transform: translateY(-2px);
}

.banner-info {
  background: linear-gradient(135deg, var(--clay-surface) 0%, #fef9e7 100%);
  border-color: var(--clay-lemon-400);
}

.banner-warning {
  background: linear-gradient(135deg, var(--clay-surface) 0%, #fff4e6 100%);
  border-color: var(--clay-lemon-500);
}

.banner-success {
  background: linear-gradient(135deg, var(--clay-surface) 0%, #e8f5e9 100%);
  border-color: var(--clay-matcha-600);
}

.banner-icon {
  font-size: 32px;
  flex-shrink: 0;
  line-height: 1;
}

.banner-content {
  flex: 1;
  min-width: 0;
}

.banner-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--clay-text);
  margin: 0 0 4px 0;
  line-height: 1.4;
}

.banner-text {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin: 0;
  line-height: 1.5;
}

.banner-actions {
  flex-shrink: 0;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .profile-prompt-banner {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
    padding: 16px 20px;
  }

  .banner-icon {
    font-size: 28px;
  }

  .banner-title {
    font-size: 15px;
  }

  .banner-text {
    font-size: 13px;
  }

  .banner-actions {
    width: 100%;
  }

  .banner-actions .el-button {
    width: 100%;
  }
}
</style>
