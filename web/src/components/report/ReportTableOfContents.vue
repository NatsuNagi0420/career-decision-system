<template>
  <aside class="toc card">
    <div class="toc-title">目录</div>
    <a class="toc-link" href="#sec-summary">A. 总览</a>
    <a class="toc-link" href="#sec-target">B. 目标岗位</a>
    <a class="toc-link" href="#sec-gap">C. 差距清单</a>
    <a class="toc-link" href="#sec-plan">D. 行动计划</a>
    <a class="toc-link" href="#sec-match">E. 岗位匹配详析</a>
    <a class="toc-link" href="#sec-evidence">F. 能力证据与亮点</a>
    <a class="toc-link" href="#sec-skill">G. 技能提升路径</a>
    <a class="toc-link" href="#sec-90days">H. 90天行动清单</a>
    <a class="toc-link" href="#sec-risk">I. 风险与备选路径</a>
    <a class="toc-link" href="#sec-resume">J. 简历与面试策略</a>
    <div class="toc-actions">
      <el-button class="w-full" plain @click="$emit('back')">
        <ArrowLeft :size="16" class="mr" />返回路径规划
      </el-button>
      <el-button class="w-full" type="primary" @click="$emit('export')">
        <Download :size="16" class="mr" />下载/打印
      </el-button>
      <el-button class="w-full" type="primary" plain @click="$emit('save')">
        <Save :size="16" class="mr" />保存归档
      </el-button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ArrowLeft, Download, Save } from 'lucide-vue-next'

defineEmits<{
  back: []
  export: []
  save: []
}>()
</script>

<style scoped>
.toc {
  padding: 16px;
  border-radius: var(--clay-radius-card);
  position: sticky;
  top: 84px;
}

.toc-title {
  font-weight: 900;
  margin-bottom: 12px;
}

.toc-link {
  display: block;
  padding: 8px 10px;
  border-radius: 10px;
  color: #334155;
  text-decoration: none;
  transition: background 0.2s ease, color 0.2s ease;
}

.toc-link:hover {
  background: var(--clay-surface-variant);
  color: var(--clay-ube-800);
}

.toc-actions {
  margin-top: 14px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.mr {
  margin-right: 6px;
}

@media print {
  .toc {
    display: none;
  }
}
</style>
