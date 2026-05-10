# 职业规划平台 - 系统性重构路线图

> **重构策略**：大爆炸重构（Strategy B）  
> **预计时间**：2-3 个月  
> **重构分支**：`refactor/system-upgrade`  
> **目标版本**：v2.0.0

---

## 📋 重构目标

### 核心目标
1. **前端现代化**：统一设计系统、组件化、类型安全、状态管理
2. **后端标准化**：API 规范、数据模型优化、错误处理统一
3. **用户体验提升**：流程优化、性能提升、交互改进
4. **工程化完善**：代码规范、测试覆盖、CI/CD

### 量化指标
| 维度 | 现状 | 目标 | 提升 |
|------|------|------|------|
| 单文件代码行数 | 1000-1500 行 | 200-400 行 | ↓ 70% |
| 组件复用率 | 20% | 60% | ↑ 3x |
| 类型覆盖率 | 30% | 90% | ↑ 3x |
| 首屏加载时间 | 3-4s | 1-1.5s | ↓ 60% |
| 页面切换时间 | 500-800ms | 100-200ms | ↓ 75% |
| 表单完成率 | 45% | 70% | ↑ 55% |
| 测试覆盖率 | 0% | 70% | +70% |

---

## 🏗️ 重构架构设计

### 前端架构

```
frontend/fr/src/
├── api/                          # API 层
│   ├── client.ts                 # Axios 封装
│   ├── interceptors.ts           # 请求/响应拦截器
│   ├── entry.ts                  # 信息录入 API
│   ├── assessment.ts             # 测评 API
│   ├── job.ts                    # 岗位 API
│   ├── capability.ts             # 能力画像 API
│   ├── path.ts                   # 路径规划 API
│   ├── report.ts                 # 报告 API
│   └── types.ts                  # API 类型定义
│
├── stores/                       # Pinia 状态管理
│   ├── index.ts                  # Store 入口
│   ├── user.ts                   # 用户状态
│   ├── entry.ts                  # 信息录入状态
│   ├── assessment.ts             # 测评状态
│   ├── job.ts                    # 岗位状态
│   ├── capability.ts             # 能力画像状态
│   ├── path.ts                   # 路径规划状态
│   └── report.ts                 # 报告状态
│
├── composables/                  # 组合式函数
│   ├── useApiRequest.ts          # API 请求封装
│   ├── useFormValidation.ts      # 表单验证
│   ├── useFormCompletion.ts      # 表单完成度
│   ├── useLocalStorage.ts        # 本地存储
│   ├── usePagination.ts          # 分页
│   ├── useDebounce.ts            # 防抖
│   ├── useThrottle.ts            # 节流
│   └── useModal.ts               # 弹窗管理
│
├── components/
│   ├── business/                 # 业务组件
│   │   ├── ResumeUploader/       # 简历上传
│   │   │   ├── index.vue
│   │   │   ├── useResumeParser.ts
│   │   │   └── types.ts
│   │   ├── SkillTagInput/        # 技能标签输入
│   │   │   ├── index.vue
│   │   │   └── types.ts
│   │   ├── ExperienceEditor/     # 经历编辑器
│   │   │   ├── index.vue
│   │   │   ├── ExperienceItem.vue
│   │   │   └── types.ts
│   │   ├── MbtiAssessment/       # MBTI 测评
│   │   │   ├── MbtiDialog.vue
│   │   │   ├── MbtiNotice.vue
│   │   │   ├── MbtiQuiz.vue
│   │   │   ├── useMbtiQuestions.ts
│   │   │   └── types.ts
│   │   ├── CompletionTracker/    # 完成度追踪
│   │   │   ├── index.vue
│   │   │   ├── ProgressItem.vue
│   │   │   └── types.ts
│   │   ├── JobCard/              # 岗位卡片
│   │   │   ├── index.vue
│   │   │   └── types.ts
│   │   ├── JobFilter/            # 岗位筛选
│   │   │   ├── index.vue
│   │   │   └── types.ts
│   │   ├── CapabilityChart/      # 能力雷达图
│   │   │   ├── index.vue
│   │   │   └── types.ts
│   │   └── PathTimeline/         # 路径时间线
│   │       ├── index.vue
│   │       ├── StageCard.vue
│   │       ├── TaskItem.vue
│   │       └── types.ts
│   │
│   ├── form/                     # 表单组件
│   │   ├── FormSection.vue       # 表单区块
│   │   ├── FormField.vue         # 表单字段
│   │   ├── DynamicList.vue       # 动态列表
│   │   └── StepForm.vue          # 分步表单
│   │
│   ├── ui/                       # UI 组件（已有）
│   │   ├── MainNavbar.vue
│   │   ├── Sidebar.vue
│   │   ├── MainLayout.vue
│   │   ├── FeatureCard.vue
│   │   ├── ProfilePromptBanner.vue
│   │   └── layouts/
│   │       ├── ListPageLayout.vue
│   │       ├── DetailPageLayout.vue
│   │       ├── DashboardLayout.vue
│   │       └── FormPageLayout.vue
│   │
│   └── common/                   # 通用组件
│       ├── Loading.vue
│       ├── Empty.vue
│       ├── ErrorBoundary.vue
│       └── Pagination.vue
│
├── pages/                        # 页面组件
│   ├── Home.vue                  # 首页（已重构）
│   ├── Login.vue                 # 登录页
│   ├── ComprehensiveEntry.vue    # 信息录入（待重构）
│   ├── MbtiAssessment.vue        # MBTI 测评（待重构）
│   ├── JobExploration.vue        # 岗位探索（待重构）
│   ├── CapabilityProfile.vue     # 能力画像（待重构）
│   ├── PathPlanning.vue          # 路径规划（待重构）
│   ├── Report.vue                # 报告生成（待重构）
│   └── ReportsList.vue           # 报告列表（待重构）
│
├── types/                        # 类型定义
│   ├── api.ts                    # API 类型
│   ├── models.ts                 # 数据模型
│   ├── forms.ts                  # 表单类型
│   ├── store.ts                  # Store 类型
│   └── common.ts                 # 通用类型
│
├── utils/                        # 工具函数
│   ├── request.ts                # 请求工具（已有）
│   ├── storage.ts                # 本地存储（已有）
│   ├── auth.ts                   # 认证工具（已有）
│   ├── validation.ts             # 验证工具
│   ├── format.ts                 # 格式化工具
│   └── constants.ts              # 常量定义
│
├── router/                       # 路由
│   ├── index.ts                  # 路由配置
│   ├── guards.ts                 # 路由守卫
│   └── routes.ts                 # 路由定义
│
└── assets/                       # 静态资源
    ├── global.css                # 全局样式（已有）
    └── images/
```

### 后端架构

```
backend/ba/src/main/
├── java/com/career/
│   ├── controller/               # 控制器层
│   │   ├── EntryController.java
│   │   ├── AssessmentController.java
│   │   ├── JobController.java
│   │   ├── CapabilityController.java
│   │   ├── PathController.java
│   │   └── ReportController.java
│   │
│   ├── service/                  # 服务层
│   │   ├── EntryService.java
│   │   ├── AssessmentService.java
│   │   ├── JobService.java
│   │   ├── CapabilityService.java
│   │   ├── PathService.java
│   │   └── ReportService.java
│   │
│   ├── dto/                      # 数据传输对象
│   │   ├── request/
│   │   │   ├── EntrySubmitRequest.java
│   │   │   ├── MbtiSubmitRequest.java
│   │   │   └── JobQueryRequest.java
│   │   └── response/
│   │       ├── ApiResponse.java
│   │       ├── EntryResponse.java
│   │       └── JobResponse.java
│   │
│   ├── entity/                   # 实体类
│   │   ├── User.java
│   │   ├── Entry.java
│   │   ├── Job.java
│   │   ├── Capability.java
│   │   └── PathPlan.java
│   │
│   ├── repository/               # 数据访问层
│   │   ├── UserRepository.java
│   │   ├── EntryRepository.java
│   │   └── JobRepository.java
│   │
│   ├── exception/                # 异常处理
│   │   ├── GlobalExceptionHandler.java
│   │   ├── BusinessException.java
│   │   └── ErrorCode.java
│   │
│   └── config/                   # 配置
│       ├── WebConfig.java
│       ├── SecurityConfig.java
│       └── SwaggerConfig.java
│
└── resources/
    ├── application.yml
    └── application-dev.yml
```

---

## 📅 实施计划

### Phase 1：基础架构搭建（Week 1-2）

#### Week 1：前端基础架构

**Day 1-2：状态管理（Pinia）**
- [ ] 安装 Pinia 依赖
- [ ] 创建 Store 结构
- [ ] 实现 User Store
- [ ] 实现 Entry Store
- [ ] 实现 Assessment Store

**Day 3-4：API 层封装**
- [ ] 创建 Axios 实例
- [ ] 实现请求/响应拦截器
- [ ] 封装 Entry API
- [ ] 封装 Assessment API
- [ ] 封装 Job API

**Day 5：Composables**
- [ ] 实现 useApiRequest
- [ ] 实现 useFormValidation
- [ ] 实现 useFormCompletion
- [ ] 实现 useLocalStorage

**产出**：
- ✅ Pinia Store 结构
- ✅ API 层封装
- ✅ Composables 库
- ✅ 类型定义文件

---

#### Week 2：后端 API 标准化

**Day 1-2：统一响应格式**
- [ ] 创建 ApiResponse 类
- [ ] 创建 ErrorCode 枚举
- [ ] 实现全局异常处理器
- [ ] 更新所有 Controller 返回格式

**Day 3-4：数据验证**
- [ ] 添加 Validation 依赖
- [ ] 创建 DTO 验证规则
- [ ] 实现自定义验证器
- [ ] 添加验证错误处理

**Day 5：API 文档**
- [ ] 配置 Swagger/OpenAPI
- [ ] 添加 API 注解
- [ ] 生成 API 文档
- [ ] 前端类型生成脚本

**产出**：
- ✅ 统一的 API 响应格式
- ✅ 完整的数据验证
- ✅ API 文档
- ✅ 前后端类型同步

---

### Phase 2：组件拆分与重构（Week 3-6）

#### Week 3：ComprehensiveEntry 重构

**Day 1：组件拆分**
- [ ] 创建 ResumeUploader 组件
- [ ] 创建 SkillTagInput 组件
- [ ] 创建 ExperienceEditor 组件
- [ ] 创建 CompletionTracker 组件

**Day 2-3：应用新架构**
- [ ] 使用 Entry Store
- [ ] 使用 useFormCompletion
- [ ] 使用 useFormValidation
- [ ] 重构表单提交逻辑

**Day 4：MBTI 组件独立**
- [ ] 创建 MbtiAssessment 组件
- [ ] 创建 useMbtiQuestions
- [ ] 实现 MBTI 状态管理
- [ ] 优化 MBTI 弹窗交互

**Day 5：测试与优化**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] Bug 修复

**产出**：
- ✅ 重构后的 ComprehensiveEntry
- ✅ 8-10 个可复用组件
- ✅ 测试用例

---

#### Week 4：JobExploration 重构

**Day 1：组件拆分**
- [ ] 创建 JobCard 组件
- [ ] 创建 JobFilter 组件
- [ ] 创建 JobDetail 组件
- [ ] 创建 JobCompare 组件

**Day 2-3：应用新架构**
- [ ] 使用 Job Store
- [ ] 使用 usePagination
- [ ] 使用 useDebounce（搜索）
- [ ] 重构筛选逻辑

**Day 4：交互优化**
- [ ] 优化岗位卡片交互
- [ ] 优化筛选器交互
- [ ] 添加骨架屏
- [ ] 添加虚拟滚动

**Day 5：测试与优化**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] Bug 修复

**产出**：
- ✅ 重构后的 JobExploration
- ✅ 5-6 个可复用组件
- ✅ 测试用例

---

#### Week 5：CapabilityProfile 重构

**Day 1：组件拆分**
- [ ] 创建 CapabilityChart 组件
- [ ] 创建 StrengthCard 组件
- [ ] 创建 RecommendationCard 组件
- [ ] 创建 ActionButton 组件

**Day 2-3：应用新架构**
- [ ] 使用 Capability Store
- [ ] 实现能力画像生成逻辑
- [ ] 优化图表展示
- [ ] 重构推荐逻辑

**Day 4：交互优化**
- [ ] 添加生成动画
- [ ] 优化图表交互
- [ ] 添加数据可视化
- [ ] 优化移动端体验

**Day 5：测试与优化**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] Bug 修复

**产出**：
- ✅ 重构后的 CapabilityProfile
- ✅ 4-5 个可复用组件
- ✅ 测试用例

---

#### Week 6：PathPlanning & Report 重构

**Day 1-2：PathPlanning 重构**
- [ ] 创建 PathTimeline 组件
- [ ] 创建 StageCard 组件
- [ ] 创建 TaskItem 组件
- [ ] 使用 Path Store
- [ ] 优化任务管理交互

**Day 3-4：Report & ReportsList 重构**
- [ ] 创建 ReportCard 组件
- [ ] 创建 ReportPreview 组件
- [ ] 使用 Report Store
- [ ] 优化报告生成流程

**Day 5：测试与优化**
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] Bug 修复

**产出**：
- ✅ 重构后的 PathPlanning
- ✅ 重构后的 Report & ReportsList
- ✅ 测试用例

---

### Phase 3：体验优化（Week 7-8）

#### Week 7：流程优化

**Day 1-2：分步表单**
- [ ] 设计分步流程
- [ ] 实现 StepForm 组件
- [ ] 重构信息录入流程
- [ ] 添加进度保存提示

**Day 3-4：智能引导**
- [ ] 实现用户状态检测
- [ ] 实现智能推荐系统
- [ ] 添加引导提示
- [ ] 优化首次使用体验

**Day 5：用户反馈**
- [ ] 添加操作反馈
- [ ] 优化错误提示
- [ ] 添加成功提示
- [ ] 优化加载状态

**产出**：
- ✅ 分步表单系统
- ✅ 智能引导系统
- ✅ 完善的用户反馈

---

#### Week 8：性能优化

**Day 1-2：代码分割**
- [ ] 路由懒加载
- [ ] 组件懒加载
- [ ] 第三方库按需加载
- [ ] 优化打包配置

**Day 3：缓存策略**
- [ ] 实现请求缓存
- [ ] 实现数据缓存
- [ ] 优化本地存储
- [ ] 添加缓存失效机制

**Day 4：渲染优化**
- [ ] 虚拟滚动
- [ ] 图片懒加载
- [ ] 防抖节流
- [ ] 减少重渲染

**Day 5：性能测试**
- [ ] Lighthouse 测试
- [ ] 性能指标收集
- [ ] 优化建议实施
- [ ] 性能报告

**产出**：
- ✅ 性能优化方案
- ✅ 性能测试报告
- ✅ 首屏加载时间 < 1.5s

---

### Phase 4：质量保障（Week 9-10）

#### Week 9：测试覆盖

**Day 1-2：单元测试**
- [ ] Composables 测试
- [ ] Store 测试
- [ ] 工具函数测试
- [ ] 组件测试

**Day 3-4：集成测试**
- [ ] API 集成测试
- [ ] 页面流程测试
- [ ] 跨组件交互测试
- [ ] 错误场景测试

**Day 5：E2E 测试**
- [ ] 核心流程 E2E
- [ ] 边界场景 E2E
- [ ] 移动端 E2E
- [ ] 测试报告

**产出**：
- ✅ 测试覆盖率 > 70%
- ✅ E2E 测试套件
- ✅ 测试文档

---

#### Week 10：工程化完善

**Day 1：代码规范**
- [ ] ESLint 配置
- [ ] Prettier 配置
- [ ] Husky + lint-staged
- [ ] 提交规范（Commitlint）

**Day 2：CI/CD**
- [ ] GitHub Actions 配置
- [ ] 自动化测试
- [ ] 自动化构建
- [ ] 自动化部署

**Day 3-4：文档完善**
- [ ] 组件文档
- [ ] API 文档
- [ ] 开发指南
- [ ] 部署文档

**Day 5：发布准备**
- [ ] 版本号更新
- [ ] CHANGELOG 编写
- [ ] 发布说明
- [ ] 回归测试

**产出**：
- ✅ 完整的工程化配置
- ✅ CI/CD 流程
- ✅ 完善的文档
- ✅ v2.0.0 发布

---

## 🔍 质量检查清单

### 代码质量
- [ ] 所有文件代码行数 < 500 行
- [ ] 组件复用率 > 60%
- [ ] TypeScript 类型覆盖率 > 90%
- [ ] ESLint 无错误
- [ ] Prettier 格式化通过

### 功能完整性
- [ ] 所有原有功能正常工作
- [ ] 所有 API 调用正常
- [ ] 所有路由跳转正常
- [ ] 所有表单验证正常
- [ ] 所有数据存储正常

### 用户体验
- [ ] 首屏加载时间 < 1.5s
- [ ] 页面切换时间 < 200ms
- [ ] 无明显卡顿
- [ ] 移动端适配良好
- [ ] 交互反馈及时

### 测试覆盖
- [ ] 单元测试覆盖率 > 70%
- [ ] 集成测试通过
- [ ] E2E 测试通过
- [ ] 无已知 Bug

### 文档完善
- [ ] 组件文档完整
- [ ] API 文档完整
- [ ] 开发指南完整
- [ ] 部署文档完整

---

## 🚨 风险控制

### 技术风险

**风险 1：新架构学习成本**
- **影响**：开发效率降低
- **缓解**：提前学习 Pinia、Composables，编写示例代码
- **应对**：安排技术分享，结对编程

**风险 2：重构引入新 Bug**
- **影响**：功能异常
- **缓解**：充分测试，分模块验证
- **应对**：快速回滚机制，保留旧代码分支

**风险 3：性能优化效果不达预期**
- **影响**：用户体验未改善
- **缓解**：提前性能测试，制定优化方案
- **应对**：持续优化，分阶段实施

### 进度风险

**风险 1：时间估算不准确**
- **影响**：延期交付
- **缓解**：预留 20% 缓冲时间
- **应对**：每周进度评审，及时调整

**风险 2：需求变更**
- **影响**：重复工作
- **缓解**：冻结需求，专注重构
- **应对**：新需求记录，v2.1 实现

### 协作风险

**风险 1：前后端协作不畅**
- **影响**：接口对接延迟
- **缓解**：提前定义接口规范，使用 Mock 数据
- **应对**：每日站会，及时沟通

**风险 2：代码冲突**
- **影响**：合并困难
- **缓解**：使用独立分支，模块化开发
- **应对**：及时合并，解决冲突

---

## 📊 成功标准

### 必须达成（P0）
- ✅ 所有原有功能正常工作
- ✅ 代码质量指标达标（行数、复用率、类型覆盖）
- ✅ 性能指标达标（首屏、切换时间）
- ✅ 测试覆盖率 > 70%

### 期望达成（P1）
- ✅ 用户体验明显提升
- ✅ 开发效率提升 50%
- ✅ 文档完善
- ✅ CI/CD 流程完整

### 可选达成（P2）
- ✅ 表单完成率提升到 70%
- ✅ 新功能开发时间减少 60%
- ✅ Bug 修复时间减少 75%

---

## 📝 相关文档

- [开发规范](./DEVELOPMENT_GUIDE.md) - 代码规范、命名规范、提交规范
- [API 规范](./API_SPECIFICATION.md) - 接口设计规范、数据格式规范
- [组件开发指南](./COMPONENT_GUIDE.md) - 组件设计原则、开发流程
- [测试指南](./TESTING_GUIDE.md) - 测试策略、测试用例编写

---

**维护者**：开发团队  
**创建时间**：2026-05-10  
**最后更新**：2026-05-10  
**版本**：v1.0.0
