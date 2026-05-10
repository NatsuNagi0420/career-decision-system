# 职业规划平台 - 测试指南

> **版本**：v2.0.0  
> **测试框架**：Vitest + Vue Test Utils + Playwright  
> **最后更新**：2026-05-10

---

## 📋 目录

1. [测试策略](#测试策略)
2. [测试环境配置](#测试环境配置)
3. [单元测试](#单元测试)
4. [组件测试](#组件测试)
5. [集成测试](#集成测试)
6. [E2E 测试](#e2e-测试)
7. [测试覆盖率](#测试覆盖率)
8. [测试最佳实践](#测试最佳实践)

---

## 测试策略

### 测试金字塔

```
        /\
       /  \
      / E2E \          10% - 端到端测试
     /______\
    /        \
   /  集成测试 \        20% - 集成测试
  /____________\
 /              \
/    单元测试     \      70% - 单元测试
/________________\
```

### 测试覆盖目标

| 类型 | 覆盖率目标 | 说明 |
|------|-----------|------|
| 单元测试 | 80% | 工具函数、Composables、Store |
| 组件测试 | 70% | UI 组件、业务组件 |
| 集成测试 | 60% | API 调用、数据流 |
| E2E 测试 | 核心流程 | 关键用户路径 |

---

## 测试环境配置

### 安装依赖

```bash
# 测试框架
npm install -D vitest @vitest/ui

# Vue 测试工具
npm install -D @vue/test-utils

# E2E 测试
npm install -D @playwright/test

# 测试覆盖率
npm install -D @vitest/coverage-v8

# Mock 工具
npm install -D msw
```

### Vitest 配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
```

### 测试设置文件

```typescript
// tests/setup.ts
import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// 全局 Mock
vi.mock('@/utils/request', () => ({
  default: vi.fn()
}))

// Vue Test Utils 全局配置
config.global.mocks = {
  $t: (key: string) => key  // i18n mock
}

// Element Plus 组件 stub
config.global.stubs = {
  'el-button': true,
  'el-input': true
}
```

### Playwright 配置

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI
  }
})
```

---

## 单元测试

### 测试工具函数

```typescript
// tests/unit/utils/format.spec.ts
import { describe, it, expect } from 'vitest'
import { formatDate, formatCurrency } from '@/utils/format'

describe('formatDate', () => {
  it('should format date correctly', () => {
    const date = new Date('2026-05-10T12:00:00')
    expect(formatDate(date, 'YYYY-MM-DD')).toBe('2026-05-10')
    expect(formatDate(date, 'YYYY/MM/DD')).toBe('2026/05/10')
  })

  it('should handle invalid date', () => {
    expect(formatDate(new Date('invalid'))).toBe('')
  })
})

describe('formatCurrency', () => {
  it('should format currency correctly', () => {
    expect(formatCurrency(1000)).toBe('¥1,000')
    expect(formatCurrency(1234.56)).toBe('¥1,234.56')
  })

  it('should handle zero', () => {
    expect(formatCurrency(0)).toBe('¥0')
  })

  it('should handle negative numbers', () => {
    expect(formatCurrency(-100)).toBe('-¥100')
  })
})
```

### 测试 Composables

```typescript
// tests/unit/composables/useFormValidation.spec.ts
import { describe, it, expect } from 'vitest'
import { useFormValidation } from '@/composables/useFormValidation'

describe('useFormValidation', () => {
  const { validateEmail, validatePhone, validateRequired } = useFormValidation()

  describe('validateEmail', () => {
    it('should validate correct email', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user.name+tag@example.co.uk')).toBe(true)
    })

    it('should reject invalid email', () => {
      expect(validateEmail('invalid')).toBe(false)
      expect(validateEmail('test@')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('')).toBe(false)
    })
  })

  describe('validatePhone', () => {
    it('should validate correct phone', () => {
      expect(validatePhone('13800138000')).toBe(true)
      expect(validatePhone('15912345678')).toBe(true)
    })

    it('should reject invalid phone', () => {
      expect(validatePhone('12345678901')).toBe(false)
      expect(validatePhone('1380013800')).toBe(false)
      expect(validatePhone('abc')).toBe(false)
    })
  })

  describe('validateRequired', () => {
    it('should validate non-empty values', () => {
      expect(validateRequired('value')).toBe(true)
      expect(validateRequired('0')).toBe(true)
    })

    it('should reject empty values', () => {
      expect(validateRequired('')).toBe(false)
      expect(validateRequired('   ')).toBe(false)
      expect(validateRequired(null)).toBe(false)
      expect(validateRequired(undefined)).toBe(false)
    })
  })
})
```

### 测试 Pinia Store

```typescript
// tests/unit/stores/user.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { userApi } from '@/api/user'

// Mock API
vi.mock('@/api/user', () => ({
  userApi: {
    getUser: vi.fn(),
    updateUser: vi.fn()
  }
}))

describe('useUserStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('should initialize with default state', () => {
    const store = useUserStore()
    
    expect(store.userInfo).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })

  it('should fetch user successfully', async () => {
    const mockUser = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com'
    }
    
    vi.mocked(userApi.getUser).mockResolvedValue(mockUser)
    
    const store = useUserStore()
    await store.fetchUser('1')
    
    expect(store.userInfo).toEqual(mockUser)
    expect(store.loading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.isLoggedIn).toBe(true)
  })

  it('should handle fetch error', async () => {
    const mockError = new Error('Network error')
    vi.mocked(userApi.getUser).mockRejectedValue(mockError)
    
    const store = useUserStore()
    
    await expect(store.fetchUser('1')).rejects.toThrow('Network error')
    expect(store.userInfo).toBeNull()
    expect(store.loading).toBe(false)
    expect(store.error).toBe('Network error')
  })

  it('should update user successfully', async () => {
    const store = useUserStore()
    store.userInfo = {
      id: '1',
      name: 'John',
      email: 'john@example.com'
    }
    
    const updatedUser = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com'
    }
    
    vi.mocked(userApi.updateUser).mockResolvedValue(updatedUser)
    
    await store.updateUser({ name: 'John Doe' })
    
    expect(store.userInfo).toEqual(updatedUser)
  })

  it('should logout correctly', () => {
    const store = useUserStore()
    store.userInfo = {
      id: '1',
      name: 'John',
      email: 'john@example.com'
    }
    
    store.logout()
    
    expect(store.userInfo).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })
})
```

---

## 组件测试

### 测试简单组件

```typescript
// tests/unit/components/UserCard.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import UserCard from '@/components/UserCard.vue'

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    avatar: 'https://example.com/avatar.jpg'
  }

  it('should render user information', () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser }
    })
    
    expect(wrapper.text()).toContain('John Doe')
    expect(wrapper.text()).toContain('john@example.com')
  })

  it('should render avatar when showAvatar is true', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: mockUser,
        showAvatar: true
      }
    })
    
    const avatar = wrapper.find('img')
    expect(avatar.exists()).toBe(true)
    expect(avatar.attributes('src')).toBe(mockUser.avatar)
  })

  it('should not render avatar when showAvatar is false', () => {
    const wrapper = mount(UserCard, {
      props: {
        user: mockUser,
        showAvatar: false
      }
    })
    
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('should emit update event on edit button click', async () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser }
    })
    
    await wrapper.find('.edit-btn').trigger('click')
    
    expect(wrapper.emitted('update')).toBeTruthy()
    expect(wrapper.emitted('update')?.[0]).toEqual([mockUser])
  })

  it('should emit delete event on delete button click', async () => {
    const wrapper = mount(UserCard, {
      props: { user: mockUser }
    })
    
    await wrapper.find('.delete-btn').trigger('click')
    
    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')?.[0]).toEqual([mockUser.id])
  })
})
```

### 测试表单组件

```typescript
// tests/unit/components/DynamicList.spec.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DynamicList from '@/components/form/DynamicList.vue'

describe('DynamicList', () => {
  it('should render items', () => {
    const wrapper = mount(DynamicList, {
      props: {
        modelValue: ['Item 1', 'Item 2', 'Item 3']
      }
    })
    
    const items = wrapper.findAll('.list-item')
    expect(items).toHaveLength(3)
  })

  it('should add item when add button clicked', async () => {
    const wrapper = mount(DynamicList, {
      props: {
        modelValue: [],
        defaultItem: 'New Item'
      }
    })
    
    await wrapper.find('.add-btn').trigger('click')
    
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['New Item']])
  })

  it('should remove item when remove button clicked', async () => {
    const wrapper = mount(DynamicList, {
      props: {
        modelValue: ['Item 1', 'Item 2']
      }
    })
    
    const removeButtons = wrapper.findAll('.remove-btn')
    await removeButtons[0].trigger('click')
    
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['Item 2']])
  })

  it('should not add item when max items reached', async () => {
    const wrapper = mount(DynamicList, {
      props: {
        modelValue: ['Item 1', 'Item 2'],
        maxItems: 2
      }
    })
    
    await wrapper.find('.add-btn').trigger('click')
    
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
  })
})
```

### 测试异步组件

```typescript
// tests/unit/components/JobList.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import JobList from '@/components/JobList.vue'
import { jobApi } from '@/api/job'

vi.mock('@/api/job', () => ({
  jobApi: {
    list: vi.fn()
  }
}))

describe('JobList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should show loading state', () => {
    vi.mocked(jobApi.list).mockImplementation(() => new Promise(() => {}))
    
    const wrapper = mount(JobList)
    
    expect(wrapper.find('.loading').exists()).toBe(true)
  })

  it('should render jobs after loading', async () => {
    const mockJobs = [
      { id: 1, jobName: 'Frontend Developer', companyName: 'Company A' },
      { id: 2, jobName: 'Backend Developer', companyName: 'Company B' }
    ]
    
    vi.mocked(jobApi.list).mockResolvedValue({
      list: mockJobs,
      total: 2
    })
    
    const wrapper = mount(JobList)
    await flushPromises()
    
    expect(wrapper.find('.loading').exists()).toBe(false)
    expect(wrapper.findAll('.job-card')).toHaveLength(2)
    expect(wrapper.text()).toContain('Frontend Developer')
    expect(wrapper.text()).toContain('Backend Developer')
  })

  it('should show error message on failure', async () => {
    vi.mocked(jobApi.list).mockRejectedValue(new Error('Network error'))
    
    const wrapper = mount(JobList)
    await flushPromises()
    
    expect(wrapper.find('.error').exists()).toBe(true)
    expect(wrapper.text()).toContain('Network error')
  })
})
```

---

## 集成测试

### 测试 API 集成

```typescript
// tests/integration/api/entry.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import { entryApi } from '@/api/entry'

const server = setupServer(
  http.post('/api/v1/entry/submit', () => {
    return HttpResponse.json({
      code: 0,
      message: 'success',
      data: {
        id: '123',
        userId: '1',
        status: 'submitted',
        completionRate: 85
      }
    })
  })
)

beforeAll(() => server.listen())
afterAll(() => server.close())

describe('Entry API Integration', () => {
  it('should submit entry successfully', async () => {
    const entryData = {
      basic: {
        name: '张三',
        email: 'zhangsan@example.com'
      },
      target: {
        role: 'Frontend Developer',
        jobType: 'fulltime' as const,
        cities: ['深圳']
      },
      skills: ['Vue', 'React'],
      certificates: [],
      experiences: [],
      values: [5, 5, 5],
      links: {},
      questionnaireAnswers: {}
    }
    
    const result = await entryApi.submit(entryData)
    
    expect(result.id).toBe('123')
    expect(result.status).toBe('submitted')
    expect(result.completionRate).toBe(85)
  })
})
```

---

## E2E 测试

### 测试核心流程

```typescript
// tests/e2e/entry-flow.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Entry Flow', () => {
  test('complete entry flow', async ({ page }) => {
    // 1. 访问登录页
    await page.goto('/login')
    
    // 2. 登录
    await page.fill('[name="username"]', 'testuser')
    await page.fill('[name="password"]', 'password123')
    await page.click('button:has-text("登录")')
    
    // 3. 等待跳转到首页
    await expect(page).toHaveURL('/')
    
    // 4. 进入信息录入页
    await page.click('text=开始规划')
    await expect(page).toHaveURL('/entry/comprehensive')
    
    // 5. 填写基础信息
    await page.fill('[name="name"]', '张三')
    await page.fill('[name="email"]', 'zhangsan@example.com')
    await page.selectOption('[name="grade"]', '大三')
    
    // 6. 填写求职目标
    await page.fill('[name="role"]', 'Frontend Developer')
    await page.selectOption('[name="jobType"]', '全职')
    
    // 7. 提交
    await page.click('button:has-text("提交综合分析")')
    
    // 8. 验证跳转
    await expect(page).toHaveURL('/capability-profile')
    
    // 9. 验证成功提示
    await expect(page.locator('.el-message--success')).toBeVisible()
  })

  test('should show validation errors', async ({ page }) => {
    await page.goto('/entry/comprehensive')
    
    // 不填写必填字段直接提交
    await page.click('button:has-text("提交综合分析")')
    
    // 验证错误提示
    await expect(page.locator('.el-message--warning')).toBeVisible()
    await expect(page.locator('.el-message--warning')).toContainText('请至少填写')
  })
})
```

### 测试岗位探索流程

```typescript
// tests/e2e/job-exploration.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Job Exploration', () => {
  test.beforeEach(async ({ page }) => {
    // 登录
    await page.goto('/login')
    await page.fill('[name="username"]', 'testuser')
    await page.fill('[name="password"]', 'password123')
    await page.click('button:has-text("登录")')
    await expect(page).toHaveURL('/')
  })

  test('should filter jobs by city', async ({ page }) => {
    await page.goto('/job-exploration')
    
    // 选择城市筛选
    await page.click('.filter-city')
    await page.click('text=深圳')
    
    // 等待加载
    await page.waitForSelector('.job-card')
    
    // 验证结果
    const jobCards = page.locator('.job-card')
    await expect(jobCards.first()).toBeVisible()
    await expect(jobCards.first()).toContainText('深圳')
  })

  test('should search jobs by keyword', async ({ page }) => {
    await page.goto('/job-exploration')
    
    // 输入关键词
    await page.fill('[placeholder*="关键词"]', 'Frontend')
    await page.press('[placeholder*="关键词"]', 'Enter')
    
    // 等待加载
    await page.waitForSelector('.job-card')
    
    // 验证结果
    const jobCards = page.locator('.job-card')
    await expect(jobCards.first()).toContainText('Frontend')
  })

  test('should view job detail', async ({ page }) => {
    await page.goto('/job-exploration')
    
    // 点击岗位卡片
    await page.click('.job-card:first-child')
    
    // 验证详情面板显示
    await expect(page.locator('.job-detail')).toBeVisible()
    await expect(page.locator('.job-detail .job-title')).toBeVisible()
  })

  test('should set target job', async ({ page }) => {
    await page.goto('/job-exploration')
    
    // 点击"设为目标"按钮
    await page.click('.job-card:first-child .target-btn')
    
    // 验证成功提示
    await expect(page.locator('.el-message--success')).toBeVisible()
    await expect(page.locator('.el-message--success')).toContainText('已设为目标岗位')
  })
})
```

---

## 测试覆盖率

### 运行覆盖率测试

```bash
# 运行所有测试并生成覆盖率报告
npm run test:coverage

# 查看覆盖率报告
open coverage/index.html
```

### 覆盖率配置

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/types.ts',
        '**/index.ts',
        '**/*.d.ts'
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
})
```

### 覆盖率报告解读

```
File                | % Stmts | % Branch | % Funcs | % Lines
--------------------|---------|----------|---------|--------
All files           |   75.23 |    68.45 |   72.11 |   75.89
 src/utils          |   85.67 |    78.23 |   82.45 |   86.12
  format.ts         |   92.31 |    85.71 |   90.00 |   93.75
  validation.ts     |   78.95 |    70.00 |   75.00 |   80.00
 src/composables    |   72.45 |    65.89 |   70.23 |   73.12
  useApiRequest.ts  |   80.00 |    75.00 |   77.78 |   81.25
```

---

## 测试最佳实践

### 1. AAA 模式（Arrange-Act-Assert）

```typescript
it('should calculate total correctly', () => {
  // Arrange - 准备测试数据
  const items = [
    { price: 10, quantity: 2 },
    { price: 20, quantity: 1 }
  ]
  
  // Act - 执行操作
  const total = calculateTotal(items)
  
  // Assert - 验证结果
  expect(total).toBe(40)
})
```

### 2. 测试命名规范

```typescript
// ✅ 好的命名：清晰描述测试内容
it('should return empty array when input is null')
it('should throw error when email is invalid')
it('should emit update event when form is submitted')

// ❌ 不好的命名：模糊不清
it('test1')
it('works')
it('should work correctly')
```

### 3. 一个测试只验证一件事

```typescript
// ✅ 好的做法：分开测试
it('should validate email format', () => {
  expect(validateEmail('test@example.com')).toBe(true)
})

it('should reject invalid email', () => {
  expect(validateEmail('invalid')).toBe(false)
})

// ❌ 不好的做法：一个测试验证多件事
it('should validate email', () => {
  expect(validateEmail('test@example.com')).toBe(true)
  expect(validateEmail('invalid')).toBe(false)
  expect(validateEmail('')).toBe(false)
  expect(validatePhone('13800138000')).toBe(true)  // 混入了其他验证
})
```

### 4. 使用 describe 分组

```typescript
describe('UserCard', () => {
  describe('rendering', () => {
    it('should render user name')
    it('should render user email')
    it('should render avatar when showAvatar is true')
  })

  describe('events', () => {
    it('should emit update event on edit')
    it('should emit delete event on delete')
  })

  describe('edge cases', () => {
    it('should handle null user')
    it('should handle missing avatar')
  })
})
```

### 5. 避免测试实现细节

```typescript
// ❌ 不好：测试实现细节
it('should call fetchUser method', () => {
  const spy = vi.spyOn(component, 'fetchUser')
  component.mounted()
  expect(spy).toHaveBeenCalled()
})

// ✅ 好：测试行为和结果
it('should load user data on mount', async () => {
  const wrapper = mount(UserCard, {
    props: { userId: '1' }
  })
  await flushPromises()
  
  expect(wrapper.text()).toContain('John Doe')
})
```

### 6. 使用测试工具函数

```typescript
// tests/utils/helpers.ts
export function createMockUser(overrides = {}) {
  return {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    ...overrides
  }
}

export function mountWithStore(component, options = {}) {
  const pinia = createPinia()
  return mount(component, {
    global: {
      plugins: [pinia]
    },
    ...options
  })
}

// 使用
it('should render user', () => {
  const user = createMockUser({ name: 'Jane' })
  const wrapper = mountWithStore(UserCard, {
    props: { user }
  })
  expect(wrapper.text()).toContain('Jane')
})
```

---

## 测试检查清单

### 提交前检查

- [ ] 所有测试通过
- [ ] 测试覆盖率达标（>70%）
- [ ] 无跳过的测试（`it.skip`）
- [ ] 无仅运行的测试（`it.only`）
- [ ] 测试命名清晰
- [ ] 测试独立，无依赖顺序
- [ ] Mock 数据合理
- [ ] 异步测试正确处理

### Code Review 检查

- [ ] 测试覆盖核心功能
- [ ] 测试覆盖边界情况
- [ ] 测试覆盖错误场景
- [ ] 测试易于理解和维护
- [ ] 无冗余测试
- [ ] 测试性能良好

---

**维护者**：测试团队  
**创建时间**：2026-05-10  
**最后更新**：2026-05-10  
**版本**：v1.0.0
