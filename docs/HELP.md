# 服创后端使用说明 (Backend HELP)

本文件面向需要快速上手或维护后端的开发者，重点说明本项目中与职业规划流程相关的关键模块、数据表与接口。

---

## 1. 技术栈与工程概览

- **框架**: Spring Boot + MyBatis
- **数据库**: MySQL
- **AI 调用**: 通过 `AiUtils` 对接 OpenAI 兼容网关，大模型用于能力画像与路径规划 JSON 生成
- **工程入口**: `backend/ba/src/main/java/com/example/ba/BaApplication.java`

主要包结构：

- `controller`：HTTP 接口层
- `service` / `service.impl`：业务逻辑与 AI 调用
- `mapper`：MyBatis Mapper，与数据库表一一对应
- `pojo`：实体类 (POJO)
- `dto`：前后端/服务内部使用的传输结构
- `utils`：通用工具（鉴权上下文、JSON 工具、AI 工具等）

---

## 2. 与职业规划五步流程相关的核心表

- `user_profile`  
  - 保存信息录入草稿 (`draft_json`)，结构与 `CapabilityProfileRequestDTO` 基本一致。  
  - 由前端信息录入页 (`QuickEntry.vue` / `ComprehensiveEntry.vue`) 通过 `/api/profile/me` 读写。

- `user_deep_assessment`  
  - 保存 30 题深度问卷答案 (`answers_json`)。  
  - 对应接口 `/api/deep-assessment/me`。

- `user_capability_profile`  
  - 保存大模型生成的能力画像 JSON (`profile_json`) 以及推荐岗位 ID 列表 (`recommended_job_ids_json`)。  
  - 由 `/api/capability/profile` 写入，`/api/capability/profile/me` 与 `/api/capability/recommended-jobs/me` 读取。

- `user_target_job`  
  - 保存当前用户选定的目标岗位 (`job_json`)，是全局唯一的目标岗位权威来源。  
  - 对应接口 `/api/target-job/me` (GET/PUT/DELETE)。

- `user_path_plan`  
  - 保存分阶段行动计划 (`plan_json`)，用于报告页中的“分阶段行动计划”展示。  
  - 对应接口 `/api/path-plan/me` (GET/PUT/DELETE)。

岗位数据来源表见 `backend/ba/sql/schema.sql` 中的岗位表定义。

---

## 3. 关键业务接口一览

### 3.1 信息录入与深度问卷

- `ProfileController` (`/api/profile`)
  - `GET /me`：读取当前用户的录入草稿 (`user_profile.draft_json` → Map)。
  - `PUT /me`：写入/更新当前用户的录入草稿。

- `DeepAssessmentController` (`/api/deep-assessment`)
  - `GET /me`：读取深度问卷答案 (`user_deep_assessment.answers_json`)。
  - `PUT /me`：写入/更新深度问卷答案。

### 3.2 能力画像与推荐岗位

- `CapabilityController` (`/api/capability`)
  - `POST /profile`：
    - 入参：`CapabilityProfileRequestDTO`。前端一般通过合并 `/profile/me` 与 `/deep-assessment/me` 得到。  
    - 处理：调用 `CapabilityService.generateProfile` → 大模型生成画像 JSON → 根据结果搜索推荐岗位 → 持久化到 `user_capability_profile`。  
    - 返回：包含雷达图、标签、建议、推荐岗位及匹配度列表的 Map。
  - `GET /profile/me`：返回最近一次生成的能力画像 JSON。
  - `GET /recommended-jobs/me`：根据 `recommended_job_ids_json` 顺序返回岗位列表，用于岗位探索页默认推荐。

### 3.3 目标岗位

- `TargetJobController` (`/api/target-job`)
  - `GET /me`：返回当前用户选定的目标岗位 JSON (`user_target_job.job_json`)。  
  - `PUT /me`：更新当前目标岗位，岗位探索页在用户点击“设为目标岗位”时调用。  
  - `DELETE /me`：软删除当前用户目标岗位（测试/重置用）。

> 约定：前后端均以 `/api/target-job/me` 为目标岗位的唯一权威来源，路径规划与报告生成不得再直接依赖信息录入草稿中的旧目标字段。

### 3.4 路径规划

- `PathPlanController` (`/api/path-plan`)
  - `POST /generate`：
    - 入参：`CapabilityProfileRequestDTO`（可为空）。Controller 中只负责设置 `userId`，实际的字段装配在 `CapabilityServiceImpl` 内完成。  
    - 处理：调用 `CapabilityService.generateCareerPath`，使用统一装配后的 `CapabilityProfileRequestDTO` 调用大模型，返回力导向图所需的 `nodes/links/recommendations` JSON；若大模型调用失败或返回非法结构，则退回到后端内置的 fallback 图谱。  
    - 返回：前端路径规划页 (`PathPlanning.vue`) 直接消费的图谱数据。  
  - `GET /me` / `PUT /me` / `DELETE /me`：读写 `user_path_plan.plan_json`，用于分阶段行动计划，与力导向图数据结构不同。

### 3.5 全局 AI 助手

- `AssistantController` (`/api/assistant`)
  - `POST /chat`：
    - 入参：`AssistantChatDTO { page, message, context }`。  
    - 使用系统提示词将助手限定为“星途”，根据当前页面与上下文给出简洁可执行的建议，并在回复末尾附带可选的 JSON 按钮提示。  
    - 返回：`{ reply: string }`，前端负责渲染文本与解析按钮 JSON。

---

## 4. 能力画像与路径规划内部装配逻辑

实现类：`CapabilityServiceImpl`。

### 4.1 统一用户请求装配

- 私有方法 `assembleUserRequest(CapabilityProfileRequestDTO req)`：
  - 以 `user_profile.draft_json` 作为基础用户画像输入（若存在），补全缺失的基础信息、技能、问卷答案等字段；
  - 再以 `user_target_job.job_json` 作为目标岗位权威来源，覆盖/补充 `CapabilityProfileRequestDTO.Target` 中的角色名称、城市与薪资；
  - 最终得到一份稳定的 `CapabilityProfileRequestDTO`，同时用于能力画像与路径规划两条调用链路。

### 4.2 大模型提示词与兜底策略

- `generateProfile`：
  - 使用结构化的 system prompt 明确约束输出 JSON 的字段与类型（评分范围、数组长度等），避免多余字段和非 JSON 文本；
  - 调用异常或 JSON 解析失败时，使用 `buildFallback` 构造一份结构完整的画像结果，并在 `normalizeProfile` 中对不合规字段进行回退处理。

- `generateCareerPath`：
  - 使用 system prompt 约定输出 `nodes/links/recommendations` 三大字段及其子结构；
  - 若返回数据包含错误字段或结构不合法，由 `isValidCareerPathResponse` 判定后，回退到 `buildPathFallback` 生成的默认路径图谱，保证前端始终可用。

---

## 5. 本地开发与调试建议

1. **本地启动顺序**：先启动 MySQL 并导入岗位等基础表，再启动后端 Spring Boot，再启动前端 Vite 项目。  
2. **日志与排查**：
   - AI 调用相关日志可在 `AiUtils` 中加打印，注意避免泄露密钥；
   - 常见错误包括：鉴权失败（`AuthContext.userId` 为空）、AI 网关超时、JSON 解析失败等。
3. **重置测试数据**：
   - 可通过调用 `/api/target-job/me` DELETE 与 `/api/path-plan/me` DELETE 清空当前用户的目标岗位与路径规划；
   - 前端首页也提供“清空当前用户规划数据（测试用）”按钮，同时清理后端与浏览器 localStorage。

如需进一步扩展，请在现有 Controller / Service / Mapper 结构上迭代，避免重复造轮子。
