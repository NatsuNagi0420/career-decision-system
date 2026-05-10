# 职业规划平台 - API 接口规范

> **版本**：v2.0.0  
> **Base URL**：`https://api.career-platform.com/api/v1`  
> **最后更新**：2026-05-10

---

## 📋 目录

1. [通用规范](#通用规范)
2. [认证授权](#认证授权)
3. [用户模块](#用户模块)
4. [信息录入模块](#信息录入模块)
5. [测评模块](#测评模块)
6. [岗位模块](#岗位模块)
7. [能力画像模块](#能力画像模块)
8. [路径规划模块](#路径规划模块)
9. [报告模块](#报告模块)
10. [错误码](#错误码)

---

## 通用规范

### 请求规范

#### 请求头

```http
Content-Type: application/json
Authorization: Bearer <token>
X-Request-ID: <uuid>
```

#### 请求参数

- **Path 参数**：用于资源标识，如 `/users/:id`
- **Query 参数**：用于筛选、分页、排序
- **Body 参数**：用于创建、更新资源

### 响应规范

#### 统一响应格式

```typescript
interface ApiResponse<T = any> {
  code: number        // 业务状态码，0 表示成功
  message: string     // 提示信息
  data: T            // 业务数据
  timestamp: number   // 时间戳（毫秒）
  traceId?: string   // 追踪 ID（用于问题排查）
}
```

#### 成功响应示例

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "123",
    "name": "张三"
  },
  "timestamp": 1715328000000
}
```

#### 错误响应示例

```json
{
  "code": 1001,
  "message": "用户不存在",
  "data": null,
  "timestamp": 1715328000000,
  "traceId": "abc-123-def-456"
}
```

#### 列表响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [...],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  },
  "timestamp": 1715328000000
}
```

### 分页参数

```typescript
interface PaginationParams {
  page?: number      // 页码，从 1 开始，默认 1
  pageSize?: number  // 每页数量，默认 20，最大 100
}
```

### HTTP 状态码

| 状态码 | 说明 | 使用场景 |
|--------|------|----------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 204 | No Content | 删除成功 |
| 400 | Bad Request | 参数错误 |
| 401 | Unauthorized | 未认证 |
| 403 | Forbidden | 无权限 |
| 404 | Not Found | 资源不存在 |
| 500 | Internal Server Error | 服务器错误 |

---

## 认证授权

### 登录

**接口**：`POST /auth/login`

**请求参数**：
```typescript
interface LoginRequest {
  username: string  // 用户名
  password: string  // 密码
}
```

**响应数据**：
```typescript
interface LoginResponse {
  token: string           // JWT Token
  refreshToken: string    // 刷新 Token
  expiresIn: number      // 过期时间（秒）
  user: {
    id: string
    username: string
    email: string
    avatar?: string
  }
}
```

**示例**：
```bash
curl -X POST https://api.career-platform.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "zhangsan",
    "password": "password123"
  }'
```

### 刷新 Token

**接口**：`POST /auth/refresh`

**请求参数**：
```typescript
interface RefreshTokenRequest {
  refreshToken: string
}
```

**响应数据**：
```typescript
interface RefreshTokenResponse {
  token: string
  expiresIn: number
}
```

### 登出

**接口**：`POST /auth/logout`

**请求头**：需要 Authorization

**响应**：204 No Content

---

## 用户模块

### 获取当前用户信息

**接口**：`GET /users/me`

**请求头**：需要 Authorization

**响应数据**：
```typescript
interface UserInfo {
  id: string
  username: string
  email: string
  avatar?: string
  phone?: string
  createdAt: string
  updatedAt: string
}
```

### 更新用户信息

**接口**：`PUT /users/me`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface UpdateUserRequest {
  username?: string
  email?: string
  avatar?: string
  phone?: string
}
```

**响应数据**：`UserInfo`

---

## 信息录入模块

### 提交信息录入

**接口**：`POST /entry/submit`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface EntrySubmitRequest {
  basic: {
    name: string          // 必填
    email: string         // 必填
    school?: string
    major?: string
    grade?: string        // 大一/大二/大三/大四/研一/研二/研三/已毕业
    city?: string
  }
  target: {
    role: string          // 必填：目标岗位
    jobType: 'intern' | 'fulltime' | 'flexible'  // 必填
    cities: string[]      // 必填：意向城市
    salary?: string
    availableAt?: string
    avoid?: string
  }
  skills: string[]
  certificates: string[]
  experiences: Array<{
    title: string
    desc: string
  }>
  values: number[]        // 长度为 3，每个值 0-10
  mbtiResult?: string     // MBTI 类型，如 INFP
  links: {
    github?: string
    portfolio?: string
  }
  questionnaireAnswers: Record<string, any>
}
```

**响应数据**：
```typescript
interface EntrySubmitResponse {
  id: string
  userId: string
  status: 'draft' | 'submitted'
  completionRate: number  // 完成度 0-100
  createdAt: string
  updatedAt: string
}
```

### 获取信息录入草稿

**接口**：`GET /entry/draft`

**请求头**：需要 Authorization

**响应数据**：`EntrySubmitRequest` 或 `null`

### 保存信息录入草稿

**接口**：`POST /entry/draft`

**请求头**：需要 Authorization

**请求参数**：`EntrySubmitRequest`（部分字段可选）

**响应**：204 No Content

### 简历解析

**接口**：`POST /resume/parse`

**请求头**：
```http
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**请求参数**：
```typescript
FormData {
  file: File  // PDF 或 Word 文件
}
```

**响应数据**：
```typescript
interface ResumeParseResult {
  basic?: {
    name?: string
    email?: string
    phone?: string
    school?: string
    major?: string
    gender?: string
    age?: number
  }
  target?: {
    intentionPosition?: string
    intentionCities?: string[]
    expectedSalary?: string
    jobType?: string
  }
  skills?: string[]
  certificates?: string[]
  educations?: Array<{
    text: string
  }>
  workExperiences?: Array<{
    title: string
    description: string
  }>
  skillCertificates?: string[]
}
```

---

## 测评模块

### 获取 MBTI 题库

**接口**：`GET /mbti/questions`

**请求头**：需要 Authorization

**响应数据**：
```typescript
interface MbtiQuestion {
  id: number
  qType: string         // 题目类型，如 "外向-内向"
  content: string       // 题目内容
  options: Array<{
    id: number
    optCode: string     // 选项代码，如 "A" 或 "B"
    optContent: string  // 选项内容
  }>
}

type MbtiQuestionsResponse = MbtiQuestion[]
```

### 提交 MBTI 答案

**接口**：`POST /mbti/submit`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface MbtiSubmitRequest {
  answers: Record<number, string>  // { questionId: optCode }
}
```

**响应数据**：
```typescript
type MbtiSubmitResponse = string  // MBTI 类型，如 "INFP"
```

### 获取 MBTI 结果

**接口**：`GET /mbti/result`

**请求头**：需要 Authorization

**响应数据**：
```typescript
interface MbtiResult {
  type: string          // MBTI 类型
  description: string   // 类型描述
  strengths: string[]   // 优势
  weaknesses: string[]  // 劣势
  suitableJobs: string[] // 适合的岗位
  createdAt: string
}
```

---

## 岗位模块

### 获取岗位列表

**接口**：`GET /jobs`

**请求参数**：
```typescript
interface JobQueryParams extends PaginationParams {
  keyword?: string        // 关键词搜索
  locations?: string[]    // 城市筛选（多选）
  industry?: string       // 行业筛选
  companySize?: string    // 公司规模
  companyType?: string    // 公司类型
  salaryMin?: number      // 最低薪资（k）
  salaryMax?: number      // 最高薪资（k）
}
```

**响应数据**：
```typescript
interface JobListResponse {
  list: JobInfo[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface JobInfo {
  id: number
  jobName: string
  companyName: string
  location: string
  salaryRange: string
  industry?: string
  companySize?: string
  companyType?: string
  jobSourceUrl?: string
  createdAt: string
  updatedAt: string
}
```

### 获取岗位详情

**接口**：`GET /jobs/:id`

**响应数据**：
```typescript
interface JobDetail extends JobInfo {
  jobDetails: string      // 岗位描述
  requirements: string[]  // 岗位要求
  benefits: string[]      // 福利待遇
  companyInfo?: string    // 公司介绍
}
```

### 获取筛选项（Facets）

**接口**：`GET /jobs/facets`

**响应数据**：
```typescript
interface JobFacets {
  locations: string[]      // 可选城市列表
  industries: string[]     // 可选行业列表
  companySizes: string[]   // 可选公司规模列表
  companyTypes: string[]   // 可选公司类型列表
}
```

### AI 岗位推荐

**接口**：`POST /jobs/recommend`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface JobRecommendRequest {
  entry?: EntrySubmitRequest      // 信息录入数据
  capabilityProfile?: any         // 能力画像数据
  preferredJobIds?: number[]      // 偏好岗位 ID
  locations?: string[]            // 意向城市
  limit?: number                  // 推荐数量，默认 6
}
```

**响应数据**：
```typescript
interface JobRecommendResponse {
  jobs: JobInfo[]
  reason?: string  // 推荐理由
}
```

---

## 能力画像模块

### 生成能力画像

**接口**：`POST /capability/generate`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface CapabilityGenerateRequest {
  entryId?: string        // 信息录入 ID（可选，不传则使用最新）
  forceRegenerate?: boolean  // 是否强制重新生成
}
```

**响应数据**：
```typescript
interface CapabilityProfile {
  id: string
  userId: string
  mbtiType: string
  hollandCode: string       // 霍兰德代码，如 "RIA"
  coreStrengths: string[]   // 核心优势
  improvementAreas: string[] // 待提升领域
  skillRadar: {             // 技能雷达图数据
    technical: number       // 技术能力 0-100
    communication: number   // 沟通能力
    leadership: number      // 领导力
    creativity: number      // 创造力
    analytical: number      // 分析能力
    execution: number       // 执行力
  }
  recommendedJobs: Array<{
    id: number
    jobName: string
    matchRate: number       // 匹配度 0-100
    reason: string          // 推荐理由
  }>
  careerSuggestions: string  // 职业建议
  generatedAt: string
}
```

### 获取能力画像

**接口**：`GET /capability`

**请求头**：需要 Authorization

**响应数据**：`CapabilityProfile` 或 `null`

---

## 路径规划模块

### 生成路径规划

**接口**：`POST /path/generate`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface PathGenerateRequest {
  targetJobId: number       // 目标岗位 ID
  capabilityProfileId?: string  // 能力画像 ID（可选）
  timeframe?: string        // 时间框架，如 "3个月" "半年"
}
```

**响应数据**：
```typescript
interface PathPlan {
  id: string
  userId: string
  targetJobId: number
  targetJob: JobInfo
  currentLevel: number      // 当前水平 0-100
  targetLevel: number       // 目标水平 0-100
  gap: {
    skills: string[]        // 技能差距
    experience: string[]    // 经验差距
    certificates: string[]  // 证书差距
  }
  stages: PlanStage[]
  estimatedDuration: string // 预计时长
  generatedAt: string
}

interface PlanStage {
  id: string
  name: string              // 阶段名称
  duration: string          // 阶段时长
  tasks: PlanTask[]
  order: number             // 阶段顺序
}

interface PlanTask {
  id: string
  title: string
  description: string
  type: 'skill' | 'project' | 'certificate' | 'reading'
  priority: 'high' | 'medium' | 'low'
  estimatedHours: number
  resources: string[]       // 学习资源链接
  done: boolean
  completedAt?: string
}
```

### 获取路径规划

**接口**：`GET /path`

**请求头**：需要 Authorization

**响应数据**：`PathPlan` 或 `null`

### 更新任务状态

**接口**：`PATCH /path/tasks/:taskId`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface UpdateTaskRequest {
  done: boolean
}
```

**响应数据**：
```typescript
interface UpdateTaskResponse {
  task: PlanTask
  stageProgress: number     // 阶段完成度 0-100
  overallProgress: number   // 总体完成度 0-100
}
```

### 更新整个路径规划

**接口**：`PUT /path/:id`

**请求头**：需要 Authorization

**请求参数**：`PathPlan`（部分字段可更新）

**响应数据**：`PathPlan`

---

## 报告模块

### 生成报告

**接口**：`POST /reports/generate`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface ReportGenerateRequest {
  type: 'comprehensive' | 'capability' | 'path'  // 报告类型
  includeEntry?: boolean      // 是否包含信息录入
  includeCapability?: boolean // 是否包含能力画像
  includePath?: boolean       // 是否包含路径规划
}
```

**响应数据**：
```typescript
interface Report {
  id: string
  userId: string
  type: string
  title: string
  summary: string           // 报告摘要
  content: {
    entry?: EntrySubmitRequest
    capability?: CapabilityProfile
    path?: PathPlan
    analysis?: string       // AI 分析
    suggestions?: string[]  // 建议
  }
  status: 'generating' | 'completed' | 'failed'
  generatedAt: string
  downloadUrl?: string      // PDF 下载链接
}
```

### 获取报告列表

**接口**：`GET /reports`

**请求头**：需要 Authorization

**请求参数**：
```typescript
interface ReportQueryParams extends PaginationParams {
  type?: string
  status?: string
}
```

**响应数据**：
```typescript
interface ReportListResponse {
  list: Array<{
    id: string
    type: string
    title: string
    summary: string
    status: string
    generatedAt: string
  }>
  total: number
  page: number
  pageSize: number
}
```

### 获取报告详情

**接口**：`GET /reports/:id`

**请求头**：需要 Authorization

**响应数据**：`Report`

### 删除报告

**接口**：`DELETE /reports/:id`

**请求头**：需要 Authorization

**响应**：204 No Content

---

## 错误码

### 系统级错误码（0-999）

| 错误码 | 说明 | HTTP 状态码 |
|--------|------|-------------|
| 0 | 成功 | 200 |
| 400 | 请求参数错误 | 400 |
| 401 | 未认证 | 401 |
| 403 | 无权限 | 403 |
| 404 | 资源不存在 | 404 |
| 500 | 服务器内部错误 | 500 |

### 业务级错误码（1000+）

#### 用户相关（1000-1099）

| 错误码 | 说明 |
|--------|------|
| 1001 | 用户不存在 |
| 1002 | 用户已存在 |
| 1003 | 用户名或密码错误 |
| 1004 | Token 已过期 |
| 1005 | Token 无效 |

#### 信息录入相关（1100-1199）

| 错误码 | 说明 |
|--------|------|
| 1101 | 信息录入不完整 |
| 1102 | 信息录入已存在 |
| 1103 | 简历解析失败 |
| 1104 | 简历格式不支持 |
| 1105 | 简历文件过大 |

#### 测评相关（1200-1299）

| 错误码 | 说明 |
|--------|------|
| 1201 | MBTI 测评未完成 |
| 1202 | MBTI 答案无效 |
| 1203 | 题库加载失败 |

#### 岗位相关（1300-1399）

| 错误码 | 说明 |
|--------|------|
| 1301 | 岗位不存在 |
| 1302 | 岗位推荐失败 |
| 1303 | 筛选参数无效 |

#### 能力画像相关（1400-1499）

| 错误码 | 说明 |
|--------|------|
| 1401 | 能力画像生成失败 |
| 1402 | 能力画像不存在 |
| 1403 | 信息不足，无法生成画像 |

#### 路径规划相关（1500-1599）

| 错误码 | 说明 |
|--------|------|
| 1501 | 路径规划生成失败 |
| 1502 | 路径规划不存在 |
| 1503 | 目标岗位无效 |
| 1504 | 任务不存在 |

#### 报告相关（1600-1699）

| 错误码 | 说明 |
|--------|------|
| 1601 | 报告生成失败 |
| 1602 | 报告不存在 |
| 1603 | 报告类型无效 |

---

## 附录

### 前端类型定义生成

可以使用工具从 API 文档自动生成 TypeScript 类型定义：

```bash
# 使用 openapi-typescript
npx openapi-typescript https://api.career-platform.com/api/v1/openapi.json -o src/types/api.ts
```

### Postman Collection

导入 Postman Collection 进行 API 测试：

```
https://api.career-platform.com/api/v1/postman-collection.json
```

### Swagger UI

在线 API 文档：

```
https://api.career-platform.com/api/v1/docs
```

---

**维护者**：后端团队  
**创建时间**：2026-05-10  
**最后更新**：2026-05-10  
**版本**：v1.0.0
