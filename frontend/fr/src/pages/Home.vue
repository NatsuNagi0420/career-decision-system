<!--
  页面：首页 Home（/）。
  职责：作为职业规划流程的入口，展示产品卖点与“开始职业规划”按钮，
        根据是否登录决定跳转到登录页或信息录入方式选择页，使用 Clay 风格 Hero 卡片。
-->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import Cookies from 'js-cookie'
import Navbar from '../components/Navbar.vue'
import { clearAllLocalCareerData } from '@/utils/storage'

defineOptions({
  name: 'HomePage'
})

const router = useRouter()

// 响应式数据：用户信息（Home.vue 仍需判断登录状态以控制“开始规划”按钮）
const isLoggedIn = ref(false)

// 检查登录状态
onMounted(() => {
  const userData = Cookies.get('userInfo')
  if (userData) {
    isLoggedIn.value = true
  }
})

// 开始职业规划逻辑
const startPlanning = async () => {
  if (!isLoggedIn.value) {
    router.push('/login')
  } else {
    // 每次从首页重新开始时，仅清理本地职业规划上下文
    clearAllLocalCareerData()
    router.push('/entry/comprehensive')
  }
}
</script>

<template>
  <div class="home-container clay-page">
    <!-- 模块1：顶部导航栏组件 -->
    <Navbar />

    <!-- 模块2：首页主内容组件（Clay Hero 卡片） -->
    <main class="main-content">
      <section class="hero-section clay-card">
        <div class="hero-text">
          <h1 class="main-title">
            智能职业规划，
            <span class="main-title-em">一站式定制成长路径</span>
          </h1>
          <p class="sub-title">5 步完成专业测评，生成专属职业报告，帮助你看清职业方向与行动路径</p>
        </div>

        <div class="cta-area">
          <button class="hero-cta clay-btn-primary" type="button" @click="startPlanning">
            开始职业规划
          </button>
          <p class="cta-hint">全程仅需几分钟，完善信息即可生成专属规划报告</p>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: transparent;
  color: var(--clay-text);
}

/* 主内容样式 */
.main-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 120px 24px 80px; /* 预留顶部导航和底部空间 */
}

.hero-section {
  max-width: 880px;
  width: 100%;
  padding: 32px 32px 40px;
  border-radius: var(--clay-radius-section);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
  background: var(--clay-surface);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.main-title {
  font-size: 40px;
  font-weight: 700;
  color: var(--clay-text);
  line-height: 1.1;
  letter-spacing: 0.02em;
}

.main-title-em {
  display: inline-block;
  padding: 4px 10px;
  margin-left: 4px;
  border-radius: var(--clay-radius-pill);
  border: 1px solid var(--clay-border-subtle);
  background: var(--clay-surface-variant);
}

.sub-title {
  font-size: 16px;
  color: var(--clay-text-subtle);
}

.cta-area {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.hero-cta {
  margin-top: 4px;
}

.cta-hint {
  font-size: 13px;
  color: var(--clay-text-subtle);
}

/* 响应式适配 */
@media (max-width: 1024px) {
  .main-content {
    padding: 112px 20px 72px;
  }

  .hero-section {
    padding: 28px 24px 32px;
  }

  .main-title {
    font-size: 32px;
  }
}

@media (max-width: 768px) {
  .main-content {
    padding: 104px 16px 64px;
  }

  .hero-section {
    padding: 24px 20px 28px;
  }

  .main-title {
    font-size: 26px;
  }

  .sub-title {
    font-size: 15px;
  }

  .cta-area {
    align-items: flex-start;
  }
}
</style>
