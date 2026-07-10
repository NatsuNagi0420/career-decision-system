<template>
  <main class="detail card" v-loading="loading">
    <div v-if="!detail" class="detail-empty text-sub">
      从左侧选择一条报告，可以在这里查看概要与行动计划。
    </div>
    <div v-else class="detail-body">
      <div class="detail-head">
        <div>
          <div class="detail-title">{{ detail.title }}</div>
          <div class="detail-meta text-sub">
            <span>生成时间：{{ detail.createdAt }}</span>
            <span v-if="detail.targetJob?.jobName">
              ｜ 目标岗位：{{ detail.targetJob.jobName }}
            </span>
          </div>
        </div>
      </div>

      <section class="sec">
        <div class="sec-title">A. 总览</div>
        <div class="sec-text">{{ detail.summary }}</div>
      </section>

      <section v-if="detail.gaps && detail.gaps.length" class="sec">
        <div class="sec-title">B. 差距与建议</div>
        <div class="gap-grid">
          <div v-for="g in detail.gaps" :key="g.label" class="gap card">
            <div class="gap-title">{{ g.label }}</div>
            <ul class="gap-list">
              <li v-for="it in g.items" :key="it">{{ it }}</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title">C. 分阶段行动计划</div>
        <div v-if="!detail.planStages || !detail.planStages.length" class="text-sub">
          该报告中暂未包含详细行动计划，可回到路径规划页完善后再次保存归档。
        </div>
        <div v-else class="plan-grid">
          <div v-for="s in detail.planStages" :key="s.id" class="plan-stage">
            <div class="plan-name">{{ s.name }}</div>
            <ul class="plan-list">
              <li v-for="t in s.tasks" :key="t.id">
                {{ t.done ? '已完成：' : '待完成：' }}{{ t.title }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sec-title">D. 岗位匹配详析</div>
        <div class="sec-text">
          {{ detail.matchAnalysis || '该报告未提供岗位匹配详析内容。' }}
        </div>
      </section>

      <section class="sec">
        <div class="sec-title">E. 能力证据与亮点</div>
        <div v-if="!detail.evidenceHighlights.length" class="text-sub">暂无相关内容。</div>
        <ul v-else class="gap-list">
          <li v-for="it in detail.evidenceHighlights" :key="it">{{ it }}</li>
        </ul>
      </section>

      <section class="sec">
        <div class="sec-title">F. 技能提升路径</div>
        <div v-if="!detail.skillPath.length" class="text-sub">暂无相关内容。</div>
        <ul v-else class="gap-list">
          <li v-for="it in detail.skillPath" :key="it">{{ it }}</li>
        </ul>
      </section>

      <section class="sec">
        <div class="sec-title">G. 90天行动清单</div>
        <div v-if="!detail.action90Days.length" class="text-sub">暂无相关内容。</div>
        <ul v-else class="gap-list">
          <li v-for="it in detail.action90Days" :key="it">{{ it }}</li>
        </ul>
      </section>

      <section class="sec">
        <div class="sec-title">H. 风险与备选路径</div>
        <div v-if="!detail.risksAndAlternatives.length" class="text-sub">暂无相关内容。</div>
        <ul v-else class="gap-list">
          <li v-for="it in detail.risksAndAlternatives" :key="it">{{ it }}</li>
        </ul>
      </section>

      <section class="sec">
        <div class="sec-title">I. 简历与面试策略</div>
        <div v-if="!detail.resumeInterviewStrategies.length" class="text-sub">暂无相关内容。</div>
        <ul v-else class="gap-list">
          <li v-for="it in detail.resumeInterviewStrategies" :key="it">{{ it }}</li>
        </ul>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import type { ReportDetailView } from '@/composables/useReportsList'

defineProps<{
  detail: ReportDetailView | null
  loading: boolean
}>()
</script>

<style scoped>
.detail {
  padding: 18px;
  border-radius: var(--clay-radius-card);
  min-width: 0;
}

.detail-empty {
  padding: 40px 0;
  text-align: center;
}

.detail-title {
  font-size: 20px;
  font-weight: 900;
  margin-bottom: 4px;
}

.detail-meta {
  font-size: 13px;
}

.sec {
  margin-top: 18px;
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
