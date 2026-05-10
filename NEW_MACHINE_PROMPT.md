# 🚀 新机器继续开发 - Claude 提示词

> **用途**：在新物理机上使用 Claude Code 继续开发  
> **项目**：职业规划平台  
> **版本**：v2.0.0

---

## 📋 给 Claude 的完整上下文提示词

当你在新机器上打开项目后，将以下内容发送给 Claude Code：

---

### 提示词模板

```
你好！我是职业规划平台项目的开发者，刚刚从旧物理机迁移到新机器。

## 项目背景

这是一个面向大学生的智能职业路径选择决策支持系统，包含：
- 前端：Vue 3 + TypeScript + Vite + Pinia + Element Plus
- 后端：Spring Boot + MySQL + Redis + MyBatis
- 设计系统：Clay Design System

## 当前项目状态

### 已完成的工作（✅）
1. **信息架构设计**：9大模块，43个功能点
2. **导航与布局系统**：MainNavbar、Sidebar、MainLayout 已重构
3. **首页重构**：Home.vue 已完全重构，使用 Clay 设计系统
4. **文档体系**：已完善所有核心文档
   - REFACTOR_ROADMAP.md - 系统性重构路线图（10周详细计划）
   - DEVELOPMENT_GUIDE.md - 开发规范
   - API_SPECIFICATION.md - API 接口规范
   - COMPONENT_GUIDE.md - 组件开发指南
   - TESTING_GUIDE.md - 测试指南
   - MIGRATION_CHECKLIST.md - 迁移检查清单
   - SECURITY_CHECK_REPORT.md - 安全检查报告

### 待完成的工作（❌）
根据 REFACTOR_ROADMAP.md，我们采用**策略 B（大爆炸重构）**，还需要完成：

**Phase 1（Week 1-2）**：基础架构搭建
- [ ] 安装 Pinia、Vitest、Playwright
- [ ] 创建 Pinia Store 结构（User、Entry、Assessment、Job、Capability、Path、Report）
- [ ] 封装 API 层（统一请求/响应拦截器）
- [ ] 创建 Composables（useApiRequest、useFormValidation、useFormCompletion 等）

**Phase 2（Week 3-6）**：组件拆分与重构
- [ ] ComprehensiveEntry.vue（1396行 → 拆分为 8-10 个子组件）
- [ ] JobExploration.vue（1273行 → 拆分为 5-6 个子组件）
- [ ] CapabilityProfile.vue（773行 → 拆分为 4-5 个子组件）
- [ ] PathPlanning.vue（842行 → 拆分为 5-6 个子组件）
- [ ] Report.vue（689行 → 重构）
- [ ] ReportsList.vue（633行 → 重构）

**Phase 3（Week 7-8）**：体验优化
- [ ] 分步表单实现
- [ ] 智能引导系统
- [ ] 性能优化（懒加载、缓存、虚拟滚动）

**Phase 4（Week 9-10）**：质量保障
- [ ] 单元测试（覆盖率 > 70%）
- [ ] E2E 测试
- [ ] CI/CD 配置

## 重要约束

### ⚠️ 重构原则（必须遵守）
1. **只改前端部分**：不能影响后端业务逻辑
2. **保持功能完整**：所有 API 调用、数据流、路由跳转必须正常工作
3. **纯样式和架构重构**：
   - ✅ 可以改：布局结构、CSS 样式、组件拆分、状态管理方式
   - ❌ 不能改：API 调用参数、业务逻辑、数据处理流程

### 📐 开发规范
- 遵循 DEVELOPMENT_GUIDE.md 中的所有规范
- 使用 Clay 设计系统变量（var(--clay-*)）
- 组件单文件代码量 < 500 行
- 使用 Composition API（script setup）
- 使用 TypeScript 类型定义
- 使用 Pinia 进行状态管理
- 使用 Composables 提取公共逻辑

## 当前需要你帮助的任务

[在这里描述你当前需要 Claude 帮助的具体任务]

例如：
- "我需要开始 Phase 1 的工作，请帮我搭建 Pinia Store 结构"
- "我需要重构 ComprehensiveEntry.vue，请先分析它的结构并给出拆分方案"
- "我遇到了一个 Bug，JobExploration.vue 的筛选功能不工作"

## 重要文档索引

请在回答问题或执行任务前，先阅读相关文档：
- REFACTOR_ROADMAP.md - 了解整体重构计划
- DEVELOPMENT_GUIDE.md - 了解代码规范
- API_SPECIFICATION.md - 了解接口定义
- COMPONENT_GUIDE.md - 了解组件开发规范

## 项目目录结构

```
d:\Project\服创\
├── frontend/fr/              # 前端项目
│   ├── src/
│   │   ├── api/              # API 层（待创建）
│   │   ├── stores/           # Pinia Store（待创建）
│   │   ├── composables/      # Composables（待创建）
│   │   ├── components/
│   │   │   ├── business/     # 业务组件（待创建）
│   │   │   ├── form/         # 表单组件（待创建）
│   │   │   ├── ui/           # UI 组件（已有部分）
│   │   │   └── common/       # 通用组件（待创建）
│   │   ├── pages/            # 页面组件（待重构）
│   │   ├── types/            # 类型定义（待创建）
│   │   └── utils/            # 工具函数（已有）
│   └── .env                  # 环境变量（已配置）
├── backend/ba/               # 后端项目
└── *.md                      # 项目文档

请开始帮助我！
```

---

## 🎯 快速启动命令

### 场景 1：刚克隆项目，需要初始化

```
我刚从 GitHub 克隆了项目到新机器，请帮我：
1. 检查项目结构是否完整
2. 确认所有必要的配置文件是否存在
3. 指导我安装依赖和启动项目
4. 告诉我接下来应该做什么

项目路径：[你的项目路径]
```

### 场景 2：开始 Phase 1 基础架构搭建

```
我准备开始 Phase 1 的基础架构搭建工作。

根据 REFACTOR_ROADMAP.md 的 Week 1 计划，我需要：
1. 安装 Pinia、Vitest、Playwright 依赖
2. 创建 Pinia Store 结构
3. 封装 API 层
4. 创建 Composables

请按照 DEVELOPMENT_GUIDE.md 的规范，帮我逐步完成这些工作。

注意：
- 不要修改任何现有的业务逻辑
- 保持所有 API 调用正常工作
- 遵循 TypeScript 类型安全
```

### 场景 3：重构某个具体页面

```
我需要重构 ComprehensiveEntry.vue 页面。

当前状态：
- 文件位置：frontend/fr/src/pages/ComprehensiveEntry.vue
- 代码行数：1396 行
- 问题：单文件过大，逻辑混杂

目标：
- 拆分为 8-10 个子组件
- 使用 Pinia Store 管理状态
- 使用 Composables 提取逻辑
- 应用 Clay 设计系统
- 保持所有功能正常工作

请先：
1. 阅读当前文件，分析其结构和业务逻辑
2. 给出详细的拆分方案
3. 等我确认后再开始重构

重要：不要动任何后端 API 调用逻辑！
```

### 场景 4：遇到 Bug 需要调试

```
我遇到了一个 Bug：

**问题描述**：[详细描述问题]
**复现步骤**：[如何复现]
**预期行为**：[应该怎样]
**实际行为**：[实际怎样]
**相关文件**：[涉及的文件]

请帮我：
1. 分析可能的原因
2. 定位问题代码
3. 提供修复方案
4. 确保修复后不影响其他功能
```

### 场景 5：代码审查

```
我刚完成了 [某个功能/组件] 的开发，请帮我做 Code Review。

**改动文件**：
- [列出修改的文件]

**改动内容**：
- [简要说明改动]

请对照 DEVELOPMENT_GUIDE.md 检查：
1. 代码规范是否符合
2. 类型定义是否完整
3. 组件设计是否合理
4. 是否有性能问题
5. 是否有安全漏洞
6. 测试覆盖是否充分

给出具体的改进建议。
```

---

## 📚 常用文档快速查询

### 查看重构计划
```
请打开并总结 REFACTOR_ROADMAP.md 的内容，告诉我：
1. 当前应该在哪个阶段
2. 这个阶段的具体任务
3. 预计完成时间
```

### 查看开发规范
```
请打开 DEVELOPMENT_GUIDE.md，告诉我：
1. [具体问题，如：组件命名规范是什么？]
2. [具体问题，如：如何使用 Pinia Store？]
```

### 查看 API 文档
```
请打开 API_SPECIFICATION.md，告诉我：
1. [某个模块] 的接口定义
2. 请求参数和响应格式
3. 错误码说明
```

---

## ⚠️ 重要提醒

### 给 Claude 的约束

在每次对话开始时，提醒 Claude：

```
重要约束：
1. 本项目正在进行大规模重构，请严格遵循 REFACTOR_ROADMAP.md 的计划
2. 只能修改前端代码，不能影响后端业务逻辑
3. 所有代码必须符合 DEVELOPMENT_GUIDE.md 的规范
4. 重构时必须保持功能完整，不能破坏现有功能
5. 在修改代码前，先阅读相关文档并给出方案，等我确认后再执行
```

---

## 🔄 会话恢复

如果 Claude 的上下文丢失，使用以下提示词快速恢复：

```
我们之前正在进行职业规划平台的重构工作。

**项目信息**：
- 项目路径：[你的路径]
- 当前阶段：[Phase X]
- 正在进行的任务：[具体任务]

**上次对话内容**：
[简要描述上次对话的内容和结论]

**当前问题**：
[描述当前遇到的问题或需要继续的工作]

请先阅读以下文档恢复上下文：
1. REFACTOR_ROADMAP.md - 了解整体计划
2. DEVELOPMENT_GUIDE.md - 了解开发规范
3. [其他相关文档]

然后继续帮我完成任务。
```

---

## 💡 最佳实践

### 1. 每次开始新任务前

```
我准备开始 [新任务]。

请先帮我：
1. 检查这个任务在 REFACTOR_ROADMAP.md 中的位置
2. 确认前置任务是否已完成
3. 阅读相关文档和代码
4. 给出详细的实施方案
5. 等我确认后再开始执行
```

### 2. 完成任务后

```
我刚完成了 [任务]。

请帮我：
1. 检查代码是否符合规范
2. 确认功能是否正常工作
3. 更新相关文档（如果需要）
4. 告诉我下一步应该做什么
```

### 3. 遇到问题时

```
我在执行 [任务] 时遇到了问题：[描述问题]

请帮我：
1. 分析问题原因
2. 查看相关文档和代码
3. 提供解决方案
4. 如果需要调整计划，给出建议
```

---

**创建者**：开发团队  
**最后更新**：2026-05-11  
**版本**：v1.0.0
