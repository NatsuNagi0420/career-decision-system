<template>
  <div class="presentation">
    <!-- Current Animation -->
    <transition name="fade" mode="out-in">
      <component :is="currentAnimation" :key="currentIndex" />
    </transition>

    <!-- Navigation Controls -->
    <div class="nav-controls">
      <button @click="prevAnimation" class="nav-btn prev-btn" :disabled="currentIndex === 0">
        <span class="btn-icon">←</span>
        <span class="btn-text">上一个</span>
      </button>

      <div class="progress-indicator">
        <div class="progress-dots">
          <div v-for="(anim, index) in animations" :key="index"
               class="dot"
               :class="{ active: index === currentIndex }"
               @click="goToAnimation(index)">
            <span class="dot-tooltip">{{ anim.name }}</span>
          </div>
        </div>
        <div class="progress-text">
          {{ currentIndex + 1 }} / {{ animations.length }}
        </div>
      </div>

      <button @click="nextAnimation" class="nav-btn next-btn" :disabled="currentIndex === animations.length - 1">
        <span class="btn-text">下一个</span>
        <span class="btn-icon">→</span>
      </button>
    </div>

    <!-- Auto Play Control -->
    <div class="auto-play-control">
      <button @click="toggleAutoPlay" class="auto-play-btn">
        <span class="btn-icon">{{ isAutoPlay ? '⏸' : '▶' }}</span>
        <span class="btn-text">{{ isAutoPlay ? '暂停自动播放' : '自动播放' }}</span>
      </button>
      <div class="timer" v-if="isAutoPlay">
        <div class="timer-bar" :style="{ width: `${timerProgress}%` }"></div>
      </div>
    </div>

    <!-- Keyboard Hints -->
    <div class="keyboard-hints">
      <div class="hint">← → 切换动画</div>
      <div class="hint">Space 暂停/播放</div>
      <div class="hint">ESC 返回首页</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import Opening from '@/animations/Opening.vue'
import FeatureRoadmap from '@/animations/FeatureRoadmap.vue'
import Stats from '@/animations/Stats.vue'
import Flow from '@/animations/Flow.vue'
import Architecture from '@/animations/Architecture.vue'
import TechStack from '@/animations/TechStack.vue'
import Models from '@/animations/Models.vue'
import DataFlow from '@/animations/DataFlow.vue'
import Ending from '@/animations/Ending.vue'

const router = useRouter()
const currentIndex = ref(0)
const isAutoPlay = ref(false)
const timerProgress = ref(0)
let autoPlayTimer = null
let progressTimer = null

const animations = [
  { name: '开场动画', component: Opening, duration: 30000 },
  { name: '功能规划', component: FeatureRoadmap, duration: 40000 },
  { name: '统计数据', component: Stats, duration: 20000 },
  { name: '功能流程', component: Flow, duration: 40000 },
  { name: '系统架构', component: Architecture, duration: 60000 },
  { name: '技术栈', component: TechStack, duration: 30000 },
  { name: 'AI模型', component: Models, duration: 35000 },
  { name: '数据流转', component: DataFlow, duration: 30000 },
  { name: '结尾动画', component: Ending, duration: 15000 }
]

const currentAnimation = computed(() => animations[currentIndex.value].component)

const nextAnimation = () => {
  if (currentIndex.value < animations.length - 1) {
    currentIndex.value++
    resetTimer()
  } else {
    stopAutoPlay()
  }
}

const prevAnimation = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--
    resetTimer()
  }
}

const goToAnimation = (index) => {
  currentIndex.value = index
  resetTimer()
}

const toggleAutoPlay = () => {
  isAutoPlay.value = !isAutoPlay.value
  if (isAutoPlay.value) {
    startAutoPlay()
  } else {
    stopAutoPlay()
  }
}

const startAutoPlay = () => {
  const duration = animations[currentIndex.value].duration
  timerProgress.value = 0

  // Progress bar animation
  progressTimer = setInterval(() => {
    timerProgress.value += (100 / duration) * 100
    if (timerProgress.value >= 100) {
      timerProgress.value = 100
    }
  }, 100)

  // Auto advance
  autoPlayTimer = setTimeout(() => {
    nextAnimation()
    if (isAutoPlay.value && currentIndex.value < animations.length - 1) {
      startAutoPlay()
    }
  }, duration)
}

const stopAutoPlay = () => {
  isAutoPlay.value = false
  if (autoPlayTimer) {
    clearTimeout(autoPlayTimer)
    autoPlayTimer = null
  }
  if (progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
  timerProgress.value = 0
}

const resetTimer = () => {
  if (isAutoPlay.value) {
    stopAutoPlay()
    isAutoPlay.value = true
    startAutoPlay()
  }
}

const handleKeyboard = (e) => {
  switch (e.key) {
    case 'ArrowLeft':
      prevAnimation()
      break
    case 'ArrowRight':
      nextAnimation()
      break
    case ' ':
      e.preventDefault()
      toggleAutoPlay()
      break
    case 'Escape':
      router.push('/')
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard)
  stopAutoPlay()
})
</script>

<style scoped>
.presentation {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

/* Navigation Controls */
.nav-controls {
  position: fixed;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  z-index: 1000;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(255, 107, 53, 0.2);
  border: 1px solid var(--primary);
  border-radius: var(--radius-full);
  color: var(--text-white);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  backdrop-filter: blur(10px);
}

.nav-btn:hover:not(:disabled) {
  background: rgba(255, 107, 53, 0.4);
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 107, 53, 0.5);
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.btn-icon {
  font-size: 18px;
}

/* Progress Indicator */
.progress-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
}

.progress-dots {
  display: flex;
  gap: var(--spacing-sm);
}

.dot {
  position: relative;
  width: 12px;
  height: 12px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.dot:hover {
  background: rgba(255, 255, 255, 0.6);
  transform: scale(1.3);
}

.dot.active {
  background: var(--primary);
  box-shadow: 0 0 15px var(--primary);
  transform: scale(1.5);
}

.dot-tooltip {
  position: absolute;
  bottom: 120%;
  left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-xs) var(--spacing-sm);
  background: rgba(0, 0, 0, 0.9);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-small);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.dot:hover .dot-tooltip {
  opacity: 1;
}

.progress-text {
  font-size: var(--font-size-body);
  font-family: var(--font-number);
  color: var(--text-white);
  font-weight: var(--font-weight-bold);
}

/* Auto Play Control */
.auto-play-control {
  position: fixed;
  top: var(--spacing-md);
  right: var(--spacing-md);
  z-index: 1000;
}

.auto-play-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-xs) var(--spacing-md);
  background: rgba(255, 105, 180, 0.2);
  border: 1px solid var(--accent);
  border-radius: var(--radius-full);
  color: var(--text-white);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-bold);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  backdrop-filter: blur(10px);
}

.auto-play-btn:hover {
  background: rgba(255, 105, 180, 0.4);
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 105, 180, 0.5);
}

.timer {
  margin-top: var(--spacing-sm);
  width: 100%;
  height: 4px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.timer-bar {
  height: 100%;
  background: var(--accent);
  transition: width 0.1s linear;
}

/* Keyboard Hints */
.keyboard-hints {
  position: fixed;
  bottom: var(--spacing-md);
  left: var(--spacing-md);
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 1000;
}

.hint {
  padding: 4px var(--spacing-sm);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
  backdrop-filter: blur(10px);
}
</style>
