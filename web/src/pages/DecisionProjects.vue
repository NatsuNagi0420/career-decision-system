<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Archive, CalendarDays, ChevronRight, CircleDot, Plus } from 'lucide-vue-next'
import { m3Confirm } from '@/design-system/services/feedback'
import { M3ProgressOverlay } from '@/design-system/components'
import {
  archiveDecisionProjectApi,
  listDecisionProjectsApi,
  makeCurrentDecisionProjectApi,
  type DecisionProjectSummary
} from '@/api/decisionProjects'

defineOptions({ name: 'DecisionProjectsPage' })

const router = useRouter()
const loading = ref(true)
const projects = ref<DecisionProjectSummary[]>([])

const stageLabels: Record<string, string> = {
  clarify: '明确问题', evidence: '整理证据', candidates: '收集候选', compare: '对比验证', target: '确定目标'
}

const statusLabels: Record<string, string> = {
  clarifying: '正在明确问题', collecting_evidence: '正在整理证据', collecting_candidates: '正在收集候选',
  comparing: '正在对比验证', ready_to_decide: '等待确认目标', decided: '已完成决策'
}

const load = async () => {
  loading.value = true
  try { projects.value = await listDecisionProjectsApi() }
  finally { loading.value = false }
}

onMounted(load)

const makeCurrent = async (project: DecisionProjectSummary) => {
  await makeCurrentDecisionProjectApi(project.id, project.version)
  await load()
}

const archive = async (project: DecisionProjectSummary) => {
  await m3Confirm(`归档“${project.title}”？历史数据会保留。`, '归档项目', {
    confirmButtonText: '归档', cancelButtonText: '取消', type: 'warning'
  })
  await archiveDecisionProjectApi(project.id, project.version)
  await load()
}
</script>

<template>
  <div class="product-page">
    <div class="product-shell">
      <header class="product-header">
        <div><h1>决策项目</h1><p>每个项目聚焦一个具体选择，保留候选、岗位样本、证据、比较过程和最终结论。</p></div>
        <M3Button type="button" @click="router.push('/decision-projects/new')"><Plus :size="17" />新建项目</M3Button>
      </header>

      <main class="projects-content loading-host">
        <M3ProgressOverlay :visible="loading" label="正在加载决策项目" />
        <section v-if="projects.length" class="projects-list">
          <M3Card v-for="project in projects" :key="project.id" class="project-row" tag="article" variant="filled" :class="{ current: project.current }">
            <router-link class="project-main" :to="`/decision-projects/${project.id}`">
              <span class="project-status"><CircleDot :size="15" />{{ statusLabels[project.status] || project.status }}</span>
              <div><h2>{{ project.title }}</h2><p>{{ project.question }}</p></div>
              <div class="project-metrics">
                <span>{{ project.candidateCount }} 个候选</span><span>{{ project.jobSampleCount }} 个岗位样本</span>
                <span v-if="project.primaryTarget">主目标：{{ project.primaryTarget }}</span>
              </div>
              <div class="project-footer">
                <span>{{ stageLabels[project.currentStage] }}</span>
                <span v-if="project.decisionDeadline"><CalendarDays :size="14" />{{ project.decisionDeadline }} 前决策</span>
                <ChevronRight :size="18" />
              </div>
            </router-link>
            <aside class="row-actions">
              <span v-if="project.current" class="current-label">当前项目</span>
              <M3Button v-else variant="text" @click="makeCurrent(project)">设为当前</M3Button>
              <M3IconButton label="归档项目" @click="archive(project)"><Archive :size="16" /></M3IconButton>
            </aside>
          </M3Card>
        </section>

        <M3Card tag="section" v-else-if="!loading" class="empty-projects">
          <div class="empty-icon"><CircleDot :size="28" /></div>
          <h2>从一个具体问题开始</h2>
          <p>例如“未来三个月优先准备 Java 后端还是数据分析”，而不是一次决定整个职业生涯。</p>
          <M3Button type="button" @click="router.push('/decision-projects/new')"><Plus :size="17" />创建第一个决策项目</M3Button>
        </M3Card>
      </main>
    </div>
  </div>
</template>

<style scoped>
.projects-content { margin-top: 24px; }
.projects-list { display: grid; gap: 12px; }
.project-row { display: grid; grid-template-columns: minmax(0, 1fr) 130px; overflow: hidden; }
.project-row.current { border-left: 4px solid var(--md-sys-color-primary); }
.project-main { display: grid; gap: 12px; color: var(--md-sys-color-on-surface); padding: 20px; text-align: left; text-decoration: none; }
.project-main:hover { background: var(--md-sys-color-surface-container); }
.project-status { display: inline-flex; align-items: center; gap: 6px; color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.project-main h2 { margin: 0 0 5px; font-size: var(--md-sys-typescale-title-medium-size); }
.project-main p { margin: 0; color: var(--md-sys-color-on-surface-variant); line-height: 1.55; }
.project-metrics { display: flex; flex-wrap: wrap; gap: 8px; }
.project-metrics span { border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); padding: 5px 8px; font-size: var(--md-sys-typescale-label-small-size); }
.project-footer { display: flex; align-items: center; gap: 16px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); }
.project-footer span { display: inline-flex; align-items: center; gap: 5px; }
.project-footer svg:last-child { margin-left: auto; }
.row-actions { display: flex; align-items: stretch; justify-content: center; flex-direction: column; gap: 6px; border-left: 1px solid var(--md-sys-color-outline-variant); padding: 14px; }
.current-label { color: var(--md-sys-color-primary); text-align: center; font-size: var(--md-sys-typescale-body-small-size); font-weight: 500; }
.empty-projects { display: flex; min-height: 360px; align-items: center; justify-content: center; flex-direction: column; gap: 12px; padding: 32px; text-align: center; }
.empty-icon { display: inline-flex; width: 52px; height: 52px; align-items: center; justify-content: center; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); color: var(--md-sys-color-primary); }
.empty-projects h2 { margin: 4px 0 0; }
.empty-projects p { max-width: 520px; margin: 0 0 8px; color: var(--md-sys-color-on-surface-variant); line-height: 1.6; }
@media (max-width: 700px) { .project-row { grid-template-columns: 1fr; } .row-actions { align-items: center; flex-direction: row; border-top: 1px solid var(--md-sys-color-outline-variant); border-left: 0; } }
</style>
