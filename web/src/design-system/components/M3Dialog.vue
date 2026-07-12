<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  description?: string
}>(), {
  title: '',
  description: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  close: []
}>()

const close = () => {
  if (!props.modelValue) return
  emit('update:modelValue', false)
  emit('close')
}
</script>

<template>
  <md-dialog :open="modelValue" @closed="close" @cancel="close">
    <div v-if="title || $slots.headline" slot="headline" class="m3-dialog__headline">
      <slot name="headline">{{ title }}</slot>
    </div>
    <div slot="content" class="m3-dialog__content">
      <p v-if="description" class="m3-dialog__description">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" slot="actions" class="m3-dialog__actions"><slot name="actions" /></div>
  </md-dialog>
</template>

<style scoped>
md-dialog {
  --md-dialog-container-color: var(--md-sys-color-surface-container-high);
  --md-dialog-headline-color: var(--md-sys-color-on-surface);
  --md-dialog-supporting-text-color: var(--md-sys-color-on-surface-variant);
  max-width: min(640px, calc(100vw - 32px));
}
.m3-dialog__headline { letter-spacing: 0; }
.m3-dialog__content { min-width: min(480px, calc(100vw - 80px)); color: var(--md-sys-color-on-surface); }
.m3-dialog__description { margin: 0 0 16px; color: var(--md-sys-color-on-surface-variant); }
.m3-dialog__actions { display: flex; gap: 8px; justify-content: flex-end; }
@media (max-width: 599px) { .m3-dialog__content { min-width: 0; } }
</style>
