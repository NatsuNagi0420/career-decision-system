<template>
  <div class="card section mb-6">
    <div class="section-head">
      <div class="section-title">求职目标</div>
      <div class="text-sub text-sm">告诉我你想去哪、做什么、想要什么</div>
    </div>
    <el-form :model="{ target: modelValue }" label-position="top">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="目标方向/岗位" required>
            <el-input :model-value="modelValue.role" placeholder="例如：Java开发工程师 / 产品经理" @update:model-value="updateField('role', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="求职类型">
            <el-select :model-value="modelValue.jobType" placeholder="请选择" class="w-full" @update:model-value="updateField('jobType', $event)">
              <el-option label="实习" value="实习" />
              <el-option label="校招/全职" value="全职" />
              <el-option label="灵活" value="灵活" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="意向城市（可多选）">
            <el-select
              :model-value="modelValue.cities"
              multiple
              filterable
              allow-create
              default-first-option
              placeholder="例如：深圳、广州"
              class="w-full"
              @update:model-value="updateField('cities', $event)"
            >
              <el-option v-for="c in presetCities" :key="c" :label="c" :value="c" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="期望薪资（可选）">
            <el-input :model-value="modelValue.salary" placeholder="例如：15k-20k / 8k / 面议" @update:model-value="updateField('salary', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="可到岗时间（可选）">
            <el-input :model-value="modelValue.availableAt" placeholder="例如：两周内 / 2026-07" @update:model-value="updateField('availableAt', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="不想做的方向（可选）">
            <el-input
              :model-value="modelValue.avoid"
              placeholder="例如：销售 / 纯外包 / 频繁出差"
              @update:model-value="updateField('avoid', $event)"
            />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'EntryJobTargetForm'
})

interface JobTarget {
  role: string
  jobType: string
  cities: string[]
  salary: string
  availableAt: string
  avoid: string
}

interface Props {
  modelValue: JobTarget
  presetCities: string[]
}

interface Emits {
  (e: 'update:modelValue', value: JobTarget): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const updateField = <K extends keyof JobTarget>(field: K, value: JobTarget[K]) => {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value
  })
}
</script>

<style scoped>
.section {
  padding: 24px;
  border-radius: var(--clay-radius-card);
  border: 1px solid var(--clay-border);
  background: var(--clay-surface);
  box-shadow: var(--clay-shadow);
}

.section-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--clay-text);
  line-height: 1.2;
}
</style>
