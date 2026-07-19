<script setup lang="ts">
import { AlertTriangle, CheckCircle2, FileSearch, Sparkles } from 'lucide-vue-next'
import type { CoachingResponse } from '@/api/coaching'
import { formatSourceReferenceLabels } from '@/utils/sourceReferences'

defineOptions({ name: 'AgentInsightPanel' })

withDefaults(defineProps<{
  result: CoachingResponse
  title?: string
}>(), {
  title: 'AI 导师建议'
})
</script>

<template>
  <M3Card tag="section" class="agent-insight">
    <header>
      <div><Sparkles :size="19" /><h3>{{ title }}</h3></div>
      <div class="agent-meta">
        <span :class="result.generationMode">{{ result.generationMode === 'llm' ? '模型生成' : '规则降级' }}</span>
        <strong>可信度 {{ Math.round(result.confidence * 100) }}%</strong>
      </div>
    </header>

    <div class="agent-conclusion"><strong>先说结论</strong><p>{{ result.conclusion }}</p></div>

    <div class="agent-grid">
      <section class="agent-summary-section agent-evidence">
        <h4><FileSearch :size="15" />参考了这些信息</h4>
        <ul v-if="result.evidenceBasis.length" class="agent-summary-list">
          <li v-for="(item, index) in result.evidenceBasis" :key="index">
            <span>{{ item.statement }}</span>
            <small v-if="item.sourceRefs.length">参考：{{ formatSourceReferenceLabels(item.sourceRefs).join(' · ') }}</small>
          </li>
        </ul>
        <p v-else class="agent-empty">暂时没有可以引用的信息，这不影响你先继续。</p>
      </section>
      <section class="agent-summary-section agent-cautions">
        <h4><AlertTriangle :size="15" />还需要留意</h4>
        <ul v-if="result.counterArguments.length || result.uncertainties.length" class="agent-summary-list">
          <li v-for="(item, index) in result.counterArguments" :key="`counter-${index}`">{{ item }}</li>
          <li v-for="(item, index) in result.uncertainties" :key="`uncertain-${index}`">{{ item }}</li>
        </ul>
        <p v-else class="agent-empty">暂时没有特别需要留意的内容。</p>
      </section>
      <section class="agent-next">
        <h4><CheckCircle2 :size="15" />接下来可以这样了解</h4>
        <ol v-if="result.nextActions.length" class="agent-action-list">
          <li v-for="(item, index) in result.nextActions" :key="index">
            <span class="agent-action-number" aria-hidden="true">{{ index + 1 }}</span>
            <div class="agent-action-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.rationale }}</span>
              <small v-if="item.acceptanceCriteria">完成时可以看看：{{ item.acceptanceCriteria }}</small>
            </div>
          </li>
        </ol>
        <p v-else class="agent-empty">可以先按自己的节奏继续，之后再回来补充。</p>
      </section>
    </div>

    <div v-if="$slots.default" class="agent-suggestions"><slot /></div>
  </M3Card>
</template>

<style scoped>
.agent-insight { overflow: hidden; border-left: 4px solid var(--career-sys-color-info); container-type: inline-size; }
.agent-insight > header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 18px; border-bottom: 1px solid var(--md-sys-color-outline-variant); background: color-mix(in srgb, var(--md-sys-color-surface-container) 55%, var(--md-sys-color-surface-container-lowest)); }
.agent-insight > header > div:first-child, .agent-insight h4 { display: flex; align-items: center; gap: 8px; }
.agent-insight > header svg { color: var(--career-sys-color-info); }
.agent-insight h3 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.agent-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; font-size: var(--md-sys-typescale-label-small-size); }
.agent-meta span { border-radius: var(--md-sys-shape-corner-extra-small); padding: 4px 7px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
.agent-meta span.llm { background: color-mix(in srgb, var(--career-sys-color-info) 12%, var(--md-sys-color-surface-container-lowest)); color: var(--career-sys-color-info); }
.agent-meta strong { color: var(--md-sys-color-on-surface-variant); }
.agent-conclusion { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 12px; padding: 18px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.agent-conclusion > strong { color: var(--career-sys-color-info); font-size: var(--md-sys-typescale-body-small-size); }
.agent-conclusion p { min-width: 0; margin: 0; line-height: 1.65; overflow-wrap: anywhere; }
.agent-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); background: color-mix(in srgb, var(--md-sys-color-surface-container) 42%, var(--md-sys-color-surface-container-lowest)); }
.agent-grid > section { min-width: 0; padding: 18px; background: var(--md-sys-color-surface-container-lowest); }
.agent-summary-section { border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.agent-evidence { border-right: 1px solid var(--md-sys-color-outline-variant); }
.agent-next { grid-column: 1 / -1; }
.agent-grid h4 { margin: 0 0 11px; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-body-small-size); }
.agent-summary-list { display: grid; gap: 10px; margin: 0; padding-left: 18px; }
.agent-summary-list li { min-width: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.55; overflow-wrap: anywhere; }
.agent-summary-list li span, .agent-summary-list li small { display: block; }
.agent-summary-list li small { margin-top: 4px; color: var(--md-sys-color-primary); font-size: var(--md-sys-typescale-label-small-size); }
.agent-action-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 0; padding: 0; list-style: none; }
.agent-action-list li { display: grid; grid-template-columns: 26px minmax(0, 1fr); align-content: start; gap: 10px; min-width: 0; border: 1px solid var(--md-sys-color-outline-variant); border-radius: var(--md-sys-shape-corner-medium); background: var(--md-sys-color-surface-container-low); padding: 13px; }
.agent-action-number { display: grid; width: 24px; height: 24px; place-items: center; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); font-size: var(--md-sys-typescale-label-small-size); font-weight: 600; }
.agent-action-copy { display: grid; min-width: 0; gap: 5px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; overflow-wrap: anywhere; }
.agent-action-copy strong { color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-body-medium-size); line-height: 1.45; }
.agent-action-copy small { color: var(--md-sys-color-primary); line-height: 1.45; }
.agent-empty { margin: 0; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.agent-suggestions { padding: 18px; border-top: 1px solid var(--md-sys-color-outline-variant); }
@container (max-width: 880px) {
  .agent-grid { grid-template-columns: minmax(0, 1fr); }
  .agent-evidence { border-right: 0; }
  .agent-next { grid-column: auto; }
  .agent-action-list { grid-template-columns: 1fr; }
}
@container (max-width: 620px) {
  .agent-insight > header { align-items: flex-start; flex-direction: column; }
  .agent-meta { justify-content: flex-start; }
  .agent-conclusion { grid-template-columns: 1fr; }
  .agent-grid > section { padding: 14px; }
}
@media (max-width: 760px) {
  .agent-insight > header { align-items: flex-start; flex-direction: column; }
  .agent-meta { justify-content: flex-start; }
  .agent-conclusion { grid-template-columns: 1fr; }
}
</style>
