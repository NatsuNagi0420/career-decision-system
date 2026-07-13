<script setup lang="ts">
import {
  BarChart3, Binary, BriefcaseBusiness, Compass, DraftingCompass,
  FlaskConical, HandHeart, Lightbulb, UsersRound
} from 'lucide-vue-next'
import type { CareerVisualKey } from '@/content/careerAssets'

defineProps<{ visual: CareerVisualKey; label: string; compact?: boolean }>()

const icons = {
  code: Binary,
  data: BarChart3,
  product: Lightbulb,
  creative: Compass,
  business: BriefcaseBusiness,
  people: UsersRound,
  research: FlaskConical,
  engineering: DraftingCompass,
  service: HandHeart
}
</script>

<template>
  <div class="career-visual" :class="[`visual-${visual}`, { compact }]" aria-hidden="true">
    <span class="visual-line line-a"></span>
    <span class="visual-line line-b"></span>
    <span class="visual-orbit orbit-a"></span>
    <span class="visual-orbit orbit-b"></span>
    <span class="visual-icon"><component :is="icons[visual]" :size="compact ? 24 : 42" /></span>
    <strong>{{ label }}</strong>
  </div>
</template>

<style scoped>
.career-visual { --visual-accent: var(--md-sys-color-primary); position: relative; display: grid; min-height: 210px; overflow: hidden; align-content: end; border-radius: var(--md-sys-shape-corner-medium); padding: 24px; background: var(--md-sys-color-surface-container-high); color: var(--md-sys-color-on-surface); isolation: isolate; }
.career-visual::before { position: absolute; z-index: -2; inset: 0; background: color-mix(in srgb, var(--visual-accent) 18%, var(--md-sys-color-surface-container)); content: ''; }
.visual-line { position: absolute; z-index: -1; background: color-mix(in srgb, var(--md-sys-color-outline) 34%, transparent); }
.line-a { width: 1px; top: 0; bottom: 0; left: 34%; }
.line-b { height: 1px; right: 0; bottom: 34%; left: 0; }
.visual-orbit { position: absolute; border: 1px solid color-mix(in srgb, var(--visual-accent) 62%, transparent); border-radius: var(--md-sys-shape-corner-full); }
.orbit-a { width: 180px; height: 180px; top: -48px; right: -30px; }
.orbit-b { width: 104px; height: 104px; top: 36px; right: 62px; }
.visual-icon { display: grid; width: 76px; height: 76px; place-items: center; margin-bottom: 28px; border-radius: var(--md-sys-shape-corner-large); background: var(--visual-accent); color: var(--md-sys-color-on-primary); }
.career-visual strong { max-width: 16ch; font-size: var(--md-sys-typescale-title-large-size); line-height: 1.2; }
.compact { min-height: 72px; align-content: center; padding: 12px; }
.compact .visual-icon { width: 44px; height: 44px; margin: 0; border-radius: var(--md-sys-shape-corner-medium); }
.compact strong { display: none; }
.visual-data, .visual-research, .visual-service { --visual-accent: var(--md-sys-color-tertiary); }
.visual-product, .visual-creative, .visual-engineering { --visual-accent: var(--md-sys-color-secondary); }
@media (prefers-reduced-motion: no-preference) {
  .career-visual:hover .orbit-a { transform: translate(-6px, 5px); }
  .career-visual:hover .orbit-b { transform: translate(5px, -4px); }
  .visual-orbit { transition: transform var(--md-sys-motion-duration-medium2) var(--md-sys-motion-easing-emphasized-decelerate); }
}
</style>
