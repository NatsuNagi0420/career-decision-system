# 职业决策教练 Agent 架构重构说明

> 文档版本：v0.1（2026-09-15）
>
> 目标：把项目从“多个 LLM 功能接口”推进为一个以职业决策为中心的、可调用工具、有持久状态、有人机确认、有证据约束和执行闭环的 Agent 应用。

## 1. 先校正一个前提：什么才算 Agent

当前项目并非“完全不是 Agent”。原有系统已经具备 LangGraph、结构化输出和规则基线，但主要模式是：

```text
规则基线 → 可选 LLM 改写 → JSON 校验 → 返回
```

这更准确地称为 **LLM 增强型业务工作流**。真正需要补齐的不是更换 Python/TypeScript，而是 Agent runtime 的闭环：

```text
目标理解 → 选择并调用工具 → 根据工具结果继续推理/行动 → 生成提案 → 用户确认 → 业务后端幂等执行 → 复盘
```

## 2. 目标定位

产品定位为：

> 受控型职业决策教练 Agent（Controlled Career Decision Coach Agent）

它不应是“替用户自动决定职业”的黑盒，也不应拥有直接写库权限。它负责：

- 理解当前职业决策问题；
- 读取经后端鉴权装配的可信上下文；
- 判断信息缺口和候选方向；
- 组织证据、反对因素、不确定性和验证动作；
- 输出可解释的行动提案；
- 等用户确认；
- 将确认结果交回 Spring Boot 进行权限校验、幂等写入和审计；
- 根据任务结果和复盘重新规划下一步。

## 3. 当前已实现与尚未实现

### 3.1 已实现（本轮）

- `classify_request`：任务识别节点；
- `plan_tools`：基于任务焦点、可信上下文和已收集结果规划下一步只读工具；
- `execute_next_tool`：真实工具调用循环；
- 工具结果和 `source_refs` 进入 Agent State；
- 规则基线和可选模型增强；
- 模型网关，兼容本地 OpenAI-compatible endpoint 和未来付费模型；
- `interrupt()` 人工确认；
- `resume` 恢复执行，且必须提交与待确认 proposal 匹配的 `approvalId`；
- `approval_required / completed / cancelled / failed` 状态；
- 用户确认前只产生 proposal，不直接写业务数据库；
- proposal 现在包含 `proposalId`、`projectId`、完整 `proposalType` 和机器可读 `payload`，便于 Spring Boot 做幂等 mutation；
- checkpoint-safe 的 JSON State；
- Agent Run、节点、工具调用、人工确认事件；
- Spring Boot 首次运行代理：后端按登录用户装配 `project`、`decision_context`、`available_directions` 和 `allow_external_model`，不信任浏览器传入的上下文或外部模型开关；
- Spring Boot resume 代理：基于已记录的 `agent_runs.output_json.threadId` 校验线程归属，只向 Agent Server 转发 `request_id`、`user_id`、`approval_id`、`approved`、`note`；
- Spring Boot proposal apply 脚手架：新增 `agent_proposal_applications` 表，按 `requestId` 幂等，当前支持 `add_candidate` 和 `collect_evidence` 两类安全写入；
- `add_candidate` proposal 已改为优先使用具体候选建议名、推荐理由、反对因素、不确定性和验证动作，避免把通用行动标题写成候选名；
- `collect_evidence` proposal 已尝试绑定缺少证据的候选，并携带 `candidateId`、`candidateName`、`evidenceTitle`、可信度和立场默认值；
- 基础测试覆盖工具预算、模型降级、source refs 过滤、Agent API 流程、payload 生成和后端 run/resume/apply 安全边界。

### 3.2 尚未实现（生产前必须补齐）

- 独立的 Agent thread / approval 归属表；当前 resume 归属校验仍依赖扫描 `agent_runs.output_json.threadId`；
- `approval_id` 与 proposal 的持久绑定、TTL、过期取消和并发 resume 防重入；
- proposal apply 仍是脚手架，只支持 `add_candidate`、`collect_evidence`；`create_task`、`adjust_task`、`review_target`、`compare_candidate`、`validate_assumption`、`clarify_question` 需要先补齐稳定 payload schema 和业务服务映射；
- Agent Server 长流程中的上下文刷新；当前首次运行由 Spring Boot 代理装配可信快照，后续若需要多轮读取，应新增内部鉴权的只读 Assistant Context API；
- SQLite/Postgres 等持久化 checkpointer；当前是进程内 `InMemorySaver`；
- 多实例共享 Agent 状态；
- SSE/WebSocket 事件流；
- Promptfoo/Langfuse 等离线评测与观测集成；
- 真实岗位知识库和带来源检索；
- 模型能力探测及不同模型的对比基准。

## 4. 推荐的目标架构

```text
Vue / Android
      │ HTTPS
      ▼
Spring Boot 业务后端
  ├─ 登录、用户和资源权限
  ├─ 职业项目/候选方向/证据/岗位/任务/复盘
  ├─ Agent Run 会话和 approval 归属
  ├─ 只读 Assistant Context 装配
  └─ proposal 审批后的事务性 mutation
      │ 内网鉴权 + trace/run id
      ▼
FastAPI Agent Server（Python）
  ├─ Agent API / resume API
  ├─ LangGraph Runtime
  │   ├─ State / checkpoint
  │   ├─ tool loop
  │   ├─ interrupt / resume
  │   └─ event protocol
  ├─ Tool Registry
  │   ├─ read-only context tools
  │   ├─ evidence / job / plan tools
  │   └─ proposal builders（不写库）
  ├─ Model Gateway
  │   ├─ 本地 llama.cpp / OpenAI-compatible
  │   ├─ 付费模型 adapter
  │   └─ fallback / routing / budget
  └─ Eval / Trace Exporter（可选）
      │
      ├─ 本地模型目录：D:\IDE\llama-b10037-bin-win-cuda-13.3-x64\Models
      ├─ 本地服务：http://127.0.0.1:8081/v1
      └─ 后续：LiteLLM / Langfuse / Promptfoo / LlamaIndex
```

### 4.1 三类边界

| 类型 | Agent 是否可执行 | 例子 | 规则 |
|---|---:|---|---|
| Read-only tool | 可以 | 读取项目、候选方向、个人证据、岗位样本、计划、复盘 | 后端鉴权；只返回本次 run 所需最小字段 |
| Proposal tool | 可以生成 | 建议新增候选方向、补充证据、安排验证任务 | 只生成 proposal；必须带 proposalId、projectId、类型、payload、source refs、理由和验收标准 |
| Mutation API | Agent 不直接执行 | 创建任务、修改状态、写入证据、更新计划 | 由 Spring Boot 在用户确认后校验权限、幂等执行并审计 |

### 4.2 当前后端代理边界

当前代码已经把浏览器和 Agent Server 隔开了一层：

```text
Browser / App
  → Spring Boot /api/v1/agent-runs/career-decision
      → 后端读取项目、候选方向、用户授权、决策上下文
      → FastAPI Agent Server /api/v1/agent-runs/career-decision
      → 返回 approval_required + proposal + threadId + agentRunId

Browser / App
  → Spring Boot /api/v1/agent-runs/{threadId}/resume
      → 后端校验 threadId 属于当前用户
      → FastAPI Agent Server /api/v1/agent-runs/{threadId}/resume

Browser / App
  → Spring Boot /api/v1/agent-runs/proposals/{proposalId}/apply
      → 后端从 agent_runs.output_json 读取已存 proposal
      → 后端按 requestId 幂等执行白名单 mutation
```

这一步很关键：**浏览器可以表达用户意图，但不能伪造项目上下文、用户授权、外部模型许可或待写入 payload**。下一步应把 `threadId / approvalId / proposalId` 从 JSON 扫描升级为专用归属表。

## 5. State 设计

当前 `CareerDecisionAgentState` 已改为 JSON 形状，避免 checkpoint 反序列化项目自定义类型。长期建议将 State 视为公共运行时协议：

```python
{
  "run_id": "...",
  "thread_id": "...",
  "request": {...},
  "goal": {...},
  "tool_queue": ["get_candidates", "get_job_samples"],
  "tool_results": [{"tool_name": "...", "payload": {...}, "source_refs": [...]}],
  "evidence_ledger": [{"statement": "...", "source_refs": [...]}],
  "assumptions": [{"text": "...", "status": "unverified"}],
  "response": {...},
  "approval": {...},
  "events": [...],
  "budget": {"max_tool_calls": 8, "used_tool_calls": 5}
}
```

注意：

- 不把简历全文、聊天原文、手机号、邮箱放入普通事件日志；
- State 中应尽量只保存本次决策需要的最小上下文；
- `thread_id` 不应由浏览器任意指定；当前 resume 已由 Spring Boot 基于存档 run 做用户范围校验，生产应升级为专用 thread/approval 表；
- 生产 checkpointer 需支持 TTL、加密、备份、并发控制和按用户删除。

## 6. 工具层设计

工具注册表参考了 Career-Agents / MCP 的“显式工具目录”思想，但不应直接复制它们的业务代码。

建议工具契约至少包含：

```json
{
  "toolName": "get_job_samples",
  "status": "success",
  "payload": {},
  "sourceRefs": ["job:801"],
  "retrievedAt": "2026-09-15T...",
  "policy": {"readOnly": true, "userScoped": true}
}
```

工具调用必须：

1. 在服务端固定白名单；
2. 限制单次调用数和总运行时间；
3. 对结果做大小限制；
4. 记录工具名、状态、耗时和来源数量，而不是敏感正文；
5. 工具失败时返回可解释状态，不让模型伪造成功；
6. 后续接 Spring Boot read-only endpoint，Agent Server 不直接连业务数据库。

## 7. Agent 主循环

当前最小闭环：

```text
classify_request
  → plan_tools
  → execute_next_tool
  → plan_tools（根据新结果重新规划）× N
  → synthesize_decision
  → enhance_decision
  → draft_approval
  → interrupt / resume
  → finalize 或 cancel
```

当前 `plan_tools` 已按信息缺口进行受限动态规划：

- 固定优先读取项目概览和用户非敏感画像；
- 只有存在候选、个人证据或岗位样本时才读取对应集合，避免无意义空调用；
- 请求行动计划/任务执行时，且后端提供计划上下文，才读取 `get_action_plan`；
- 请求复盘/回顾时，且后端提供复盘上下文，才读取 `get_weekly_review`；
- 每轮只执行一个工具，工具结果回到 State 后再次规划；
- 受 `max_tool_calls` 限制，并记录 `missing_information` 与 `stop_reason`。

这里的“动态”采用**受限策略路由**，而不是让模型任意生成工具名。未来可以让模型提出任务意图，但仍必须经过 `ToolPlan` schema、注册表和预算校验。

## 8. 模型策略

语言选择的结论：暂不整体从 Python 迁移到 TypeScript。Python + LangGraph 更适合当前 Agent runtime 和评测生态；TypeScript 保留给前端和必要的 Web/MCP 适配层。真正需要解决的是模型能力差异：

- 本地模型通常成本低、隐私好，但结构化输出、长上下文、工具调用稳定性和中文细节可能弱于付费模型；
- 付费模型通常质量和稳定性更强，但会增加成本、隐私和供应商依赖；
- 不能凭模型名称推断一定更好，必须用同一评测集比较。

建议网关路由：

```text
简单分类/改写       → 本地模型
结构化决策草稿      → 本地模型 + 严格 schema 重试
复杂冲突/低置信度    → 用户同意后使用付费模型
敏感简历/聊天原文    → 默认本地或脱敏后再外发
```

模型上线门槛建议：

- schema pass rate；
- tool-call success；
- unsupported claim rate；
- source/citation coverage；
- 人工质量分；
- P50/P95 延迟；
- 失败降级率；
- 单请求成本。

这些是验收指标建议，不是已经测得的事实。

## 9. 开源能力如何融入，而不是堆项目

| 参考项目 | 借鉴能力 | 在本项目中的落点 |
|---|---|---|
| Career-Agents | division、workflow registry、职业能力地图、多入口 | `domain/career_catalog`、职业方向包和 workflow registry |
| Compass | 证据→方向→缺口→计划→复评 | 职业决策 Agent 的主闭环 |
| MyOfferAgent | 分析/事实保护/提案确认 | proposal + approval + Spring Boot mutation |
| JobSync | 岗位快照、申请/任务状态 | 只读 job snapshot tool 和任务状态工具 |
| JobFit-AI | 确定性匹配、可解释评分 | 规则评分节点，LLM 只做解释与验证建议 |
| LangGraph | State、条件路由、checkpoint、interrupt | 当前 Agent runtime |
| LlamaIndex | 文档索引、混合检索、引用 | 后置职业/岗位知识库，不阻塞 MVP |
| LiteLLM | 多模型适配、路由、成本/fallback | 模型数量增多后接入 gateway 后端 |
| Promptfoo | 固定案例、断言、红队、模型对比 | 离线 eval runner 和发布门禁 |
| Langfuse | run/node/tool/model/retrieval 轨迹 | 脱敏 trace exporter，可选自托管观测 |

原则：吸收**能力模式和边界设计**，不要直接拼接十个项目的 runtime。

## 10. 分阶段推进

### Phase 1：Agent 最小闭环（当前）

验收：

- 一个请求能完成工具读取、决策草稿、人工确认、resume；
- 工具结果可追溯；
- 模型失败自动回退；
- 不调用业务写入 API；
- 浏览器提交的上下文和外部模型开关不会被后端信任；
- resume 时后端校验 `threadId` 属于当前用户；
- proposal apply 具备幂等表和最小白名单 mutation；
- 当前 Python 测试、新增 Agent 测试和后端 Agent Controller 测试需全部通过。

### Phase 2：真实业务工具和安全闭环

- 建立专用 `agent_threads / agent_approvals` 归属表，替代从 `agent_runs.output_json` 扫描；
- Spring Boot 暴露用户范围内的只读 Assistant Context API，用于长流程上下文刷新；
- Agent Server 使用内部服务鉴权调用只读 API；
- approval 绑定 run/user/project/proposal，并加入 TTL、过期取消和并发 resume 防重入；
- 扩展 `create_task`、`adjust_task`、`review_target` 等 proposal payload schema 与幂等 mutation；
- 禁止 Agent Server 直连业务数据库。

### Phase 3：事件流与持久化

- InMemorySaver 替换为 SQLite/Postgres checkpointer；
- SSE 推送节点/工具/等待确认事件；
- 处理并发 resume、超时、取消和 TTL；
- 事件脱敏和审计留痕。

### Phase 4：知识库和模型评测

- 加入岗位快照、更新时间和来源；
- LlamaIndex 或现有检索组件提供混合检索；
- 扩大职业决策 eval cases；
- 比较本地模型、DeepSeek、通义千问和其他兼容模型；
- 用 Promptfoo 思路设置发布门槛。

### Phase 5：结果闭环和产品化

- 记录用户是否接受/修改建议；
- 记录验证任务是否完成及产出证据；
- 根据复盘重新规划，而不是每次从模板开始；
- 用业务结果评估 Agent，不只看回答好不好看。

## 11. 关键风险

1. **把固定队列误认为动态 Agent**：当前已改为缺口驱动的受限规划，但仍不是完全由模型自主决定；后续需要用评测证明模型辅助规划是否带来稳定收益。
2. **把用户提交的上下文当可信数据**：生产必须由 Spring Boot 装配并做权限校验，不能信任浏览器。
3. **把“用户点击确认”当成数据库写入**：确认只表示同意 proposal，实际写入必须走幂等后端 API。
4. **InMemorySaver 误用于生产**：重启和多实例会丢失状态。
5. **过度依赖模型**：规则评分、来源约束和安全策略必须在模型外执行。
6. **过度观测导致隐私泄露**：追踪系统默认只留摘要、哈希、计数和错误类型。
7. **模型比较偏差**：必须固定相同输入、温度、schema、工具和时间窗口；不能只凭主观体验选模型。

## 12. 当前建议

近期不要迁移 TypeScript，也不要一次性接入所有开源项目。优先完成：

1. 把 `threadId / approvalId / proposalId` 归属从 JSON 扫描升级为专用表；
2. 把 proposal payload schema 稳定下来，并扩展到 `create_task`、`adjust_task`、`review_target`；
3. 将 `InMemorySaver` 换为持久化 checkpointer；
4. 增加 SSE/WebSocket 事件流和运行详情页；
5. 扩充模型对比评测，固定同一套工具、schema、温度和案例；
6. 最后再决定是否引入 LiteLLM、LlamaIndex、Langfuse 等基础设施。

---

## 13. 关联重构蓝图

- 竞品与热门 Agent 项目参考详见：docs/COMPETITOR_AGENT_REFACTOR_PLAN.md。


---

## 关联：单 Agent + Skill 架构

- 专业职业规划 Agent 的 Skill 化架构详见：docs/CAREER_AGENT_SKILL_ARCHITECTURE.md。

