<script setup lang="ts">
import { nextTick, onMounted, onUpdated, ref, watch } from 'vue'

defineOptions({ inheritAttrs: false })

type SelectValue = string | number | null

const props = withDefaults(defineProps<{
  modelValue?: SelectValue | SelectValue[]
  modelModifiers?: { number?: boolean }
}>(), {
  modelValue: '',
  modelModifiers: () => ({})
})

const emit = defineEmits<{ 'update:modelValue': [value: SelectValue | SelectValue[]] }>()
const selectRef = ref<HTMLSelectElement | null>(null)

const optionValue = (option: HTMLOptionElement): SelectValue => {
  const raw = (option as HTMLOptionElement & { _value?: SelectValue })._value
  if (raw !== undefined) return raw
  return props.modelModifiers.number && option.value !== '' ? Number(option.value) : option.value
}

const syncSelection = async () => {
  await nextTick()
  const select = selectRef.value
  if (!select) return
  const selectedValues = Array.isArray(props.modelValue) ? props.modelValue : [props.modelValue]
  for (const option of Array.from(select.options)) {
    option.selected = selectedValues.some((value) => Object.is(value, optionValue(option)))
  }
}

const updateValue = (event: Event) => {
  const select = event.target as HTMLSelectElement
  if (select.multiple) {
    emit('update:modelValue', Array.from(select.selectedOptions, optionValue))
    return
  }
  const option = select.selectedOptions[0] || select.options[select.selectedIndex]
  if (option) emit('update:modelValue', optionValue(option))
}

watch(() => props.modelValue, syncSelection, { deep: true })
onMounted(syncSelection)
onUpdated(syncSelection)
</script>

<template>
  <select ref="selectRef" v-bind="$attrs" class="m3-select" @change="updateValue">
    <slot />
  </select>
</template>

<style scoped>
.m3-select {
  width: 100%;
  min-height: 56px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: var(--md-sys-shape-corner-extra-small);
  padding: 0 var(--career-spacing-4);
  background: var(--md-sys-color-surface-container-lowest);
  color: var(--md-sys-color-on-surface);
  font: 400 var(--md-sys-typescale-body-large-size) / var(--md-sys-typescale-body-large-line-height) var(--md-ref-typeface-plain);
  letter-spacing: 0;
  cursor: pointer;
  transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard), box-shadow var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard);
}
.m3-select:hover:not(:disabled) { border-color: var(--md-sys-color-on-surface); }
.m3-select:focus { border-color: var(--md-sys-color-primary); box-shadow: inset 0 0 0 1px var(--md-sys-color-primary); outline: none; }
.m3-select:disabled { cursor: not-allowed; color: color-mix(in srgb, var(--md-sys-color-on-surface) var(--career-state-disabled-content-opacity), transparent); }
.m3-select[multiple] { min-height: 112px; padding-block: var(--career-spacing-2); }
</style>
