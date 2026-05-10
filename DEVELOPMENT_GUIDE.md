# 职业规划平台 - 开发规范

> **版本**：v2.0.0  
> **适用范围**：前端 + 后端  
> **最后更新**：2026-05-10

---

## 📋 目录

1. [代码规范](#代码规范)
2. [命名规范](#命名规范)
3. [组件开发规范](#组件开发规范)
4. [状态管理规范](#状态管理规范)
5. [API 开发规范](#api-开发规范)
6. [样式规范](#样式规范)
7. [测试规范](#测试规范)
8. [Git 提交规范](#git-提交规范)
9. [文档规范](#文档规范)

---

## 代码规范

### TypeScript 规范

#### 1. 类型定义

**✅ 推荐**：
```typescript
// 使用 interface 定义对象类型
interface UserInfo {
  id: string
  name: string
  email: string
  avatar?: string
}

// 使用 type 定义联合类型、交叉类型
type JobType = 'intern' | 'fulltime' | 'flexible'
type UserWithRole = UserInfo & { role: string }

// 导出类型
export type { UserInfo, JobType }
```

**❌ 避免**：
```typescript
// 不要使用 any
const data: any = fetchData() // ❌

// 不要省略类型注解（除非能明确推断）
function calculate(a, b) { // ❌
  return a + b
}
```

#### 2. 函数定义

**✅ 推荐**：
```typescript
// 明确参数和返回值类型
function formatDate(date: Date, format: string): string {
  // ...
}

// 使用箭头函数（简短逻辑）
const add = (a: number, b: number): number => a + b

// 使用 async/await
async function fetchUser(id: string): Promise<UserInfo> {
  const response = await api.get(`/users/${id}`)
  return response.data
}
```

**❌ 避免**：
```typescript
// 不要省略返回值类型（复杂函数）
function complexCalculation(data) { // ❌
  // 100 lines of code
  return result
}

// 不要使用 Promise.then（优先 async/await）
function fetchUser(id) { // ❌
  return api.get(`/users/${id}`).then(res => res.data)
}
```

#### 3. 可选链和空值合并

**✅ 推荐**：
```typescript
// 使用可选链
const userName = user?.profile?.name

// 使用空值合并
const displayName = userName ?? 'Anonymous'

// 组合使用
const email = user?.contact?.email ?? 'no-email@example.com'
```

---

### Vue 3 规范

#### 1. 组合式 API（Composition API）

**✅ 推荐**：
```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { UserInfo } from '@/types/models'

// Props 定义
interface Props {
  userId: string
  showAvatar?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showAvatar: true
})

// Emits 定义
interface Emits {
  (e: 'update', value: UserInfo): void
  (e: 'delete', id: string): void
}

const emit = defineEmits<Emits>()

// 响应式数据
const user = ref<UserInfo | null>(null)
const loading = ref(false)

// 计算属性
const displayName = computed(() => {
  return user.value?.name ?? 'Unknown'
})

// 方法
const fetchUser = async () => {
  loading.value = true
  try {
    user.value = await api.getUser(props.userId)
  } finally {
    loading.value = false
  }
}

// 生命周期
onMounted(() => {
  fetchUser()
})
</script>
```

**❌ 避免**：
```vue
<script>
// 不要使用 Options API（新代码）
export default {
  data() {
    return {
      user: null
    }
  },
  methods: {
    fetchUser() {
      // ...
    }
  }
}
</script>
```

#### 2. 模板规范

**✅ 推荐**：
```vue
<template>
  <div class="user-card">
    <!-- 使用 v-if/v-else-if/v-else -->
    <div v-if="loading" class="loading">加载中...</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <div v-else-if="user" class="content">
      <!-- 使用简洁的属性绑定 -->
      <img :src="user.avatar" :alt="user.name" />
      <h3>{{ user.name }}</h3>
      
      <!-- 事件处理 -->
      <button @click="handleEdit">编辑</button>
    </div>
    <div v-else class="empty">暂无数据</div>
  </div>
</template>
```

**❌ 避免**：
```vue
<template>
  <!-- 不要在模板中写复杂逻辑 -->
  <div>
    {{ user ? user.name ? user.name.toUpperCase() : 'N/A' : 'Loading' }} <!-- ❌ -->
  </div>
  
  <!-- 不要使用 v-html（XSS 风险） -->
  <div v-html="userInput"></div> <!-- ❌ -->
</template>
```

#### 3. 组件通信

**✅ 推荐**：
```typescript
// 父传子：Props
<ChildComponent :user="user" :show-avatar="true" />

// 子传父：Emits
emit('update', newValue)

// 跨组件：Provide/Inject
// 父组件
provide('theme', theme)

// 子组件
const theme = inject<Ref<string>>('theme')

// 全局状态：Pinia Store
const userStore = useUserStore()
```

---

## 命名规范

### 文件命名

```
✅ 推荐：
- PascalCase：组件文件
  - UserCard.vue
  - JobList.vue
  - MbtiAssessment.vue

- camelCase：工具函数、Composables
  - useFormValidation.ts
  - formatDate.ts
  - apiClient.ts

- kebab-case：样式文件、配置文件
  - global.css
  - vite.config.ts
  - tsconfig.json

❌ 避免：
- user-card.vue（组件应该用 PascalCase）
- UseFormValidation.ts（Composables 应该用 camelCase）
- GlobalCSS.css（样式应该用 kebab-case）
```

### 变量命名

```typescript
// ✅ 推荐：camelCase
const userName = 'John'
const isLoading = false
const hasPermission = true

// 常量：UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3
const API_BASE_URL = 'https://api.example.com'

// 类型/接口：PascalCase
interface UserInfo { }
type JobType = 'intern' | 'fulltime'

// 枚举：PascalCase
enum UserRole {
  Admin = 'admin',
  User = 'user'
}

// ❌ 避免
const UserName = 'John' // 变量不要用 PascalCase
const is_loading = false // 不要用 snake_case
```

### 函数命名

```typescript
// ✅ 推荐：动词开头，camelCase
function fetchUser() { }
function calculateTotal() { }
function validateEmail() { }

// Boolean 返回值：is/has/can 开头
function isValid() { }
function hasPermission() { }
function canEdit() { }

// 事件处理：handle 开头
function handleClick() { }
function handleSubmit() { }

// ❌ 避免
function user() { } // 不清晰
function click() { } // 应该是 handleClick
function check() { } // 应该是 isValid 或 validateXxx
```

### CSS 类名

```css
/* ✅ 推荐：kebab-case，BEM 命名 */
.user-card { }
.user-card__header { }
.user-card__title { }
.user-card--active { }

/* ❌ 避免 */
.UserCard { } /* 不要用 PascalCase */
.user_card { } /* 不要用 snake_case */
.card { } /* 太通用，容易冲突 */
```

---

## 组件开发规范

### 组件结构

```vue
<template>
  <!-- 1. 模板：简洁清晰 -->
  <div class="component-name">
    <!-- 内容 -->
  </div>
</template>

<script setup lang="ts">
// 2. 导入：按类型分组
// 2.1 Vue 相关
import { ref, computed, onMounted } from 'vue'

// 2.2 第三方库
import { ElMessage } from 'element-plus'

// 2.3 类型定义
import type { UserInfo } from '@/types/models'

// 2.4 组件
import UserCard from '@/components/UserCard.vue'

// 2.5 Composables
import { useApiRequest } from '@/composables/useApiRequest'

// 2.6 API
import { userApi } from '@/api/user'

// 2.7 工具函数
import { formatDate } from '@/utils/format'

// 3. Props & Emits
interface Props {
  userId: string
}

const props = defineProps<Props>()

interface Emits {
  (e: 'update', value: UserInfo): void
}

const emit = defineEmits<Emits>()

// 4. 响应式数据
const user = ref<UserInfo | null>(null)
const loading = ref(false)

// 5. 计算属性
const displayName = computed(() => user.value?.name ?? 'Unknown')

// 6. 方法
const fetchUser = async () => {
  // ...
}

// 7. 生命周期
onMounted(() => {
  fetchUser()
})

// 8. Watch
watch(() => props.userId, (newId) => {
  fetchUser()
})
</script>

<style scoped>
/* 3. 样式：使用 scoped，避免全局污染 */
.component-name {
  /* 使用 CSS 变量 */
  color: var(--clay-text);
  background: var(--clay-surface);
}
</style>
```

### 组件拆分原则

**何时拆分组件**：
1. 单个组件超过 300 行
2. 某个区块逻辑独立且可复用
3. 某个区块有独立的状态管理
4. 提高代码可读性和可维护性

**拆分示例**：
```
❌ 不好：一个 1500 行的大组件
ComprehensiveEntry.vue (1500 lines)

✅ 好：拆分为多个小组件
ComprehensiveEntry.vue (200 lines)
├── ResumeUploader.vue (100 lines)
├── BasicInfoForm.vue (150 lines)
├── SkillTagInput.vue (80 lines)
├── ExperienceEditor.vue (120 lines)
└── CompletionTracker.vue (100 lines)
```

### 组件通信

```typescript
// ✅ 推荐：Props Down, Events Up
// 父组件
<ChildComponent 
  :user="user" 
  @update="handleUpdate" 
/>

// 子组件
const props = defineProps<{ user: UserInfo }>()
const emit = defineEmits<{ (e: 'update', value: UserInfo): void }>()

// ✅ 推荐：跨层级使用 Provide/Inject
// 祖先组件
provide('theme', theme)

// 后代组件
const theme = inject<Ref<string>>('theme')

// ✅ 推荐：全局状态使用 Pinia
const userStore = useUserStore()

// ❌ 避免：直接修改 Props
const props = defineProps<{ user: UserInfo }>()
props.user.name = 'New Name' // ❌ 不要这样做
```

---

## 状态管理规范

### Pinia Store 结构

```typescript
// stores/user.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserInfo } from '@/types/models'
import { userApi } from '@/api/user'

export const useUserStore = defineStore('user', () => {
  // 1. State
  const userInfo = ref<UserInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // 2. Getters
  const isLoggedIn = computed(() => !!userInfo.value)
  const userName = computed(() => userInfo.value?.name ?? 'Guest')

  // 3. Actions
  const fetchUser = async (id: string) => {
    loading.value = true
    error.value = null
    
    try {
      userInfo.value = await userApi.getUser(id)
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  const updateUser = async (data: Partial<UserInfo>) => {
    if (!userInfo.value) return
    
    const updated = await userApi.updateUser(userInfo.value.id, data)
    userInfo.value = updated
  }

  const logout = () => {
    userInfo.value = null
    // 清理其他状态
  }

  // 4. Return
  return {
    // State
    userInfo,
    loading,
    error,
    
    // Getters
    isLoggedIn,
    userName,
    
    // Actions
    fetchUser,
    updateUser,
    logout
  }
})
```

### Store 使用规范

```typescript
// ✅ 推荐：在组件中使用
<script setup lang="ts">
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

// 直接访问
console.log(userStore.userName)

// 调用 action
await userStore.fetchUser('123')

// 响应式解构（使用 storeToRefs）
import { storeToRefs } from 'pinia'
const { userName, isLoggedIn } = storeToRefs(userStore)
</script>

// ❌ 避免：直接修改 state
userStore.userInfo = newUser // ❌ 应该通过 action
```

---

## API 开发规范

### 前端 API 封装

```typescript
// api/user.ts
import { apiClient } from './client'
import type { UserInfo, ApiResponse } from '@/types/api'

export const userApi = {
  // 获取用户信息
  getUser: (id: string) => 
    apiClient.get<UserInfo>(`/users/${id}`),
  
  // 更新用户信息
  updateUser: (id: string, data: Partial<UserInfo>) => 
    apiClient.put<UserInfo>(`/users/${id}`, data),
  
  // 删除用户
  deleteUser: (id: string) => 
    apiClient.delete(`/users/${id}`),
  
  // 用户列表
  listUsers: (params?: { page?: number; pageSize?: number }) => 
    apiClient.get<{ list: UserInfo[]; total: number }>('/users', { params })
}
```

### 后端 API 规范

#### 1. RESTful 设计

```
✅ 推荐：
GET    /api/v1/users           # 获取用户列表
GET    /api/v1/users/:id       # 获取单个用户
POST   /api/v1/users           # 创建用户
PUT    /api/v1/users/:id       # 更新用户（全量）
PATCH  /api/v1/users/:id       # 更新用户（部分）
DELETE /api/v1/users/:id       # 删除用户

❌ 避免：
GET    /api/v1/getUserList     # 不要在 URL 中使用动词
POST   /api/v1/user/delete     # DELETE 操作应该用 DELETE 方法
```

#### 2. 统一响应格式

```typescript
// 成功响应
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "123",
    "name": "John"
  },
  "timestamp": 1234567890
}

// 错误响应
{
  "code": 1001,
  "message": "用户不存在",
  "data": null,
  "timestamp": 1234567890,
  "traceId": "abc-123-def"
}

// 列表响应
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20
  },
  "timestamp": 1234567890
}
```

#### 3. 错误码规范

```typescript
enum ErrorCode {
  // 系统级错误码（0-999）
  SUCCESS = 0,
  INVALID_PARAMS = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  SERVER_ERROR = 500,
  
  // 业务级错误码（1000+）
  USER_NOT_FOUND = 1001,
  USER_ALREADY_EXISTS = 1002,
  ENTRY_INCOMPLETE = 1003,
  MBTI_NOT_COMPLETED = 1004,
  RESUME_PARSE_FAILED = 1005,
  JOB_NOT_FOUND = 1006,
  CAPABILITY_GENERATION_FAILED = 1007
}
```

---

## 样式规范

### Clay 设计系统

```css
/* ✅ 推荐：使用 CSS 变量 */
.card {
  /* 颜色 */
  color: var(--clay-text);
  background: var(--clay-surface);
  border-color: var(--clay-border);
  
  /* 圆角 */
  border-radius: var(--clay-radius-card);
  
  /* 阴影 */
  box-shadow: var(--clay-shadow);
  
  /* 间距（使用 Tailwind 或自定义） */
  padding: 24px;
  margin-bottom: 16px;
}

.card:hover {
  box-shadow: var(--clay-shadow-hard);
  transform: translateY(-2px);
}

/* ❌ 避免：硬编码颜色和样式 */
.card {
  color: #333; /* ❌ */
  background: #fff; /* ❌ */
  border-radius: 8px; /* ❌ */
}
```

### BEM 命名

```css
/* ✅ 推荐：BEM 命名 */
.user-card { }                    /* Block */
.user-card__header { }            /* Element */
.user-card__title { }             /* Element */
.user-card__avatar { }            /* Element */
.user-card--active { }            /* Modifier */
.user-card--disabled { }          /* Modifier */

/* ❌ 避免：嵌套过深 */
.user-card .header .title .text { } /* ❌ */
```

### 响应式设计

```css
/* ✅ 推荐：移动优先 */
.container {
  padding: 16px;
}

@media (min-width: 768px) {
  .container {
    padding: 24px;
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 32px;
  }
}

/* 使用标准断点 */
/* Mobile: < 768px */
/* Tablet: 768px - 1024px */
/* Desktop: > 1024px */
```

---

## 测试规范

### 单元测试

```typescript
// tests/unit/composables/useFormValidation.spec.ts
import { describe, it, expect } from 'vitest'
import { useFormValidation } from '@/composables/useFormValidation'

describe('useFormValidation', () => {
  it('should validate email correctly', () => {
    const { validateEmail } = useFormValidation()
    
    expect(validateEmail('test@example.com')).toBe(true)
    expect(validateEmail('invalid-email')).toBe(false)
    expect(validateEmail('')).toBe(false)
  })
  
  it('should validate required fields', () => {
    const { validateRequired } = useFormValidation()
    
    expect(validateRequired('value')).toBe(true)
    expect(validateRequired('')).toBe(false)
    expect(validateRequired(null)).toBe(false)
  })
})
```

### 组件测试

```typescript
// tests/unit/components/UserCard.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserCard from '@/components/UserCard.vue'

describe('UserCard', () => {
  it('should render user name', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: {
          id: '1',
          name: 'John Doe',
          email: 'john@example.com'
        }
      }
    })
    
    expect(wrapper.text()).toContain('John Doe')
  })
  
  it('should emit update event on edit', async () => {
    const wrapper = mount(UserCard, {
      props: { user: { id: '1', name: 'John' } }
    })
    
    await wrapper.find('.edit-btn').trigger('click')
    
    expect(wrapper.emitted('update')).toBeTruthy()
  })
})
```

### E2E 测试

```typescript
// tests/e2e/entry-flow.spec.ts
import { test, expect } from '@playwright/test'

test('complete entry flow', async ({ page }) => {
  // 1. 访问页面
  await page.goto('/entry/comprehensive')
  
  // 2. 填写表单
  await page.fill('[name="name"]', '张三')
  await page.fill('[name="email"]', 'zhangsan@example.com')
  await page.selectOption('[name="grade"]', '大三')
  
  // 3. 提交
  await page.click('button:has-text("提交综合分析")')
  
  // 4. 验证跳转
  await expect(page).toHaveURL('/capability-profile')
  
  // 5. 验证提示
  await expect(page.locator('.el-message')).toContainText('提交成功')
})
```

---

## Git 提交规范

### Commit Message 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

```
feat:     新功能
fix:      Bug 修复
docs:     文档更新
style:    代码格式（不影响功能）
refactor: 重构（不是新功能也不是修复）
perf:     性能优化
test:     测试相关
chore:    构建/工具链相关
revert:   回滚
```

### 示例

```bash
# ✅ 推荐
feat(entry): 添加简历上传功能

- 支持 PDF/Word 格式
- 自动解析基础信息
- 添加上传进度提示

Closes #123

# ✅ 推荐
fix(job): 修复岗位筛选薪资范围错误

修复了薪资筛选时无法正确过滤的问题

# ❌ 避免
update code  # 太模糊
fix bug      # 没有说明修复了什么
```

### 分支命名

```bash
# 功能分支
feature/resume-upload
feature/mbti-assessment

# 修复分支
fix/job-filter-bug
fix/api-error-handling

# 重构分支
refactor/entry-component
refactor/api-layer

# 发布分支
release/v2.0.0
```

---

## 文档规范

### 组件文档

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
 *   :show-avatar="true"
 *   @update="handleUpdate"
 *   @delete="handleDelete"
 * />
 * ```
 */
```

### 函数文档

```typescript
/**
 * 格式化日期
 * 
 * @param date - 日期对象
 * @param format - 格式字符串，默认 'YYYY-MM-DD'
 * @returns 格式化后的日期字符串
 * 
 * @example
 * ```ts
 * formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
 * // => '2026-05-10 14:30:00'
 * ```
 */
export function formatDate(date: Date, format = 'YYYY-MM-DD'): string {
  // ...
}
```

### API 文档

```typescript
/**
 * 用户 API
 */
export const userApi = {
  /**
   * 获取用户信息
   * 
   * @param id - 用户 ID
   * @returns 用户信息
   * 
   * @throws {ApiError} 用户不存在时抛出错误
   */
  getUser: (id: string) => apiClient.get<UserInfo>(`/users/${id}`)
}
```

---

## 🔍 代码审查清单

### 提交前自查

- [ ] 代码符合 ESLint 规范
- [ ] 代码已格式化（Prettier）
- [ ] 类型定义完整，无 `any`
- [ ] 组件拆分合理，单文件 < 500 行
- [ ] 使用 Clay 设计系统变量
- [ ] 添加必要的注释和文档
- [ ] 编写单元测试
- [ ] 手动测试功能正常
- [ ] 检查控制台无错误
- [ ] Commit Message 符合规范

### Code Review 关注点

- [ ] 代码逻辑正确
- [ ] 性能无明显问题
- [ ] 无安全漏洞（XSS、SQL 注入等）
- [ ] 错误处理完善
- [ ] 边界情况考虑周全
- [ ] 代码可读性好
- [ ] 符合项目规范
- [ ] 测试覆盖充分

---

## 📚 参考资源

- [Vue 3 官方文档](https://vuejs.org/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)
- [Pinia 官方文档](https://pinia.vuejs.org/)
- [Element Plus 官方文档](https://element-plus.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [Vitest 官方文档](https://vitest.dev/)
- [Playwright 官方文档](https://playwright.dev/)

---

**维护者**：开发团队  
**创建时间**：2026-05-10  
**最后更新**：2026-05-10  
**版本**：v1.0.0
