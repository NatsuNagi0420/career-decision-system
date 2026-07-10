<script setup lang="ts">
import { computed } from 'vue'

defineOptions({
  name: 'AppDialog'
})

const props = defineProps<{
  modelValue: boolean
  title?: string
  message?: string
  confirmText?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm'): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const onConfirm = () => {
  emit('confirm')
  visible.value = false
}
</script>

<template>
  <el-dialog v-model="visible" :title="title || '提示'" width="420px" align-center>
    <div class="dialog-body">{{ message || '' }}</div>
    <template #footer>
      <el-button type="primary" @click="onConfirm">{{ confirmText || '知道了' }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.dialog-body {
  font-size: 14px;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
}
</style>

