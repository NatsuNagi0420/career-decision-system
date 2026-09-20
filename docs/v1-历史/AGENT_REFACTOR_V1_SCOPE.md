# Agent 化重构 V1 范围说明

> 目标：把当前“带 Agent 后端能力的职业规划系统”，重构成用户能明显感知的“职业规划与求职执行 Agent”。
>
> 原则：不做全量重写，不切换主语言，不推翻现有业务系统；先把 Agent 架构、Skill 体系、可见化执行链路和自托管边界重构出来。

## 1. 前提判断

当前项目不是“完全没有 Agent”，而是：

- 后端已经有 LangGraph / 工具规划 / 审批 / Proposal / 模型网关雏形；
- 但前端和产品体验仍更像普通聊天助手；
- Agent 能力隐藏在后端，用户看不到任务分解、工具调用、证据来源、成果物生成和确认执行过程；
- 职业规划、简历、JD 匹配、面试准备等能力还没有被组织成可扩展 Skill。

所以 V1 重构重点不是“重写项目”，而是“Agent 产品化”。

## 2. V1 重构目标

V1 完成后，项目应该具备以下形态：

```text
用户提出职业/求职目标
  ↓
主 Agent 识别任务类型
  ↓
选择一个或多个 Skill
  ↓
生成计划和待确认动作
  ↓
调用只读工具收集上下文
  ↓
基于证据生成建议/材料/行动方案
  ↓
前端展示 Timeline、证据、Skill 输出、待确认 Proposal
  ↓
用户确认后，由 Spring Boot 执行业务写入
```

## 3. 第一优先级：Agent Server 重构

### 3.1 拆分当前大 Graph

当前核心文件：

```text
D:/Project/career-decision-system/agent_server/app/agents/career_decision/graph.py
```

问题：

- 分类、计划、工具执行、综合、Proposal 构造、Approval 都集中在一个文件；
- 后续新增简历、JD、面试、求职计划 Skill 时会继续膨胀；
- 不利于模型评测和单元测试。

建议拆成：

```text
agent_server/app/agent_core/
  state.py              # AgentRunState / Event / Task / Artifact 的通用状态
  orchestrator.py       # 主 Agent 编排器
  router.py             # 用户意图 → Skill 选择
  planner.py            # 任务计划生成
  executor.py           # Skill 执行与工具调用
  evidence_guard.py     # 证据约束、反幻觉校验
  approval_gate.py      # 需要用户确认的动作
  proposals.py          # Proposal 结构和生成器
  checkpointer.py       # InMemory / SQLite / Postgres 检查点抽象

agent_server/app/skills/
  career_profile/
  career_direction/
  resume_builder/
  jd_match/
  interview_prep/
  job_search_plan/
```

### 3.2 引入 SkillSpec

每个 Skill 至少声明：

```text
skill_id
name
description
input_schema
output_schema
allowed_tools
required_context
risk_level
requires_approval
recommended_models
```

第一批 Skill：

| Skill | 作用 | V1 是否做 |
|---|---|---|
| career_profile | 职业画像诊断 | 做 |
| career_direction | 职业方向对比与决策 | 做 |
| resume_builder | 简历生成/优化 | 做基础版 |
| jd_match | JD 匹配与差距分析 | 做基础版 |
| interview_prep | 面试问题与回答策略 | 做基础版 |
| job_search_plan | 求职行动计划 | 做基础版 |

### 3.3 模型路由重构

当前文件：

```text
D:/Project/career-decision-system/agent_server/app/llm/gateway.py
D:/Project/career-decision-system/agent_server/app/llm/capabilities.py
```

需要升级为：

```text
model registry
model capability matrix
skill recommended model
fallback model
structured output reliability check
local model / paid model routing
```

目标不是立即接很多模型，而是让系统知道：

- 哪些任务可以用本地模型；
- 哪些任务建议使用付费模型；
- 哪些模型不适合复杂工具调用；
- 输出 JSON 不稳定时如何兜底。

### 3.4 Checkpointer 重构

当前使用：

```text
InMemorySaver
```

问题：

- 服务重启后线程状态丢失；
- 不适合生产部署；
- 不适合自托管长期会话。

V1 建议先做抽象：

```text
CHECKPOINTER_PROVIDER=memory/sqlite/postgres
```

第一步可以保留 memory，但接口先拆出来，后续换 SQLite/Postgres。

## 4. 第二优先级：Backend 重构

当前 Spring Boot 的价值是：

- 用户鉴权；
- 业务数据库；
- 权限边界；
- Proposal 最终写入；
- 不让 Agent Server 直接改业务库。

这个分层是正确的，不要推翻。

### 4.1 统一 Agent Run 业务边界

当前前端主要走：

```text
/chat/messages
```

Agent Run 另有：

```text
/api/v1/agent-runs/career-decision
/api/v1/agent-runs/{threadId}/resume
/api/v1/agent-runs/proposals/{proposalId}/apply
```

V1 要逐步统一为：

```text
用户发送消息
  ↓
Backend 创建/恢复 Agent Run
  ↓
Backend 组装可信上下文
  ↓
Agent Server 运行
  ↓
Backend 保存 run/events/proposals/artifacts
  ↓
前端展示
```

### 4.2 Proposal Apply 类型化

当前 Proposal Apply 已有雏形，但需要继续补：

- typed proposal payload；
- action allowlist；
- 幂等 key；
- 权限校验；
- 审计日志；
- 执行失败回滚/错误说明；
- 前端可读的执行结果。

V1 先支持安全动作：

```text
add_candidate
collect_evidence
create_resume_draft
create_interview_plan
create_job_search_task
```

高风险动作继续禁止直接执行。

### 4.3 Agent Run 数据模型增强

需要保存：

```text
run_id
thread_id
user_id
skill_id
status
events
model_used
token_usage
cost_estimate
proposals
artifacts
created_at / updated_at
```

V1 可以先保存 events/proposals/artifacts，成本统计后置。

## 5. 第三优先级：Frontend 重构

当前核心文件：

```text
D:/Project/career-decision-system/web/src/pages/Assistant.vue
D:/Project/career-decision-system/web/src/api/assistant.ts
```

问题：

- 页面更像普通聊天；
- Agent timeline、Skill、工具调用、证据、Proposal 不够可见；
- 生成成果物没有成为一等 UI 对象；
- 用户难以感知“它在替我执行职业规划任务”。

### 5.1 页面形态重构为 Agent Workspace

建议改成三栏：

```text
左侧：会话 / 任务 / 职业目标
中间：对话 + Agent Timeline
右侧：Skill 输出 / 证据 / Proposal / 成果物
```

### 5.2 组件拆分

```text
web/src/pages/AgentWorkspace.vue
web/src/components/agent/AgentTimeline.vue
web/src/components/agent/SkillRunCard.vue
web/src/components/agent/EvidencePanel.vue
web/src/components/agent/ProposalPanel.vue
web/src/components/agent/ArtifactPanel.vue
web/src/components/agent/ModelBadge.vue
web/src/api/agentRuns.ts
```

### 5.3 用户可感知的 Agent 行为

前端至少展示：

- 正在识别任务；
- 选择了哪个 Skill；
- 调用了哪些工具；
- 使用了哪些证据；
- 生成了哪些候选方案；
- 哪些动作需要用户确认；
- 最终生成了什么成果物。

## 6. 第四优先级：自托管与云端边界

为了支持“网页登录付费使用 + 本地自部署”，需要补：

```text
docker-compose.selfhosted.yml
deploy/self-hosted/.env.example
docs/SELF_HOSTED_DEPLOYMENT.md
docs/SAAS_SELF_HOSTED_PRODUCT_PLAN.md
```

V1 自托管目标：

```text
git clone
cp deploy/self-hosted/.env.example .env
填写 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
docker compose -f docker-compose.selfhosted.yml up
打开网页使用 Agent
```

## 7. 不建议现在做的事情

### 7.1 不建议整体换成 TypeScript Agent 框架

理由：

- 当前 Agent Server 已经是 Python + LangGraph；
- Python 在 LLM/Agent/数据处理生态里依然更方便；
- 前端已经是 TypeScript，没必要把 Agent 后端也迁移；
- 现在换语言会拖慢主线，且不能直接解决“产品不像 Agent”的问题。

TypeScript 可以用于前端、插件 SDK、可视化工作流，但不是 V1 的主线。

### 7.2 不建议先做复杂多 Agent

V1 推荐：

```text
一个主 Agent + 多个 Skill
```

不是：

```text
很多自治 Agent 互相对话
```

后者更炫，但更难控制成本、质量和安全。

### 7.3 不建议先做完整计费系统

计费是 Cloud SaaS 的必要能力，但 V1 Agent 化重构应优先解决：

- Agent 架构；
- Skill；
- 前端可见执行过程；
- 自托管配置；
- 模型路由。

计费可以放在 V2/V3。

## 8. 推荐实施顺序

### Sprint 1：Agent Core 骨架

- 新增 `agent_core` 目录；
- 定义通用 AgentRunState / SkillSpec / AgentEvent / Artifact；
- 把 career decision graph 中的 proposal、evidence、approval 逻辑拆出来；
- 保持现有接口兼容。

### Sprint 2：Skill Registry

- 实现 Skill Registry；
- 接入 career_direction Skill；
- 新增 resume_builder / jd_match / interview_prep 的基础 SkillSpec；
- 每个 Skill 先输出结构化结果，不急着写数据库。

### Sprint 3：Agent Workspace UI

- 新建 Agent Workspace 页面；
- 接入 Agent Run API；
- 展示 Timeline、Evidence、Proposal；
- 保留旧 Assistant 页面作为 fallback。

### Sprint 4：自托管 MVP

- Docker Compose；
- `.env.example`；
- 本地模型/远程模型配置说明；
- 健康检查；
- README。

### Sprint 5：模型评测与质量门槛

- 建立 20—50 个职业规划/简历/JD/面试样例；
- 对本地模型与付费模型做对比；
- 形成模型推荐矩阵。

## 9. V1 成功标准

V1 不以“代码改动很多”为成功标准，而以用户体验是否像 Agent 为标准：

- 用户能看到 Agent 的任务计划；
- 用户能看到 Skill 调用过程；
- 用户能看到证据来源；
- 用户能确认或拒绝 Proposal；
- 用户能获得简历/JD/面试/求职计划等成果物；
- 系统仍然保留 Spring Boot 权限和业务写入边界；
- 自托管用户能配置自己的模型使用。

## 10. 最小落地范围建议

如果只做第一版，建议范围收敛为：

```text
一个主 Agent
+ 三个 Skill：职业方向决策、简历优化、JD 匹配
+ Agent Timeline UI
+ Proposal 确认 UI
+ 自托管模型配置文档
```

这个范围最能体现“Agent 应用”，也不会一次重构过大。
