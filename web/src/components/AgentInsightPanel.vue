<script setup lang="ts">
import { AlertTriangle, CheckCircle2, FileSearch, Sparkles } from 'lucide-vue-next'
import type { CoachingResponse } from '@/api/coaching'

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

    <div class="agent-conclusion"><strong>结论</strong><p>{{ result.conclusion }}</p></div>

    <div class="agent-grid">
      <section>
        <h4><FileSearch :size="15" />依据</h4>
        <ul><li v-for="(item, index) in result.evidenceBasis" :key="index"><span>{{ item.statement }}</span><small v-if="item.sourceRefs.length">{{ item.sourceRefs.join(' · ') }}</small></li></ul>
      </section>
      <section>
        <h4><AlertTriangle :size="15" />反对因素与不确定性</h4>
        <ul><li v-for="(item, index) in result.counterArguments" :key="`counter-${index}`">{{ item }}</li><li v-for="(item, index) in result.uncertainties" :key="`uncertain-${index}`">{{ item }}</li></ul>
      </section>
      <section>
        <h4><CheckCircle2 :size="15" />下一步</h4>
        <ul><li v-for="(item, index) in result.nextActions" :key="index"><strong>{{ item.title }}</strong><span>{{ item.rationale }}</span><small v-if="item.acceptanceCriteria">验收：{{ item.acceptanceCriteria }}</small></li></ul>
      </section>
    </div>

    <div v-if="$slots.default" class="agent-suggestions"><slot /></div>
  </M3Card>
</template>

<style scoped>
.agent-insight { overflow: hidden; border-left: 4px solid var(--career-sys-color-info); }
.agent-insight > header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 18px; border-bottom: 1px solid var(--md-sys-color-outline-variant); background: color-mix(in srgb, var(--md-sys-color-surface-container) 55%, var(--md-sys-color-surface-container-lowest)); }
.agent-insight > header > div:first-child, .agent-insight h4 { display: flex; align-items: center; gap: 8px; }
.agent-insight > header svg { color: var(--career-sys-color-info); }
.agent-insight h3 { margin: 0; font-size: var(--md-sys-typescale-title-medium-size); }
.agent-meta { display: flex; align-items: center; gap: 8px; font-size: var(--md-sys-typescale-label-small-size); }
.agent-meta span { border-radius: var(--md-sys-shape-corner-extra-small); padding: 4px 7px; background: var(--md-sys-color-surface-container); color: var(--md-sys-color-on-surface-variant); }
.agent-meta span.llm { background: color-mix(in srgb, var(--career-sys-color-info) 12%, var(--md-sys-color-surface-container-lowest)); color: var(--career-sys-color-info); }
.agent-meta strong { color: var(--md-sys-color-on-surface-variant); }
.agent-conclusion { display: grid; grid-template-columns: 70px 1fr; gap: 12px; padding: 18px; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.agent-conclusion > strong { color: var(--career-sys-color-info); font-size: var(--md-sys-typescale-body-small-size); }
.agent-conclusion p { margin: 0; line-height: 1.65; }
.agent-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.agent-grid > section { min-width: 0; padding: 16px 18px; border-right: 1px solid var(--md-sys-color-outline-variant); }
.agent-grid > section:last-child { border-right: 0; }
.agent-grid h4 { margin: 0 0 11px; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-body-small-size); }
.agent-grid ul { display: grid; gap: 9px; margin: 0; padding-left: 16px; }
.agent-grid li { color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.5; }
.agent-grid li strong, .agent-grid li span, .agent-grid li small { display: block; }
.agent-grid li strong { color: var(--md-sys-color-on-surface); }
.agent-grid li small { margin-top: 2px; color: var(--md-sys-color-on-surface-variant); }
.agent-suggestions { padding: 18px; border-top: 1px solid var(--md-sys-color-outline-variant); }
@media (max-width: 760px) { .agent-insight > header { align-items: flex-start; flex-direction: column; } .agent-conclusion { grid-template-columns: 1fr; } .agent-grid { grid-template-columns: 1fr; } .agent-grid > section { border-right: 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); } .agent-grid > section:last-child { border-bottom: 0; } }
</style>
