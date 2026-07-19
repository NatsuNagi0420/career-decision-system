<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowLeft, ArrowRight, Plus, X } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue: string[]
  label: string
  hint?: string
  placeholder?: string
  suggestions?: string[]
  maxItems?: number
  required?: boolean
}>(), {
  hint: '',
  placeholder: '写下一个想法，按回车添加',
  suggestions: () => [],
  maxItems: 5,
  required: false
})

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const inputValue = ref('')
const inputId = `decision-tags-${Math.random().toString(36).slice(2)}`

const normalizedItems = computed(() => props.modelValue.map((item) => item.trim()).filter(Boolean))
const canAdd = computed(() => normalizedItems.value.length < props.maxItems)
const availableSuggestions = computed(() => props.suggestions.filter((item) =>
  !normalizedItems.value.some((existing) => existing.toLocaleLowerCase() === item.toLocaleLowerCase())
))

const update = (items: string[]) => emit('update:modelValue', items.slice(0, props.maxItems))

const addValues = (raw: string) => {
  if (!canAdd.value) return
  const next = [...normalizedItems.value]
  const values = raw
    .split(/[，,、；;\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
  for (const value of values) {
    if (next.length >= props.maxItems) break
    if (!next.some((item) => item.toLocaleLowerCase() === value.toLocaleLowerCase())) next.push(value)
  }
  update(next)
  inputValue.value = ''
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ',' || event.key === '，' || event.key === ';' || event.key === '；' || event.key === '、') {
    event.preventDefault()
    addValues(inputValue.value)
    return
  }
  if (event.key === 'Backspace' && !inputValue.value && normalizedItems.value.length) {
    update(normalizedItems.value.slice(0, -1))
  }
}

const remove = (index: number) => update(normalizedItems.value.filter((_, itemIndex) => itemIndex !== index))

const move = (index: number, offset: -1 | 1) => {
  const target = index + offset
  if (target < 0 || target >= normalizedItems.value.length) return
  const next = [...normalizedItems.value]
  const current = next[index]
  const sibling = next[target]
  if (current === undefined || sibling === undefined) return
  next[index] = sibling
  next[target] = current
  update(next)
}
</script>

<template>
  <fieldset class="tag-field" data-magnetic-exclude>
    <legend :id="`${inputId}-label`">{{ label }}<span v-if="required" aria-hidden="true"> *</span></legend>
    <p v-if="hint" :id="`${inputId}-hint`" class="tag-hint">{{ hint }}</p>

    <div v-if="normalizedItems.length" class="tag-list" aria-live="polite">
      <span v-for="(item, index) in normalizedItems" :key="`${item}-${index}`" class="tag-item">
        <span>{{ item }}</span>
        <M3IconButton :label="`将“${item}”向前移动`" :disabled="index === 0" @click="move(index, -1)"><ArrowLeft :size="13" /></M3IconButton>
        <M3IconButton :label="`将“${item}”向后移动`" :disabled="index === normalizedItems.length - 1" @click="move(index, 1)"><ArrowRight :size="13" /></M3IconButton>
        <M3IconButton :label="`移除“${item}”`" @click="remove(index)"><X :size="14" /></M3IconButton>
      </span>
    </div>

    <div class="tag-entry" :class="{ disabled: !canAdd }">
      <M3TextField
        :id="inputId"
        v-model="inputValue"
        :disabled="!canAdd"
        :placeholder="canAdd ? placeholder : `最多添加 ${maxItems} 项`"
        :aria-labelledby="`${inputId}-label`"
        :aria-describedby="hint ? `${inputId}-hint` : undefined"
        @keydown="handleKeydown"
      />
      <M3IconButton :disabled="!canAdd || !inputValue.trim()" label="添加" @click="addValues(inputValue)"><Plus :size="17" /></M3IconButton>
    </div>

    <div v-if="availableSuggestions.length && canAdd" class="tag-suggestions" aria-label="可以直接选择">
      <span>也可以直接选：</span>
      <M3Button v-for="item in availableSuggestions" :key="item" variant="text" type="button" @click="addValues(item)">+ {{ item }}</M3Button>
    </div>
    <span class="tag-count">已添加 {{ normalizedItems.length }} / {{ maxItems }} 项</span>
  </fieldset>
</template>

<style scoped>
.tag-field { min-width: 0; margin: 0; border: 0; padding: 0; }
.tag-field legend { padding: 0; color: var(--md-sys-color-on-surface); font-size: var(--md-sys-typescale-body-medium-size); font-weight: 500; }
.tag-hint { margin: 4px 0 10px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-body-small-size); line-height: 1.45; }
.tag-list { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 9px; }
.tag-item { display: inline-flex; align-items: center; min-height: 34px; border-radius: var(--md-sys-shape-corner-small); background: var(--md-sys-color-secondary-container); color: var(--md-sys-color-on-secondary-container); padding-left: 12px; overflow: hidden; }
.tag-item > span { max-width: 230px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--md-sys-typescale-label-large-size); }
.tag-item :deep(md-icon-button) { width: 28px; height: 30px; --md-icon-button-icon-size: 14px; }
.tag-item :deep(md-icon-button[disabled]) { opacity: .28; }
.tag-entry { display: grid; grid-template-columns: minmax(0, 1fr) 44px; min-height: 50px; border: 1px solid var(--md-sys-color-outline); border-radius: var(--md-sys-shape-corner-extra-small); background: var(--md-sys-color-surface-container-lowest); overflow: hidden; transition: border-color var(--md-sys-motion-duration-short4) var(--md-sys-motion-easing-standard); }
.tag-entry:focus-within { border-color: var(--md-sys-color-primary); }
.tag-entry.disabled { opacity: .64; }
.tag-entry :deep(md-outlined-text-field) { --md-outlined-text-field-outline-width: 0; --md-outlined-text-field-focus-outline-width: 0; }
.tag-entry :deep(md-icon-button) { color: var(--md-sys-color-primary); }
.tag-entry :deep(md-icon-button[disabled]) { color: var(--md-sys-color-on-surface-variant); opacity: .45; }
.tag-suggestions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 9px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-medium-size); }
.tag-suggestions :deep(.m3-button) { min-height: 30px; border-radius: var(--md-sys-shape-corner-full); background: var(--md-sys-color-surface-container); }
.tag-count { display: block; margin-top: 6px; color: var(--md-sys-color-on-surface-variant); font-size: var(--md-sys-typescale-label-small-size); text-align: right; }
@media (prefers-reduced-motion: reduce) { .tag-entry { transition: none; } }
</style>
