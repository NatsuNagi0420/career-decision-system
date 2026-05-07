# 服创前端使用说明 (Frontend help)

本文件面向需要快速上手或维护前端的开发者，重点说明本项目前端的技术栈、目录结构、关键页面与与后端的交互方式。

---

## 1. 技术栈与启动方式

- **框架**：Vue 3 + TypeScript + Vite
- **UI 组件**：Element Plus
- **状态/工具**：
  - 路由：vue-router
  - 本地存储：`utils/storage.ts` 封装 career 相关草稿
  - Cookie：`js-cookie` 存储登录态与 token
- **接口请求**：基于 axios 封装 `utils/request.ts`，统一处理 baseURL、拦截器与错误提示。

### 1.1 本地启动

在 `frontend/fr` 目录下执行：

```bash
cd frontend/fr
npm install
npm run dev
```

默认通过 Vite 在本地启动开发服务器，`VITE_API_BASE_URL` 通过 `.env` 配置，未配置时使用 `/api` 作为反向代理前缀。

---

## 2. 目录结构概览

前端核心目录：`frontend/fr/src`

- `main.ts` / `App.vue`：应用入口，挂载全局样式与路由。
- `router`：路由配置（如有单独 router 文件），定义各业务页面路径。
- `pages/`：业务页面（路由级组件），例如：
  - `Login.vue`：登录页
  - `Register.vue`：注册页
  - `ComprehensiveEntry.vue`：综合信息录入页（支持上传简历 + 表单填写 + 深度问卷 + MBTI 入口）
  - `CapabilityProfile.vue`：能力画像页
  - `JobExploration.vue`：岗位探索页
  - `PathPlanning.vue`（如有）：职业路径规划与图谱
  - `Report.vue`：职业发展报告页（支持保存归档）
- `components/`：复用组件
  - `Navbar.vue`：顶部导航栏，“我的报告”等入口在此维护
  - `DeepAssessmentQuestionnaire.vue`：深度问卷组件
- `api/`：前后端接口封装
  - `user.ts`：登录/注册/用户信息
  - `profile.ts`：信息录入草稿 `/api/profile`
  - `deepAssessment.ts`：深度问卷 `/api/deep-assessment`
  - `capability.ts`：能力画像与推荐岗位 `/api/capability`
  - `targetJob.ts`：目标岗位 `/api/target-job`
  - `pathPlan.ts`：路径规划 `/api/path-plan`
  - `report.ts`：报告归档 `/api/report/archive`
  - `resume.ts`：简历解析 `/api/resume/parse`
- `utils/`
  - `request.ts`：axios 实例封装，不全局写死 `Content-Type`，以便支持 `FormData` 上传
  - `auth.ts`：登录态工具（读写 `userInfo`、`token` 等）
  - `storage.ts`：本地 career 数据存储工具（entryDraft、deepAssessment、capabilityProfile、pathPlan、reportHistory 等）

---

## 3. 关键页面与数据流

### 3.1 登录与鉴权

- 登录接口：`api/user.ts` 中的 `loginApi`（具体命名以实际文件为准）。
- 登录成功后：
  - 将用户信息与 token 写入 Cookie (`userInfo` / `token`)；
  - `utils/request.ts` 拦截器为后续请求自动附加 `Authorization: Bearer {token}` 头。
- 后端统一通过 `AuthInterceptor` + `AuthContext` 校验登录态，典型受保护接口包括 `/api/profile/**`、`/api/capability/**`、`/api/path-plan/**`、`/api/report/**`、`/api/resume/**` 等。

### 3.2 综合信息录入页 (`ComprehensiveEntry.vue`)

- 功能：
  - 支持拖拽/上传 PDF/Word 简历 → 调用 `/api/resume/parse` 自动填充部分字段；
  - 填写基础信息（姓名、邮箱、学校、专业、年级、常驻城市等）；
  - 填写求职目标（目标岗位、求职类型、意向城市、期望薪资等）；
  - 维护技能标签、证书、项目/实习经历、作品链接；
  - 嵌入深度测评问卷 + MBTI 测评入口；
  - 右侧展示“完成度”进度条；
- 本地存储：
  - 利用 `storage.ts` 的 `loadEntryDraft` / `saveEntryDraft` 读写录入草稿；
  - 深度问卷答案通过 `loadDeepAssessmentDraft` / `saveDeepAssessmentDraft` 维护；
- 提交行为：
  - `submitAll()` 中先校验姓名 + 邮箱 + 目标岗位是否填写；
  - 保存草稿到 localStorage；
  - 跳转到能力画像页（`/capability-profile`）。

### 3.3 简历解析链路

- 上传组件：`ComprehensiveEntry.vue` 中的 `el-upload`，`auto-upload=false`，在 `on-change` 回调中手动调用 API：
  - 前端使用 `FormData` 封装文件，调用 `parseResumeApi(file)`；
  - 后端 `ResumeController.parse` 接收 `@RequestParam("file") MultipartFile file` 并校验登录态；
  - `ResumeParseService` 使用 Apache Tika 抽取简历文本并解析：
    - 姓名（包含兜底规则：从首行如“吴子豪 意向岗位：XX”推断）
    - 电话、邮箱、性别、年龄
    - 求职意向（目标岗位、意向城市、期望薪资、求职类型）
    - 教育经历、主修课程、技能证书、工作经历、自我评价
    - 对明显模板占位词（如“求职岗位”“都能接受”“期望薪水”“求职类型”）进行过滤，不回填到前端
  - 前端在解析成功后：
    - 仅在对应字段当前为空时才自动填充，避免覆盖用户手动输入；
    - 部分字段（如电话、学号）如需展示，需要在 `EntryForm` 与页面表单中显式新增字段并映射。

### 3.4 能力画像 & 岗位探索 & 路径规划 & 报告

整体流程（前端视角）：

1. 用户在录入页完成信息 + 问卷 → 跳转能力画像页。
2. 能力画像页读取草稿与问卷，调用 `/api/capability/profile` 生成画像与推荐岗位，并缓存到 localStorage。
3. 岗位探索页基于推荐岗位列表和用户选择，调用 `/api/target-job/me` 设置目标岗位。
4. 路径规划页调用 `/api/path-plan/generate` 生成路径图谱，并允许用户调整/保存行动计划。
5. 报告页整合能力画像 + 目标岗位 + 路径规划，提供“保存归档”按钮，调用 `/api/report/archive` 完成本轮报告归档。

---

## 4. 常见开发/调试注意点

1. **避免全局写死 Content-Type**：
   - `utils/request.ts` 中不要在 axios 实例上设置全局 `Content-Type: application/json`，否则会影响文件上传（multipart/form-data）。
2. **登录态问题排查**：
   - 遇到“未登录”错误时，优先检查：
     - Cookie 中是否有 `token`；
     - 请求头是否携带 `Authorization: Bearer xxx`；
     - 对应接口是否被后端 `WebConfig` 中的拦截器保护路径包含。
3. **本地数据清理**：
   - `storage.ts` 提供：
     - `clearDerivedCareerData()`：仅清空能力画像草稿、路径规划、路径图谱、报告历史等 AI 衍生数据；
     - `clearAllLocalCareerData()`：清空目标岗位、录入草稿、深度问卷及所有衍生数据，适合测试环境完全重置。

如需新增前端页面或功能，建议沿用现有的 `pages/ + api/ + utils/storage.ts` 分层方式，避免在组件内部直接操作 axios 或 localStorage。