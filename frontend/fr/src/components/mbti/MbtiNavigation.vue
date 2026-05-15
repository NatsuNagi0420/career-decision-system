<!--
  组件：MBTI 测评导航按钮
  职责：提供上一题、下一题、提交等导航功能
-->
<script setup lang="ts">
defineProps<{
  isFirstQuestion: boolean
  isLastQuestion: boolean
  canSubmit: boolean
  currentAnswered: boolean
}>()

const emit = defineEmits<{
  prev: []
  next: []
  submit: []
}>()
</script>

<template>
  <div class="quiz-navigation">
    <el-button
      :disabled="isFirstQuestion"
      @click="emit('prev')"
    >
      上一题
    </el-button>
    <el-button
      v-if="!isLastQuestion"
      type="primary"
      :disabled="!currentAnswered"
      @click="emit('next')"
    >
      下一题
    </el-button>
    <el-button
      v-else
      type="primary"
      :disabled="!canSubmit"
      @click="emit('submit')"
    >
      完成测评
    </el-button>
  </div>
</template>

<style scoped>
.quiz-navigation {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

@media (max-width: 768px) {
  .quiz-navigation {
    flex-direction: column;
  }

  .quiz-navigation .el-button {
    width: 100%;
  }
}
</style>
