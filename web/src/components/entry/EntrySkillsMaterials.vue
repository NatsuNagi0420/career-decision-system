<template>
  <div class="card section mb-6">
    <div class="section-head">
      <div class="section-title">技能与证明材料</div>
      <div class="text-sub text-sm">技能标签 + 项目/实习描述越具体，模型分析越准</div>
    </div>

    <div class="sub-block">
      <div class="sub-title">核心技能标签</div>
      <div class="tag-group">
        <el-tag
          v-for="tag in skills"
          :key="tag"
          closable
          @close="$emit('remove-skill', tag)"
          class="mr-2 mb-2"
        >
          {{ tag }}
        </el-tag>
        <el-input
          v-if="inputVisible"
          ref="inputRef"
          v-model="inputValue"
          class="w-20 inline-block"
          size="small"
          @keyup.enter="handleInputConfirm"
          @blur="handleInputConfirm"
        />
        <el-button v-else class="button-new-tag" size="small" @click="showInput">
          + 添加技能
        </el-button>
      </div>
    </div>

    <div class="sub-block">
      <div class="sub-title">作品/链接（可选）</div>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-input :model-value="links.github" placeholder="GitHub 主页链接" @update:model-value="updateLink('github', $event)" />
        </el-col>
        <el-col :span="12">
          <el-input :model-value="links.portfolio" placeholder="作品集/博客链接" @update:model-value="updateLink('portfolio', $event)" />
        </el-col>
      </el-row>
    </div>

    <div class="sub-block">
      <div class="sub-title">证书（可选）</div>
      <div v-for="(cert, index) in certificates" :key="index" class="dynamic-item mb-4">
        <el-input :model-value="cert" placeholder="例如：CET-6 / 软考 / AWS 认证" @update:model-value="updateCertificate(index, $event)">
          <template #append>
            <el-button @click="$emit('remove-certificate', index)"><el-icon><Delete /></el-icon></el-button>
          </template>
        </el-input>
      </div>
      <el-button type="primary" link @click="$emit('add-certificate')">+ 添加证书</el-button>
    </div>

    <div class="sub-block">
      <div class="sub-title">实习/项目经历</div>
      <div v-for="(exp, index) in experiences" :key="index" class="exp-item mb-4">
        <el-form label-position="top">
          <el-form-item label="项目/公司名称">
            <el-input :model-value="exp.title" placeholder="例如：校内项目 / 某互联网公司实习" @update:model-value="updateExperience(index, 'title', $event)" />
          </el-form-item>
          <el-form-item label="职责描述">
            <el-input
              :model-value="exp.desc"
              type="textarea"
              rows="3"
              placeholder="建议写清楚：做了什么、用到了什么、结果如何（数据/指标）"
              @update:model-value="updateExperience(index, 'desc', $event)"
            />
          </el-form-item>
        </el-form>
        <el-button type="danger" link @click="$emit('remove-experience', index)">删除此项</el-button>
      </div>
      <el-button type="primary" link @click="$emit('add-experience')">+ 添加经历</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Delete } from '@element-plus/icons-vue'

defineOptions({
  name: 'EntrySkillsMaterials'
})

interface Experience {
  title: string
  desc: string
}

interface Links {
  github: string
  portfolio: string
}

interface Props {
  skills: string[]
  links: Links
  certificates: string[]
  experiences: Experience[]
}

interface Emits {
  (e: 'add-skill', skill: string): void
  (e: 'remove-skill', skill: string): void
  (e: 'update:links', links: Links): void
  (e: 'update-certificate', index: number, value: string): void
  (e: 'add-certificate'): void
  (e: 'remove-certificate', index: number): void
  (e: 'update-experience', index: number, field: 'title' | 'desc', value: string): void
  (e: 'add-experience'): void
  (e: 'remove-experience', index: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const inputValue = ref('')
const inputVisible = ref(false)
type InputLike = { input?: HTMLInputElement }
const inputRef = ref<InputLike | null>(null)

const showInput = () => {
  inputVisible.value = true
  nextTick(() => {
    inputRef.value?.input?.focus()
  })
}

const handleInputConfirm = () => {
  if (inputValue.value) {
    emit('add-skill', inputValue.value)
  }
  inputVisible.value = false
  inputValue.value = ''
}

const updateLink = (field: keyof Links, value: string) => {
  emit('update:links', {
    ...props.links,
    [field]: value
  })
}

const updateCertificate = (index: number, value: string) => {
  emit('update-certificate', index, value)
}

const updateExperience = (index: number, field: 'title' | 'desc', value: string) => {
  emit('update-experience', index, field, value)
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

.sub-block {
  margin-top: 16px;
}

.sub-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--clay-text);
  margin-bottom: 10px;
}

.exp-item {
  border: 1px dashed var(--clay-border);
  border-radius: var(--clay-radius-panel);
  padding: 16px;
  background: var(--clay-surface-variant);
}
</style>
