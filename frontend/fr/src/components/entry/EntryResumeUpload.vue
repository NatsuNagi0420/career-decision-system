<template>
  <div class="card section mb-6">
    <div class="section-head">
      <div class="section-title">简历解析</div>
      <div class="text-sub text-sm">支持 PDF/Word，上传后自动填充部分字段</div>
    </div>
    <el-upload
      class="resume-uploader"
      drag
      action="#"
      :auto-upload="false"
      :on-change="handleChange"
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">
        将文件拖到此处，或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          上传简历可自动填充下方基础信息、技能及经历
        </div>
      </template>
    </el-upload>
  </div>
</template>

<script setup lang="ts">
import { UploadFilled } from '@element-plus/icons-vue'
import type { UploadFile } from 'element-plus'

defineOptions({
  name: 'EntryResumeUpload'
})

interface Emits {
  (e: 'upload', file: UploadFile): void
}

const emit = defineEmits<Emits>()

const handleChange = (file: UploadFile) => {
  emit('upload', file)
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
