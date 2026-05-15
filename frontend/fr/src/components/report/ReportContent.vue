<template>
  <main class="content card">
    <div class="report-head">
      <div>
        <div class="report-title">职业规划报告</div>
        <div class="text-sub">生成时间：{{ createdAt }}</div>
      </div>
      <div class="report-badges">
        <el-tag effect="plain" type="info">目标岗位：{{ targetJob.jobName }}</el-tag>
        <el-tag effect="plain">{{ targetJob.salary }}</el-tag>
      </div>
    </div>

    <section id="sec-summary" class="sec">
      <div class="sec-title">A. 总览</div>
      <div class="sec-text">{{ displaySummary }}</div>
    </section>

    <section id="sec-target" class="sec">
      <div class="sec-title">B. 目标岗位</div>
      <div class="sec-text">
        岗位：{{ targetJob.jobName }}（{{ targetJob.companyName }} · {{ targetJob.city }}）
      </div>
      <div class="sec-text text-sub">
        关键要求：
      </div>
      <div class="tags">
        <el-tag v-for="s in targetJob.keyRequirements" :key="s" effect="plain">{{ s }}</el-tag>
      </div>
    </section>

    <section id="sec-gap" class="sec">
      <div class="sec-title">C. 差距清单</div>
      <div class="gap-grid">
        <div v-for="g in displayGaps" :key="g.label" class="gap card">
          <div class="gap-title">{{ g.label }}</div>
          <ul class="gap-list">
            <li v-for="it in g.items" :key="it">{{ it }}</li>
          </ul>
        </div>
      </div>
    </section>

    <section id="sec-plan" class="sec">
      <div class="sec-title">D. 分阶段行动计划</div>
      <div v-if="!displayPlanStages.length" class="text-sub">尚未生成行动计划，请回到路径规划页完善。</div>
      <div v-else class="plan-grid">
        <div v-for="s in displayPlanStages" :key="s.id" class="plan-stage">
          <div class="plan-name">{{ s.name }}</div>
          <ul class="plan-list">
            <li v-for="t in s.tasks" :key="t.id">
              {{ t.done ? '已完成：' : '待完成：' }}{{ t.title }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <section id="sec-match" class="sec">
      <div class="sec-title">E. 岗位匹配详析</div>
      <div class="sec-text">{{ matchAnalysis }}</div>
    </section>

    <section id="sec-evidence" class="sec">
      <div class="sec-title">F. 能力证据与亮点</div>
      <ul class="gap-list">
        <li v-for="it in evidenceHighlights" :key="it">{{ it }}</li>
      </ul>
    </section>

    <section id="sec-skill" class="sec">
      <div class="sec-title">G. 技能提升路径</div>
      <ul class="gap-list">
        <li v-for="it in skillPath" :key="it">{{ it }}</li>
      </ul>
    </section>

    <section id="sec-90days" class="sec">
      <div class="sec-title">H. 90天行动清单</div>
      <ul class="gap-list">
        <li v-for="it in action90Days" :key="it">{{ it }}</li>
      </ul>
    </section>

    <section id="sec-risk" class="sec">
      <div class="sec-title">I. 风险与备选路径</div>
      <ul class="gap-list">
        <li v-for="it in risksAndAlternatives" :key="it">{{ it }}</li>
      </ul>
    </section>

    <section id="sec-resume" class="sec">
      <div class="sec-title">J. 简历与面试策略</div>
      <ul class="gap-list">
        <li v-for="it in resumeInterviewStrategies" :key="it">{{ it }}</li>
      </ul>
    </section>
  </main>
</template>

<script setup lang="ts">
import type { TargetJob } from '@/utils/storage'
import type { GapBlock, RenderStage } from '@/composables/useReport'

defineProps<{
  targetJob: TargetJob
  createdAt: string
  displaySummary: string
  displayGaps: GapBlock[]
  displayPlanStages: RenderStage[]
  matchAnalysis: string
  evidenceHighlights: string[]
  skillPath: string[]
  action90Days: string[]
  risksAndAlternatives: string[]
  resumeInterviewStrategies: string[]
}>()
</script>

<style scoped>
.content {
  padding: 18px;
  border-radius: var(--clay-radius-card);
  min-width: 0;
}

.report-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 18px;
}

.report-title {
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 6px;
}

.report-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.sec {
  margin-bottom: 18px;
}

.sec-title {
  font-weight: 900;
  margin-bottom: 10px;
}

.sec-text {
  color: #334155;
  line-height: 1.7;
  font-size: 14px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.gap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.gap {
  padding: 14px;
  border-radius: 14px;
}

.gap-title {
  font-weight: 900;
  margin-bottom: 10px;
}

.gap-list {
  margin: 0;
  padding-left: 16px;
  color: #475569;
}

.plan-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.plan-stage {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: #fff;
}

.plan-name {
  font-weight: 900;
  margin-bottom: 10px;
}

.plan-list {
  margin: 0;
  padding-left: 16px;
  color: #475569;
}

@media (max-width: 1024px) {
  .gap-grid {
    grid-template-columns: 1fr;
  }

  .plan-grid {
    grid-template-columns: 1fr;
  }
}
</style>
