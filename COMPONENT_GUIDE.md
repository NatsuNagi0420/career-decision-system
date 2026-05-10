# 职业规划平台 - 组件开发指南

> **版本**：v2.0.0  
> **适用范围**：Vue 3 组件开发  
> **最后更新**：2026-05-10

---

## 📋 目录

1. [组件设计原则](#组件设计原则)
2. [组件分类](#组件分类)
3. [组件开发流程](#组件开发流程)
4. [业务组件开发](#业务组件开发)
5. [表单组件开发](#表单组件开发)
6. [UI 组件开发](#ui组件开发)
7. [组件测试](#组件测试)
8. [组件文档](#组件文档)
9. [最佳实践](#最佳实践)

---

## 组件设计原则

### 1. 单一职责原则（SRP）

每个组件只负责一个功能或一个业务场景。

**✅ 好的设计**：
```
UserCard.vue          # 只负责展示用户卡片
UserAvatar.vue        # 只负责展示用户头像
UserActions.vue       # 只负责用户操作按钮
```

**❌ 不好的设计**：
```
UserComponent.vue     # 包含卡片、头像、操作、编辑表单等所有功能
```

### 2. 开闭原则（OCP）

组件应该对扩展开放，对修改关闭。

**✅ 好的设计**：
```vue
<!-- 通过 props 和 slots 扩展功能 -->
<UserCard :user="user">
  <template #actions>
    <CustomActions />
  </template>
</UserCard>
```

**❌ 不好的设计**：
```vue
<!-- 每次新增功能都要修改组件内部代码 -->
<UserCard :user="user" :show-edit="true" :show-delete="true" :show-share="true" />
```

### 3. 组合优于继承

使用组合式 API 和 Composables 而不是组件继承。

**✅ 好的设计**：
```typescript
// 使用 Composables
const { loading, error, data, execute } = useApiRequest(api.getUser)
```

**❌ 不好的设计**：
```typescript
// 使用 mixins（Vue 2 风格）
export default {
  mixins: [apiMixin, loadingMixin]
}
```

### 4. 最小知识原则

组件只需要知道必要的信息，不应该依赖过多的外部状态。

**✅ 好的设计**：
```vue
<!-- 只接收必要的 props -->
<UserCard :user="user" @update="handleUpdate" />
```

**❌ 不好的设计**：
```vue
<!-- 依赖全局状态和多个 store -->
<UserCard />  <!-- 内部直接访问 userStore, authStore, configStore -->
```

---

## 组件分类

### 1. 业务组件（Business Components）

**位置**：`src/components/business/`

**特点**：
- 包含业务逻辑
- 与特定业务场景绑定
- 可能调用 API
- 使用 Store

**示例**：
```
ResumeUploader/       # 简历上传组件
MbtiAssessment/       # MBTI 测评组件
JobCard/              # 岗位卡片组件
CapabilityChart/      # 能力雷达图组件
```

### 2. 表单组件（Form Components）

**位置**：`src/components/form/`

**特点**：
- 处理表单逻辑
- 数据验证
- 双向绑定
- 可复用

**示例**：
```
FormSection.vue       # 表单区块
FormField.vue         # 表单字段
DynamicList.vue       # 动态列表
StepForm.vue          # 分步表单
```

### 3. UI 组件（UI Components）

**位置**：`src/components/ui/`

**特点**：
- 纯展示组件
- 无业务逻辑
- 高度可复用
- 样式可定制

**示例**：
```
Button.vue            # 按钮
Card.vue              # 卡片
Modal.vue             # 弹窗
Loading.vue           # 加载状态
```

### 4. 布局组件（Layout Components）

**位置**：`src/components/ui/layouts/`

**特点**：
- 页面布局结构
- 响应式设计
- 插槽丰富

**示例**：
```
MainLayout.vue        # 主布局
ListPageLayout.vue    # 列表页布局
DetailPageLayout.vue  # 详情页布局
FormPageLayout.vue    # 表单页布局
```

---

## 组件开发流程

### Step 1：需求分析

**问题清单**：
- [ ] 这个组件的核心功能是什么？
- [ ] 需要哪些 props？
- [ ] 需要触发哪些事件？
- [ ] 是否需要插槽？
- [ ] 是否需要调用 API？
- [ ] 是否需要状态管理？
- [ ] 是否需要响应式设计？

### Step 2：设计接口

**定义 Props**：
```typescript
interface Props {
  // 必填 props
  userId: string
  
  // 可选 props（提供默认值）
  showAvatar?: boolean
  size?: 'small' | 'medium' | 'large'
  
  // 复杂类型
  user?: UserInfo
  config?: ComponentConfig
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true,
  size: 'medium'
})
```

**定义 Emits**：
```typescript
interface Emits {
  // 事件名称和参数类型
  (e: 'update', value: UserInfo): void
  (e: 'delete', id: string): void
  (e: 'error', error: Error): void
}

const emit = defineEmits<Emits>()
```

**定义 Slots**：
```typescript
// 在模板中定义
<template>
  <div class="component">
    <!-- 默认插槽 -->
    <slot />
    
    <!-- 具名插槽 -->
    <slot name="header" />
    <slot name="footer" />
    
    <!-- 作用域插槽 -->
    <slot name="item" :item="item" :index="index" />
  </div>
</template>
```

### Step 3：实现组件

**组件结构**：
```vue
<template>
  <!-- 模板 -->
</template>

<script setup lang="ts">
// 1. 导入
import { ref, computed, onMounted } from 'vue'
import type { UserInfo } from '@/types/models'

// 2. Props & Emits
interface Props {
  userId: string
}
const props = defineProps<Props>()

interface Emits {
  (e: 'update', value: UserInfo): void
}
const emit = defineEmits<Emits>()

// 3. 响应式数据
const user = ref<UserInfo | null>(null)
const loading = ref(false)

// 4. 计算属性
const displayName = computed(() => user.value?.name ?? 'Unknown')

// 5. 方法
const fetchUser = async () => {
  loading.value = true
  try {
    // API 调用
  } finally {
    loading.value = false
  }
}

// 6. 生命周期
onMounted(() => {
  fetchUser()
})
</script>

<style scoped>
/* 样式 */
</style>
```

### Step 4：编写测试

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserCard from './UserCard.vue'

describe('UserCard', () => {
  it('should render user name', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: { id: '1', name: 'John' }
      }
    })
    expect(wrapper.text()).toContain('John')
  })
})
```

### Step 5：编写文档

```typescript
/**
 * 用户卡片组件
 * 
 * @description 展示用户基本信息，支持编辑和删除操作
 * 
 * @example
 * ```vue
 * <UserCard 
 *   :user="user" 
 *   @update="handleUpdate"
 * />
 * ```
 */
```

---

## 业务组件开发

### 示例：简历上传组件

#### 1. 组件结构

```
ResumeUploader/
├── index.vue              # 主组件
├── useResumeParser.ts     # 简历解析逻辑
├── types.ts               # 类型定义
└── README.md              # 组件文档
```

#### 2. 主组件实现

```vue
<!-- ResumeUploader/index.vue -->
<template>
  <div class="resume-uploader">
    <el-upload
      drag
      :auto-upload="false"
      :on-change="handleFileChange"
      :accept="acceptedFormats"
    >
      <el-icon class="el-icon--upload">
        <UploadFilled />
      </el-icon>
      <div class="el-upload__text">
        将文件拖到此处，或 <em>点击上传</em>
      </div>
      <template #tip>
        <div class="el-upload__tip">
          支持 PDF、Word 格式，文件大小不超过 10MB
        </div>
      </template>
    </el-upload>

    <!-- 解析进度 -->
    <div v-if="parsing" class="parsing-status">
      <el-progress :percentage="progress" />
      <p>正在解析简历...</p>
    </div>

    <!-- 解析结果预览 -->
    <div v-if="result" class="result-preview">
      <h4>解析结果</h4>
      <div class="result-item">
        <span class="label">姓名：</span>
        <span>{{ result.basic?.name }}</span>
      </div>
      <div class="result-item">
        <span class="label">邮箱：</span>
        <span>{{ result.basic?.email }}</span>
      </div>
      <!-- 更多字段... -->
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { useResumeParser } from './useResumeParser'
import type { ResumeParseResult } from './types'

interface Props {
  acceptedFormats?: string
  maxSize?: number  // MB
}

const props = withDefaults(defineProps<Props>(), {
  acceptedFormats: '.pdf,.doc,.docx',
  maxSize: 10
})

interface Emits {
  (e: 'success', result: ResumeParseResult): void
  (e: 'error', error: Error): void
}

const emit = defineEmits<Emits>()

const { parseResume, parsing, progress, result, error } = useResumeParser()

const handleFileChange = async (file: UploadFile) => {
  if (!file.raw) {
    ElMessage.error('未获取到上传文件')
    return
  }

  // 文件大小检查
  const sizeMB = file.raw.size / 1024 / 1024
  if (sizeMB > props.maxSize) {
    ElMessage.error(`文件大小不能超过 ${props.maxSize}MB`)
    return
  }

  try {
    await parseResume(file.raw)
    if (result.value) {
      emit('success', result.value)
      ElMessage.success('简历解析成功')
    }
  } catch (e) {
    emit('error', e as Error)
    ElMessage.error('简历解析失败')
  }
}
</script>

<style scoped>
.resume-uploader {
  padding: 24px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface);
  border: 1px solid var(--clay-border);
}

.parsing-status {
  margin-top: 20px;
  text-align: center;
}

.result-preview {
  margin-top: 20px;
  padding: 16px;
  border-radius: var(--clay-radius-card);
  background: var(--clay-surface-variant);
}

.result-item {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.label {
  font-weight: 600;
  color: var(--clay-text);
}
</style>
```

#### 3. Composable 实现

```typescript
// ResumeUploader/useResumeParser.ts
import { ref } from 'vue'
import { parseResumeApi } from '@/api/resume'
import type { ResumeParseResult } from './types'

export function useResumeParser() {
  const parsing = ref(false)
  const progress = ref(0)
  const result = ref<ResumeParseResult | null>(null)
  const error = ref<Error | null>(null)

  const parseResume = async (file: File) => {
    parsing.value = true
    progress.value = 0
    error.value = null

    try {
      // 模拟进度
      progress.value = 10

      // 调用 API
      const data = await parseResumeApi(file)
      progress.value = 60

      // 处理结果
      result.value = data
      progress.value = 100
    } catch (e) {
      error.value = e as Error
      throw e
    } finally {
      parsing.value = false
    }
  }

  return {
    parsing,
    progress,
    result,
    error,
    parseResume
  }
}
```

#### 4. 类型定义

```typescript
// ResumeUploader/types.ts
export interface ResumeParseResult {
  basic?: {
    name?: string
    email?: string
    phone?: string
    school?: string
    major?: string
  }
  target?: {
    intentionPosition?: string
    intentionCities?: string[]
    expectedSalary?: string
  }
  skills?: string[]
  certificates?: string[]
  workExperiences?: Array<{
    title: string
    description: string
  }>
}
```

---

## 表单组件开发

### 示例：动态列表组件

```vue
<!-- DynamicList.vue -->
<template>
  <div class="dynamic-list">
    <div
      v-for="(item, index) in modelValue"
      :key="index"
      class="list-item"
    >
      <slot name="item" :item="item" :index="index" :remove="() => removeItem(index)">
        <!-- 默认渲染 -->
        <el-input v-model="modelValue[index]" />
        <el-button @click="removeItem(index)">
          <el-icon><Delete /></el-icon>
        </el-button>
      </slot>
    </div>

    <el-button type="primary" link @click="addItem">
      <el-icon><Plus /></el-icon>
      {{ addButtonText }}
    </el-button>
  </div>
</template>

<script setup lang="ts" generic="T">
import { Delete, Plus } from '@element-plus/icons-vue'

interface Props {
  modelValue: T[]
  addButtonText?: string
  defaultItem?: T | (() => T)
  maxItems?: number
}

const props = withDefaults(defineProps<Props>(), {
  addButtonText: '添加',
  maxItems: 10
})

interface Emits {
  (e: 'update:modelValue', value: T[]): void
}

const emit = defineEmits<Emits>()

const addItem = () => {
  if (props.modelValue.length >= props.maxItems) {
    return
  }

  const newItem = typeof props.defaultItem === 'function'
    ? props.defaultItem()
    : props.defaultItem ?? ({} as T)

  emit('update:modelValue', [...props.modelValue, newItem])
}

const removeItem = (index: number) => {
  const newValue = [...props.modelValue]
  newValue.splice(index, 1)
  emit('update:modelValue', newValue)
}
</script>

<style scoped>
.dynamic-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-item {
  display: flex;
  gap: 12px;
  align-items: center;
}
</style>
```

**使用示例**：

```vue
<template>
  <!-- 简单列表 -->
  <DynamicList
    v-model="certificates"
    add-button-text="添加证书"
    :default-item="''"
  />

  <!-- 复杂列表（使用插槽） -->
  <DynamicList
    v-model="experiences"
    add-button-text="添加经历"
    :default-item="() => ({ title: '', desc: '' })"
  >
    <template #item="{ item, index, remove }">
      <div class="experience-item">
        <el-input v-model="item.title" placeholder="项目/公司名称" />
        <el-input
          v-model="item.desc"
          type="textarea"
          placeholder="职责描述"
        />
        <el-button type="danger" link @click="remove">删除</el-button>
      </div>
    </template>
  </DynamicList>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const certificates = ref<string[]>([])
const experiences = ref<Array<{ title: string; desc: string }>>([])
</script>
```

---

## UI 组件开发

### 示例：加载状态组件

```vue
<!-- Loading.vue -->
<template>
  <div class="loading-container" :class="sizeClass">
    <div class="loading-spinner">
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
      <div class="spinner-ring"></div>
    </div>
    <p v-if="text" class="loading-text">{{ text }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  size?: 'small' | 'medium' | 'large'
  text?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium'
})

const sizeClass = computed(() => `loading-${props.size}`)
</script>

<style scoped>
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
}

.loading-spinner {
  position: relative;
  width: 40px;
  height: 40px;
}

.loading-small .loading-spinner {
  width: 24px;
  height: 24px;
}

.loading-large .loading-spinner {
  width: 60px;
  height: 60px;
}

.spinner-ring {
  position: absolute;
  width: 100%;
  height: 100%;
  border: 3px solid transparent;
  border-top-color: var(--clay-ube-800);
  border-radius: 50%;
  animation: spin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
}

.spinner-ring:nth-child(1) {
  animation-delay: -0.45s;
}

.spinner-ring:nth-child(2) {
  animation-delay: -0.3s;
}

.spinner-ring:nth-child(3) {
  animation-delay: -0.15s;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 14px;
  color: var(--clay-text-subtle);
  margin: 0;
}
</style>
```

---

## 组件测试

### 单元测试

```typescript
// tests/unit/components/ResumeUploader.spec.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ResumeUploader from '@/components/business/ResumeUploader/index.vue'

describe('ResumeUploader', () => {
  it('should render upload area', () => {
    const wrapper = mount(ResumeUploader)
    expect(wrapper.find('.el-upload').exists()).toBe(true)
  })

  it('should emit success event when parse succeeds', async () => {
    const wrapper = mount(ResumeUploader)
    
    // 模拟文件上传
    const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' })
    await wrapper.vm.handleFileChange({ raw: file })
    
    // 验证事件
    expect(wrapper.emitted('success')).toBeTruthy()
  })

  it('should show error when file is too large', async () => {
    const wrapper = mount(ResumeUploader, {
      props: { maxSize: 1 }
    })
    
    // 创建大文件（2MB）
    const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.pdf')
    await wrapper.vm.handleFileChange({ raw: largeFile })
    
    // 验证错误提示
    expect(wrapper.emitted('error')).toBeTruthy()
  })
})
```

### 组件快照测试

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserCard from '@/components/UserCard.vue'

describe('UserCard snapshot', () => {
  it('should match snapshot', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        }
      }
    })
    
    expect(wrapper.html()).toMatchSnapshot()
  })
})
```

---

## 组件文档

### README.md 模板

```markdown
# ResumeUploader - 简历上传组件

## 功能描述

支持 PDF/Word 格式简历上传，自动解析基础信息。

## 使用示例

\`\`\`vue
<template>
  <ResumeUploader
    :max-size="10"
    @success="handleSuccess"
    @error="handleError"
  />
</template>

<script setup lang="ts">
import ResumeUploader from '@/components/business/ResumeUploader'
import type { ResumeParseResult } from '@/components/business/ResumeUploader/types'

const handleSuccess = (result: ResumeParseResult) => {
  console.log('解析成功', result)
}

const handleError = (error: Error) => {
  console.error('解析失败', error)
}
</script>
\`\`\`

## Props

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| acceptedFormats | string | '.pdf,.doc,.docx' | 接受的文件格式 |
| maxSize | number | 10 | 最大文件大小（MB） |

## Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| success | ResumeParseResult | 解析成功 |
| error | Error | 解析失败 |

## 类型定义

\`\`\`typescript
interface ResumeParseResult {
  basic?: {
    name?: string
    email?: string
    // ...
  }
  // ...
}
\`\`\`

## 依赖

- Element Plus Upload 组件
- parseResumeApi（API 层）

## 注意事项

1. 文件大小限制默认 10MB
2. 仅支持 PDF 和 Word 格式
3. 解析结果可能不完整，需要用户确认
```

---

## 最佳实践

### 1. Props 验证

```typescript
// ✅ 推荐：使用 TypeScript 类型 + 默认值
interface Props {
  size: 'small' | 'medium' | 'large'
  count: number
}

const props = withDefaults(defineProps<Props>(), {
  size: 'medium',
  count: 0
})

// ❌ 避免：运行时验证（Vue 2 风格）
props: {
  size: {
    type: String,
    validator: (value) => ['small', 'medium', 'large'].includes(value)
  }
}
```

### 2. 事件命名

```typescript
// ✅ 推荐：使用动词，清晰表达意图
emit('update', value)
emit('delete', id)
emit('submit', data)

// ❌ 避免：使用名词或不清晰的命名
emit('change', value)  // 太通用
emit('click')          // 不清楚点击了什么
```

### 3. 插槽使用

```vue
<!-- ✅ 推荐：提供默认内容和作用域插槽 -->
<template>
  <div class="card">
    <slot name="header">
      <h3>{{ title }}</h3>
    </slot>
    
    <slot :data="data" :loading="loading">
      <p>{{ data }}</p>
    </slot>
  </div>
</template>

<!-- ❌ 避免：过多的具名插槽 -->
<template>
  <div class="card">
    <slot name="header-left" />
    <slot name="header-center" />
    <slot name="header-right" />
    <slot name="body-top" />
    <slot name="body-middle" />
    <slot name="body-bottom" />
    <!-- 太复杂了 -->
  </div>
</template>
```

### 4. 样式隔离

```vue
<style scoped>
/* ✅ 推荐：使用 scoped + BEM 命名 */
.user-card {
  /* 组件根元素 */
}

.user-card__header {
  /* 子元素 */
}

.user-card--active {
  /* 修饰符 */
}
</style>

<style>
/* ❌ 避免：全局样式污染 */
.card {
  /* 可能影响其他组件 */
}
</style>
```

### 5. 性能优化

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

// ✅ 推荐：使用 computed 缓存计算结果
const filteredList = computed(() => {
  return list.value.filter(item => item.active)
})

// ❌ 避免：在模板中直接计算
// <div v-for="item in list.filter(i => i.active)">
</script>

<template>
  <!-- ✅ 推荐：使用 v-show 切换频繁的元素 -->
  <div v-show="visible">Content</div>
  
  <!-- ✅ 推荐：使用 v-if 切换不频繁的元素 -->
  <div v-if="shouldRender">Heavy Component</div>
  
  <!-- ✅ 推荐：使用 key 优化列表渲染 -->
  <div v-for="item in list" :key="item.id">
    {{ item.name }}
  </div>
</template>
```

---

## 组件检查清单

### 开发完成前检查

- [ ] Props 类型定义完整
- [ ] Emits 类型定义完整
- [ ] 提供合理的默认值
- [ ] 样式使用 scoped
- [ ] 使用 Clay 设计系统变量
- [ ] 响应式设计（移动端适配）
- [ ] 错误处理完善
- [ ] 加载状态处理
- [ ] 空状态处理
- [ ] 编写单元测试
- [ ] 编写组件文档
- [ ] 代码符合规范

### Code Review 检查

- [ ] 组件职责单一
- [ ] 代码可读性好
- [ ] 无性能问题
- [ ] 无安全漏洞
- [ ] 可复用性高
- [ ] 易于维护

---

**维护者**：前端团队  
**创建时间**：2026-05-10  
**最后更新**：2026-05-10  
**版本**：v1.0.0
