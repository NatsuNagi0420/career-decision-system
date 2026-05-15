<template>
  <div class="card section mb-6">
    <div class="section-head">
      <div class="section-title">基础资料</div>
      <div class="text-sub text-sm">用于个性化画像、报告与后续提醒</div>
    </div>
    <el-form :model="{ basic: modelValue }" label-position="top">
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="姓名" required>
            <el-input :model-value="modelValue.name" placeholder="请输入真实姓名" @update:model-value="updateField('name', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系邮箱" required>
            <el-input :model-value="modelValue.email" placeholder="用于接收报告与机会提醒" @update:model-value="updateField('email', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="学校">
            <el-input :model-value="modelValue.school" placeholder="例如：XX大学" @update:model-value="updateField('school', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="专业">
            <el-input :model-value="modelValue.major" placeholder="例如：计算机科学与技术" @update:model-value="updateField('major', $event)" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="年级">
            <el-select :model-value="modelValue.grade" placeholder="请选择" class="w-full" @update:model-value="updateField('grade', $event)">
              <el-option label="大一" value="大一" />
              <el-option label="大二" value="大二" />
              <el-option label="大三" value="大三" />
              <el-option label="大四" value="大四" />
              <el-option label="研一" value="研一" />
              <el-option label="研二" value="研二" />
              <el-option label="研三" value="研三" />
              <el-option label="已毕业" value="已毕业" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="常驻城市">
            <el-input :model-value="modelValue.city" placeholder="例如：深圳" @update:model-value="updateField('city', $event)" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
  </div>
</template>

<script setup lang="ts">
defineOptions({
  name: 'EntryBasicInfoForm'
})

interface BasicInfo {
  name: string
  email: string
  school: string
  major: string
  grade: string
  city: string
}

interface Props {
  modelValue: BasicInfo
}

interface Emits {
  (e: 'update:modelValue', value: BasicInfo): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const updateField = (field: keyof BasicInfo, value: string) => {
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
