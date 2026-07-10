<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { workflowSteps } from '@/config/navigation'
import { getStoredUser } from '@/utils/session'

defineOptions({ name: 'HomePage' })

type DashboardModule = {
  id: string
  group: string
  title: string
  description: string
  path: string
  accent: 'miku' | 'ube' | 'lemon'
}

const router = useRouter()
const isLoggedIn = ref(false)
const userName = ref('')

const workflowDescriptions: Record<string, string> = {
  entry: '资料、测评与求职目标',
  profile: '能力标签与推荐依据',
  jobs: '岗位筛选与目标确认',
  path: '阶段任务与成长路线',
  report: '报告预览与归档'
}

const dashboardModules: DashboardModule[] = [
  {
    id: 'flow',
    group: '主链路',
    title: '决策流程',
    description: '从信息录入到报告生成，完成一轮职业规划。',
    path: '/entry/comprehensive',
    accent: 'miku'
  },
  {
    id: 'jobs',
    group: '数据入口',
    title: '岗位库',
    description: '浏览岗位、筛选方向，并确认目标岗位。',
    path: '/job-exploration',
    accent: 'ube'
  },
  {
    id: 'records',
    group: '个人资产',
    title: '我的记录',
    description: '查看已经保存的职业规划报告。',
    path: '/reports',
    accent: 'lemon'
  }
]

onMounted(() => {
  const user = getStoredUser()
  isLoggedIn.value = !!user?.id
  userName.value = user?.username || ''
})

const navigateTo = (path: string) => {
  if (!isLoggedIn.value) {
    router.push({ path: '/login', query: { redirect: path } })
    return
  }
  router.push(path)
}
</script>

<template>
  <div class="home-page">
    <main class="home-content">
      <section class="workspace-header">
        <div class="header-copy">
          <span class="eyebrow">工作台</span>
          <h1 class="page-title">
            {{ isLoggedIn ? `${userName || '用户'}，继续职业决策` : '职业决策工作台' }}
          </h1>
          <p class="page-subtitle">
            围绕目标岗位沉淀信息、画像、规划和报告，形成可追踪的职业决策档案。
          </p>
        </div>

        <div class="header-actions">
          <button class="primary-action" type="button" @click="navigateTo('/entry/comprehensive')">
            进入决策流程
          </button>
          <button class="secondary-action" type="button" @click="navigateTo('/reports')">
            查看记录
          </button>
        </div>
      </section>

      <section class="dashboard-section">
        <div class="section-head">
          <div>
            <h2>决策流程</h2>
            <p>从基础信息到报告归档，集中完成当前轮规划。</p>
          </div>
          <span class="section-meta">5 个阶段</span>
        </div>

        <div class="workflow-grid">
          <button
            v-for="step in workflowSteps"
            :key="step.id"
            class="workflow-card"
            type="button"
            @click="navigateTo(step.path)"
          >
            <span class="workflow-index">{{ step.index }}</span>
            <span class="workflow-text">
              <strong>{{ step.label }}</strong>
              <small>{{ workflowDescriptions[step.id] }}</small>
            </span>
          </button>
        </div>
      </section>

      <section class="dashboard-section">
        <div class="section-head">
          <div>
            <h2>平台入口</h2>
            <p>主流程、岗位库和个人记录按任务归类。</p>
          </div>
        </div>

        <div class="module-grid">
          <button
            v-for="module in dashboardModules"
            :key="module.id"
            class="module-card"
            :class="`accent-${module.accent}`"
            type="button"
            @click="navigateTo(module.path)"
          >
            <span class="module-group">{{ module.group }}</span>
            <strong>{{ module.title }}</strong>
            <span>{{ module.description }}</span>
          </button>
        </div>
      </section>

      <section v-if="isLoggedIn" class="status-strip">
        <div>
          <strong>当前账号</strong>
          <span>{{ userName || '用户' }}</span>
        </div>
        <button class="text-action" type="button" @click="navigateTo('/job-exploration')">
          进入岗位库
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  background: var(--clay-bg);
}

.home-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 0 80px;
}

.workspace-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding: 12px 0 36px;
  border-bottom: 1px solid var(--clay-border);
}

.header-copy {
  max-width: 760px;
}

.eyebrow,
.section-meta,
.module-group {
  color: var(--clay-text-subtle);
  font-size: 13px;
  font-weight: 700;
}

.page-title {
  margin: 8px 0 12px;
  color: var(--clay-text);
  font-size: 36px;
  line-height: 1.2;
  font-weight: 800;
}

.page-subtitle,
.section-head p,
.module-card span,
.workflow-text small,
.status-strip span {
  color: var(--clay-text-subtle);
  line-height: 1.6;
}

.page-subtitle {
  margin: 0;
  font-size: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.primary-action,
.secondary-action,
.text-action {
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid var(--clay-border);
  padding: 0 18px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-action {
  border-color: #000;
  background: #000;
  color: #fff;
}

.secondary-action,
.text-action {
  background: var(--clay-surface);
  color: var(--clay-text);
}

.dashboard-section {
  padding: 36px 0 0;
}

.section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}

.section-head h2 {
  margin: 0 0 6px;
  color: var(--clay-text);
  font-size: 22px;
  line-height: 1.2;
}

.section-head p {
  margin: 0;
  font-size: 14px;
}

.workflow-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
}

.workflow-card,
.module-card {
  min-width: 0;
  border: 1px solid var(--clay-border);
  border-radius: 8px;
  background: var(--clay-surface);
  color: var(--clay-text);
  text-align: left;
  cursor: pointer;
  box-shadow: var(--clay-shadow);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.workflow-card:hover,
.module-card:hover,
.secondary-action:hover,
.text-action:hover {
  transform: translateY(-2px);
  border-color: #000;
}

.workflow-card {
  min-height: 96px;
  padding: 16px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.workflow-index {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: #000;
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
}

.workflow-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.workflow-text strong,
.module-card strong,
.status-strip strong {
  color: var(--clay-text);
}

.workflow-text small {
  font-size: 13px;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.module-card {
  min-height: 150px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top-width: 4px;
}

.module-card strong {
  font-size: 22px;
}

.module-card span {
  font-size: 14px;
}

.accent-miku {
  border-top-color: var(--color-miku);
}

.accent-ube {
  border-top-color: var(--clay-ube-800);
}

.accent-lemon {
  border-top-color: var(--clay-lemon-500);
}

.status-strip {
  margin-top: 36px;
  padding-top: 24px;
  border-top: 1px solid var(--clay-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.status-strip div {
  display: flex;
  align-items: center;
  gap: 12px;
}

@media (max-width: 1024px) {
  .workspace-header,
  .section-head,
  .status-strip {
    flex-direction: column;
    align-items: stretch;
  }

  .workflow-grid,
  .module-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .home-content {
    padding: 20px 0 80px;
  }

  .page-title {
    font-size: 28px;
  }

  .header-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .workflow-grid,
  .module-grid {
    grid-template-columns: 1fr;
  }
}
</style>
