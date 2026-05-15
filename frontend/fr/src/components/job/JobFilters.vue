<!--
  组件：岗位筛选面板
  职责：提供岗位筛选条件选择
-->
<script setup lang="ts">
import { SlidersHorizontal, MapPin, Scale, CheckCircle2, Banknote } from 'lucide-vue-next'

interface Props {
  cities: string[]
  industries: string[]
  companySizes: string[]
  companyTypes: string[]
  filterCity: string[]
  filterIndustry: string[]
  filterCompanySize: string[]
  filterCompanyType: string[]
  filterKeyword: string
  salaryRange: [number, number]
}

interface Emits {
  (e: 'update:filterCity', value: string[]): void
  (e: 'update:filterIndustry', value: string[]): void
  (e: 'update:filterCompanySize', value: string[]): void
  (e: 'update:filterCompanyType', value: string[]): void
  (e: 'update:filterKeyword', value: string): void
  (e: 'update:salaryRange', value: [number, number]): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="panel filter-panel">
    <div class="panel-title">
      <SlidersHorizontal :size="18" />
      <span>筛选条件</span>
    </div>

    <div class="field">
      <div class="label">
        <MapPin :size="16" /> 城市
      </div>
      <el-select
        :model-value="filterCity"
        @update:model-value="emit('update:filterCity', $event)"
        multiple
        placeholder="不限"
        class="w-full"
      >
        <el-option v-for="c in cities" :key="c" :label="c" :value="c" />
      </el-select>
    </div>

    <div class="field">
      <div class="label">
        <SlidersHorizontal :size="16" /> 行业
      </div>
      <el-select
        :model-value="filterIndustry"
        @update:model-value="emit('update:filterIndustry', $event)"
        multiple
        placeholder="不限"
        class="w-full"
      >
        <el-option v-for="i in industries" :key="i" :label="i" :value="i" />
      </el-select>
    </div>

    <div class="field">
      <div class="label">
        <Scale :size="16" /> 公司规模
      </div>
      <el-select
        :model-value="filterCompanySize"
        @update:model-value="emit('update:filterCompanySize', $event)"
        multiple
        placeholder="不限"
        class="w-full"
      >
        <el-option v-for="s in companySizes" :key="s" :label="s" :value="s" />
      </el-select>
    </div>

    <div class="field">
      <div class="label">
        <CheckCircle2 :size="16" /> 公司类型
      </div>
      <el-select
        :model-value="filterCompanyType"
        @update:model-value="emit('update:filterCompanyType', $event)"
        multiple
        placeholder="不限"
        class="w-full"
      >
        <el-option v-for="t in companyTypes" :key="t" :label="t" :value="t" />
      </el-select>
    </div>

    <div class="field">
      <div class="label">
        <SlidersHorizontal :size="16" /> 关键词
      </div>
      <el-input
        :model-value="filterKeyword"
        @update:model-value="emit('update:filterKeyword', $event)"
        placeholder="如：前端、产品、数据"
        clearable
      />
    </div>

    <div class="field">
      <div class="label">
        <Banknote :size="16" /> 薪资区间（k）
      </div>
      <el-slider
        :model-value="salaryRange"
        @update:model-value="emit('update:salaryRange', $event)"
        range
        :min="0"
        :max="60"
        :step="1"
      />
      <div class="text-mute text-xs">
        {{ salaryRange[0] }}k - {{ salaryRange[1] }}k
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  padding: 20px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
  box-shadow: var(--clay-shadow);
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 800;
  font-size: 16px;
  margin-bottom: 20px;
  color: var(--clay-text);
}

.field {
  margin-bottom: 20px;
}

.field:last-child {
  margin-bottom: 0;
}

.label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
  color: var(--clay-text);
}

.w-full {
  width: 100%;
}

.text-mute {
  color: var(--clay-text-subtle);
}

.text-xs {
  font-size: 12px;
}
</style>
