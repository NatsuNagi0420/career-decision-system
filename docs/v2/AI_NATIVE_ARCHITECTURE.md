# v2 AI 原生架构设计

> 地位：v2 的奠基文档。v1 的全部技术栈会被替换，本文档是替换的依据。
> 已定决策：原地清空重写 / 数据层重新建模 / v2 只做桌面 Web / 先设计后编码。
> 2026-09-19 追加：**数据层用 MySQL**；**模型首版接云端 OpenAI-compatible 端点**（配置形态照搬 `agent_server`）。
> 未定项集中在 §11，未定之前不进入实现。

---

## 1. 为什么重写：v1 的事实诊断

以下每条都有 v1 代码位置佐证。不是风格抱怨，是"AI 原生"在结构上不成立的原因。

| 症状 | v1 证据 | 本质 |
|---|---|---|
| 主控权在人不在 Agent | `DashboardService.java:76-88` 五分支 if 链决定"下一步" | 产品脊柱是规则链，Agent 是可选装饰 |
| "自主规划"是关键词表 | `graph.py:139-222` 全是 `_has_any(focus, ("行动","计划"...))` 中文子串匹配；`:238` 一次只敢取 `candidates[:1]` | LLM 从不决定工具序列 |
| 工具不发真实 IO | `decision_tools.py` 7 个工具只投影 Spring 预先塞进请求体的 `request.project` 切片 | "工具调用"是给前端看的表演，没有取数能力 |
| 没有流式 | 全仓 `astream_events`/`StreamingResponse`/`text/event-stream` 零命中；`async def` 端点内调用同步 `graph.invoke`（`api/v1/agent.py:11` → `graph.py:668`）阻塞事件循环；前端一次性等 180 秒 | 时间线是事后重放，不是过程可见 |
| 事件无持久化 | 无事件表，整包塞进 `agent_runs.output_json`，resume 时整列覆盖（`Assistant.vue:605`），靠 `max_length=120` 兜体积 | 无法增量、无法审计中途状态 |
| 线程状态不持久 | `InMemorySaver`（`graph.py:46`），重启后 `resume` 直接 `ValueError`（`:657`） | 长任务与确认等待无处安放 |
| Proposal 落地率 2/8 | `CareerDecisionAgentService.java:188-192`：8 类 proposalType 只有 `add_candidate`/`collect_evidence` 可 apply，其余抛 40972 | Agent "能建议"的远多于"能做到" |
| 评测从不碰真模型 | `test_fixed_coaching_evals.py` 直接断言 `generation_mode == "fallback"`；Agent 测试全部 monkeypatch `generate_structured` | 质量护栏测的是模板，不是模型 |
| 授权是软约束 | `external_ai_consent` 只是塞进 payload 的 `allow_external_model` 旗标，9 个出口都不强制（`CareerDecisionAgentService.java:74` 等） | 边界靠调用方自觉，不靠架构 |

一句总结：**v1 把控制流放在了不该放的地方。** 表单拥有控制流，AI 拥有建议权。这个比例不改，换任何语言都只是复刻。

## 2. 四条设计公理

AI 原生不是"有聊天框"，是这四条在架构上成立。每条都可证伪——§10 给出验收判据。

**公理一：Agent 拥有推进权，人拥有否决权。**
系统的默认状态是"Agent 正在做某件事"，不是"某个页面等你填"。人可以打断、改道、拒绝、接管，但发起和串联是 Agent 的责任。

**公理二：模型决定下一步，代码决定边界。**
哪些动作可发生、需要什么前置、能取哪些数据——由代码硬约束。在这套约束内部选哪条路、调哪个工具、还要不要再查一轮——由模型决定。v1 恰好相反。

**公理三：写入前必须是持久化的可决断状态。**
"需要用户确认"不能是一句提示词恳求。它必须是数据库里一行有生命周期、可被认领、可超时、可审计、可重放的状态（§6.3）。这是三条老边界（模型不写业务库、写入需确认、外呼需授权）中唯一能在架构层面兜住的那一条。

**公理四：成果物是一等公民，不是聊天气泡。**
Agent 工作的产出是 Artifact——有 id、有版本、有状态（draft/approved/committed/rejected）、有来源证据链、可被后续 run 引用。聊天记录只是过程投影，删了不该影响任何成果。

## 3. 核心对象模型

以 Run 为中心重建。取代 v1 的 15 个业务页面表 + `agent_runs` + `agent_proposal_applications`。

```text
User ─┬─ Profile          画像：陈述性事实 + 测评结论，带 provenance
      ├─ Run              一次有目标、有预算、可中断可恢复的 Agent 执行
      │    ├─ Step        模型决定的一次动作单元（thinking / tool / ask / propose）
      │    ├─ Event       append-only 时间线，一次执行的过程真相
      │    ├─ Artifact    产出物：候选清单/对比矩阵/行动计划/简历草稿/周报…
      │    └─ Proposal    待决断的写入意图，引用一个 Artifact
      ├─ Approval         独立状态机：pending→resuming→approved/rejected/timed_out
      ├─ Evidence         带逐字引文的证据，多态归属（profile/run/artifact/candidate）
      └─ Obligation       Agent 承诺过要做的下一步（跨 run 的持久待办，主动性来源）
```

三个关键设计：

**3.1 `Run` 是聚合根，不是日志行。**
Run 有目标文本、预算（最大步数、最大 token、最大外呼次数）、状态（running/awaiting_approval/paused/completed/failed/cancelled）、以及指向 checkpoint 的线程句柄。v1 的 `agent_runs` 只是审计行，改不了控制流。

**3.2 `Event` 与 `Artifact` 分离，且 Event 只追加。**
Event 表 append-only，`(run_id, seq)` 唯一；SSE 帧即 Event 行，前端做纯追加合并而非整包替换。Artifact 独立于 Event 存在。这直接修掉 v1 的整列覆盖 bug，也是 §6.4 流式的基础。
借鉴 Compass：`errors: Annotated[list[str], operator.add]` 而非 last-write-wins——v1 的覆盖式写法会静默丢掉早期节点错误。

**3.3 状态字段按节点分槽，工具事实与模型解释不混存。**
借鉴 Compass `pipeline/state.py` 的 TypedDict 分字段做法。同一个 dict 里既放"JD 原文说了什么"又放"模型认为这意味着什么"，是无法做反幻觉校验的根本原因（§6.6）。

## 4. 上下文事实源

**服务端拥有上下文，客户端只送意图。** v1 这一点做对了，保留：客户端只发 route 元数据和资源 id，服务端校验 ownership 后自行装载（`AssistantContextService`）。v2 把这条升级为硬约束——任何进入模型 prompt 的业务字段都必须由服务端从自己数据库读出，客户端传来的同名字段一律忽略。

**工具改为 Agent 主动拉取。** 每个工具是服务端的一个带鉴权函数调用，不是请求体切片的投影。这带来三个新问题的能力：Agent 可以发现自己缺信息并去补（而不是等 Spring 预先塞好），可以做真实的目录/岗位检索，可以按需展开深度而不是一开始就压全量。

**上下文预算显式建模。** Run 声明 token 预算；每次工具调用返回带 `truncated` 标记；超预算时降级的不是"截断字符串"而是"换更粗粒度的摘要工具"。

**检索底座必须先于删表存在。** v1 的 `career_directions` 25 行种子散文是当前唯一的推荐知识底座。v2 若要做职业知识，必须先有检索替代（见 §8 向量检索：这个量级不需要向量库），再谈迁移。

## 5. 写入边界与授权

三条边界，全部下沉为代码强制：

1. **模型永不写业务库。** 唯一写入者是 Approval 通过后的确定性 apply 函数。apply 走 allowlist：只有登记过 schema 的 Proposal 类型才可执行，新增类型必须先写执行器再开闸——这条 v1 已有雏形（`AgentProposalApplicationMapper`），是它最扎实的一块，直接继承设计。
2. **`external_ai_consent` 是门，不是旗标。** v1 把它当 payload 布尔值传给下游且无人检查。v2：模型网关入口检查，无有效授权时间戳则只走确定性路径并明确标注 `generation_mode=fallback`；检查点在网关而非调用方，调用方无法绕过。
3. **脱敏在唯一构造点。** 借鉴 Compass 的 `Langfuse(mask=_langfuse_pii_mask)`：日志/追踪 sink 构造时就带掩码器，而不是每条日志手工洗。v1 的 `SENSITIVE_KEYS` + 正则清单（`AgentRunService.java:42-69`）内容可移植，机制要改。

## 6. 关键机制

### 6.1 主循环：把规划权真正交给模型

```text
run: while step < max_steps and not finished:
       policy = model.plan(state, available_tools, budget_left)   # 模型决定
       enforce(available_tools, budget, risk_ceiling)             # 代码否决
       execute(policy) → append Event
       finished | stuck → 收敛
```

代码侧的 `enforce` 是 allowlist + 预算 + 风险上限；模型侧是真正多步的 `tool_calls`。`is_stuck` 借鉴 OpenManus（重复检测后注入"换策略"提示，`base.py:170-186`），但 v2 有真实预算，所以卡住的首要出口是停止并向人提问，不是继续烧钱。

### 6.2 确认门：这是 v2 成立与否的支点

采用 Compass 已验证的三件套，这是本次调研最重要的单项结论：

```text
节点内  interrupt({"kind":"approval_request", proposal_id, ...})
状态表  approvals(thread_id PK, status CHECK IN(pending,resuming,approved,rejected,timed_out,error),
                  decided_by, feedback, created_at, resolved_at) + (status,created_at) 索引
恢复    ainvoke(Command(resume={"approved", "feedback"}))
```

三个细节决定成败，全部来自 Compass 踩过的坑（`hitl/state_store.py`）：
- **`claim_pending()` 用 rowcount 做单写者原子认领**（`:165-188`）：超时清理器与用户点"采纳"可能同时通过 `get_pending` 命中同一条，双写会腐蚀 checkpoint。
- **终态按图最终 state 判定，不按输入 decision 判定**（`resume.py:66-71`）：否则审计说的和用户看到的会分歧。
- **确认状态表与 checkpoint 库分开**：checkpoint 是执行现场，可清理；确认历史是审计真源，不可清理。

为什么这条是关键：一旦"待确认"变成持久可决断状态，checkpoint 就有了必须存在的理由，流式就有了"等待确认"这个真实节点，Artifact 就有了 approved/rejected 生命周期。缺它，§5 的三条边界只能靠提示词恳求。

### 6.3 流式与持久化

- LangGraph `astream_events(version="v2")` → SSE。事件行先落库再推送（保证断线可续，且刷新页面能重放）。
- Checkpointer 走 MySQL（§8），但**接口先抽象成一个 provider 开关**，因为该实现是社区单作者维护、且未声明通过一致性测试。Day-1 动作：跑官方 `checkpoint-conformance` 套件验它，重点是 `put/wal` 并发写、`get_tuple` 部分写恢复、以及 msgpack 序列化往返。
- 无论用哪个后端，msgpack 序列化坑一样存在：Pydantic 状态需 `JsonPlusSerializer(allowed_msgpack_modules=[...])` 且必须构造时传入，`with_msgpack_allowlist` 对默认非 STRICT 是 no-op（Compass `graph.py:67-79` 踩过）。
- 部署约束：**首版单进程**（uvicorn workers=1）。多 worker 下 MySQL checkpointer 的行锁竞争与"超时清理器 vs 用户点采纳"的竞面同时存在，而 §6.2 的 `claim_pending()` 只能治后者。要横向扩再说。

### 6.4 证据格式

采用 Compass 的最小可用形状（`pipeline/state.py:57`，prompt 在 `nodes/score.py:131-135` 强制）：**evidence 是 `技能名 → JD 中 5–15 词逐字引文` 的映射**。不要求模型复述、不要求句号，只要求逐字。前端证据面板按引文反查原文可视化，捏造立刻可见。

### 6.5 反幻觉：数字白名单 + 回退原文

采用 MyOfferAgent 的代码级机制（`lib/agents/fabrication.ts:30-40`、`tools/resume-tools.ts:428-448`）：维护原文与上下文中的数字 token 白名单，改写结果出现白名单外的数字即判捏造，并**回退为原文**而非交给模型自查。
配合输入侧 `sanitize.ts:59-83` 的三个实测结论：先截断再跑正则（60k 输入正则成本 7.9s）、把 `<<<`/`>>>` 折叠成 `<<`/`>>`（防逃出围栏，且刻意只折 3+ 以免破坏正常代码文本）、剥离 "ignore previous instructions"。
需要修正 v1 文档的一处不实描述：MyOfferAgent 的"写入前确认"只有 prompt 级，`commit()` 是直写的，**没有可借鉴的 Proposal 结构**——确认机制以 Compass 为准。

### 6.6 缺证据时返回 provisional

采用 Career-Agents 的确定性 readiness（`services/readiness.js:396-408`）：`dataCoverage < 40` 时 `isProvisional: true`，`confidence = min(100, 15 + dataCoverage*0.85)`，纯分数无技能证据时 confidence 给 0。要点是让"我没依据"成为契约里的显式字段，而不是靠模型自觉承认。v1 的 `generationMode` 已有雏形，v2 补上数据覆盖率维度。

### 6.7 模型网关：首版接云端，但 v1 的客户端不能直接搬

配置形态照搬 `agent_server`，代码不行。已核实的 v1 现状（`app/services/llm_client.py`、`app/config/settings.py`）：

**可以照搬**（这四块是设计良好的，换栈不损失）：
- `settings.py` 的 pydantic-settings 形态与 `OPENAI_COMPATIBLE_PROVIDERS` 白名单（含 `deepseek` / `qwen`）；
- `llm_readiness_issue()` 与 `internal_token_readiness_issue()` 的"生产环境拒绝 mock provider、token 最短 16 字符"式 fail-fast 校验——纯函数返回错误字符串，好测；
- `_post_with_retries` 的重试策略：仅对 `{429,500,502,503,504}` 重试、指数退避 `base * 2**attempt`、`sleeper` 与 `transport` 可注入以便无网络测试；
- `default_base_url()` 的 DeepSeek / DashScope / OpenAI 端点映射。

**必须重写**（缺的恰好是 AI 原生依赖的那半条腿）：

| v1 缺什么 | 证据 | 为什么在 v2 是阻塞项 |
|---|---|---|
| **无 tool-calling** | payload 只有 `model/messages/temperature`，响应只读 `choices[0].message.content`，全文无 `tools` 字段 | §6.1 把规划权交给模型，靠的就是模型原生返回 `tool_calls`。这块不存在，主脊就还是得用 if/else 冒充——正是 v1 的根因 |
| **同步阻塞** | `httpx.Client`（`:93`），`complete()` 返回完整字符串 | v2 节点是 async，且 §6.3 要 `astream_events` → SSE |
| **无流式** | 无 chunk 解析、无 `data: [DONE]` 处理 | 时间线要边跑边出，不能等 180 秒 |
| **不读 `usage`** | 响应里 `usage` 被整个丢弃 | §6.1 的 token 预算与 A6 的成本可见性无法实现 |
| **结构化输出不强制** | `gateway.py` 只做"从文本里抠 JSON"，无 `response_format`/schema 约束 | 解析失败率直接决定 Artifact 能否落地 |
| **授权不在网关** | 客户端不知道 `external_ai_consent` 的存在 | §5 第 2 条要求检查点落在网关，调用方不可绕过 |

落地次序：先写一个带 `tools` + `stream` + `usage` 的异步网关，再用 §10 的 A3/A8 验它。`capabilities.py`（v1 的死代码，`tool_calling/streaming/vision` 恒为 `False`）不要搬——能力位必须由启动时对端点做真实探测得出，不能查硬编码表。

#### 首版模型：`deepseek-v4.1-flash`

2026-09-11 发布（写本文档时仅 8 天大）。文档级宣称：1M 上下文、支持 Tool Calls 与 JSON Output、支持图片输入、非专用推理模型、V4 Pro 请求自 09-14 起路由到它；价格 ¥0.02–8/M tokens 且**分峰谷时段**；同一模型也可经阿里云百炼以兼容模式访问。

三条必须落到设计里的判断：

1. **"JSON Output" 不等于严格 schema 约束。** DeepSeek 口径的 JSON Output 历来指 `response_format: {"type":"json_object"}`，即"保证是合法 JSON"，不保证字段与枚举符合你的 schema。所以 §6.7 的 Pydantic 校验和"解析失败→重试一次→降级确定性路径"这条链**不能被省掉**，v1 在这里的做法是对的，只是它当时没有真实模型可测。别按 `json_schema strict` 设计，除非 spike 证明支持。
2. **峰谷计价 + 1M 上下文，让 §4 的预算建模从装饰变成必需。** 一个多轮工具循环的 Run 可能把全部画像与岗位目录反复带进上下文，费用差异是百倍量级。Run 必须记录 `usage` 并按输入/输出/缓存命中分列，且前端要显示成本。
3. **1M 上下文有反向风险**：它让"一股脑全塞进去"在成本上看似可行，从而掩盖"缺信息"这件事——而 §6.6 的 `dataCoverage`/`isProvisional` 与 §4 的按需拉取工具恰恰依赖"承认缺信息"。要显式禁止绕过工具直接灌全量上下文。

顺带解锁一个 v1 表单流做不到的 AI 原生能力：**图片输入**意味着学生可以直接甩简历截图、JD 截图、offer 对比截图进来成为 Artifact 的原始来源，不需要先有解析表单。

以上宣称已实测，**结论与修正见 §14**。其中一条比预想的危险：`deepseek-flash` 默认是推理模型，`max_tokens` 设小了会返回**空 content**，看起来像模型没响应从而静默降级到规则基线。

### 6.8 人格与权威分离（穗奈进 system prompt，但只管措辞）

品牌设定 `docs/穗奈角色设定与品牌视觉生成稿.md:92-127` 已自带硬约束，直接采纳为架构规则：穗奈**不是全知导师/招聘官/心理咨询师**，**不保证职业结果、不给唯一正确答案**，**不能用卖萌弱化风险提示**，且"AI 生成的建议仍需遵循产品中的授权、可解释和用户确认规则"。

据此定三条分离规则：

1. **人格只拥有措辞权，不拥有判断权。** `conclusion / evidence / uncertainties / dataCoverage / confidence / generationMode / isProvisional` 全部由代码与工具产出，system prompt 只允许改写呈现语言。任何"让穗奈更自信一点"的提示词调整都不允许触碰这些字段。
2. **风险提示不可被语气软化，且必须结构化在场。** 把 §6.4 的逐字引文、§6.6 的 `missingEvidence` 作为渲染必填项；`isProvisional=true` 时界面与文案都必须显式说"依据不足"。人格可以在它前面加一句"先不用急着选"，但不能替代它、也不能把它改写成模糊的安慰。
3. **口吻基线照抄设定表，不重新发明。** 平等、简洁、具体，"像一起整理思路的同伴"；核心性格温和/细致/清醒/有耐心，擅长提问、归纳、拆分下一步，**不擅长替人拍板**。禁用清单沿用设定 §3.6："听我的，这个职业最适合你""根据 AI 精准计算你应该选这个"、过量语气词、颜文字、网络热梗、幼态称呼。

副作用要认账：拟人化会诱导过度信任，所以 §10 的验收里加一条——A7 的证据可点回与 provisional 显式化不是装饰，是人格带来的信任风险的**唯一对冲**，二者必须同时上线，不允许先上人格后上证据面板。

## 7. 前端形态

**一个 Agent Shell + 少量深链视图，不是 N 个页面。** v1 有 15 个 CRUD 工作区页；v2 的默认界面是 Run 的进行中视图：目标、时间线、当前等待你决定什么。

- 表单只在两种时刻出现：Agent 问你缺的信息；你要手工修正一个 Artifact。表单从"主流程"降级为"确认与微调"。
- 右侧是 Artifact 面板，不是聊天滚动条的延伸。Artifact 可被链接、可被后续 run 引用、可 diff 版本。
- 主动性的载体是 `Obligation`：Agent 承诺的下一步持久化，下次打开时它已经先做了功课（周报草稿、新岗位提示）。这是 Android 端 WorkManager 那个思路的 Web 版本，也是 v1 完全没有的一维——v1 全是 pull 模式。
- 品牌与视觉延续：`docs/品牌形象/` 的穗奈资产、`docs/VISUAL_STYLE.md`、Material 3 视觉规范照用，组件库在新栈重建。

## 8. 技术栈定案与理由

| 层 | v2 | 理由 |
|---|---|---|
| 服务 | **单一 Python 服务**：FastAPI + LangGraph + SQLAlchemy + Alembic | 消除 v1 每个能力写 Java 一遍 Python 一遍的转译税；鉴权/ownership/事务作为单体内模块边界保留 |
| 数据 | **MySQL**（SQLAlchemy + Alembic）承载业务与成果物 | 沿用已定的 MySQL；v1 的 `SQL脚本/` 与岗位 schema 知识直接可用 |
| Checkpoint | **MySQL 存业务，checkpointer 落独立 SQLite 文件**（`langgraph-checkpoint-sqlite` 3.1.1，实测 conformance 5/5 通过）。业务库与执行现场分离，与 §6.2 的"确认状态表独立于 checkpoint 库"同构 | 实测否决了 MySQL checkpointer 路线，见 §14-S2：`langgraph-checkpoint-mysql` 3.0.0 在本机 MySQL 8.0.12 上建表即失败，且第二次 `setup()` 会**静默返回但表不存在**——不能让承载 A5 的组件带这个性质 |
| 向量检索 | **不引入向量数据库**。向量存 MySQL（`BLOB`/`JSON`），应用层暴力算余弦 | 当前语料规模是 25 条职业方向 + 约 800 条岗位，暴力扫全表在毫秒级。等目录破万再谈索引 |
| Web | **React + TypeScript + Vite**，自建 SSE（不引入 LangGraph Server，也不用官方 `useStream`） | `@langchain/react` 1.1.1 的 custom-adapter 分支实测可脱离平台协议（§14-S4），但它要求采纳 `@langchain/protocol` **0.0.19** 的 assistants/runs 词汇与重放语义。我们的事件模型本就独立推出同样性质，接它只多送耦合、不多送能力 |
| 移动 | **v2 不做** | Flutter 与小程序都只是同一 API 的客户端；先验证 Agent 主脊成立 |
| 评测 | **Promptfoo**（自定义 Python provider）+ 后置 Langfuse | Promptfoo 单进程 + 一个 SQLite 即可自托管；Langfuse 自托管要起 web+worker+postgres+clickhouse+redis+minio 六个服务，且 `ee/` 目录单独许可 |
| 小程序 | 推迟，且注意合规前置 | 含生成式 AI 内容需相应备案/审核，是排期风险不是代码风险 |

**为什么换栈在这里成立**：不是因为 Python 更时髦，而是单进程移除了"AI 隔着 HTTP 递建议 JSON"这个结构性隔离。v1 的分层让 AI 天然只能是孤岛——要写数据就得回 Java 加接口，于是每个能力都变成两边各写一半，最后 8 类 Proposal 只有 2 类能落地。

## 9. 从 v1 带走的不变量（重新建模 ≠ 重新踩坑）

选了"重新建模"，所以这张清单是防重复投资的护栏。每条都是调试时间换来的，与语言无关：

1. **乐观锁三处真实生效**：`decision_projects.version`（每次写前 `reserveProjectVersion`，冲突 `40950` 且从不静默合并）、`path_plan_tasks.version`（重排校验每个任务版本）、`user_profiles.profile_version`。⚠️ `path_plans.version` 只自增无 WHERE 判定，是**假锁**——v2 不要复刻。
2. **requestId 幂等共性**：重放返回旧结果、跨对象复用必拒。9 处已在用（`reports` 双检锁、`weekly_reviews` 派生 `requestId-index`、`chat_messages` 按 role 去重允许同请求写 user+assistant 各一条）。
3. **`agent_proposal_applications` 是 exactly-once 事务日志**：先插 `status='started'` 作幂等闩，成功写 `result_json`，重放回放结果并标 `idempotent:true`，三元组不符 `40973`、未完成 `40974`。这个设计 v2 直接继承。
4. **脱敏覆盖清单**：resume_text / message(s) / raw_profile / improved_fragments / password(_hash) / access/refresh/token / authorization / phone / email / id_card，加 Bearer、邮箱、电话正则。内容可移植，机制改为 sink 构造点掩码。
5. **"不确定即中止"而非猜测**：v1 `V7` 存储过程在无法归属用户时 `SIGNAL` 中止而不是猜归属。原地重写同样要留这条。
6. **规则版本化意图要保留，实现可换**：`extractor_version` / `rule_version` / `review_status` / `career_direction_mapping_runs` 是为"抽取可替换且可审计、陈旧映射可确定性重建"刻意设计的。
7. **`jobs` 故意不建 `(source_platform, source_job_code)` 唯一键**：`DATABASE_JOB_SCHEMA_REVIEW.md:31` 记录 800 行仅 799 唯一。v2 不要"顺手补上"。
8. **简历存 `content_hash` 而 `resume_text` 留空** 是去原始文本的既有约束，不是疏漏。
9. **会话删除要连带洗审计并处理跨域引用**：被其它域记录引用时不改写（v1 `DATA_MODEL.md:170` 的取舍）。

## 10. 验收判据：怎么知道它"AI 原生"了

不以代码量为成功标准。每条要么人肉演示，要么写成评测断言。

| # | 判据 | 测法 |
|---|---|---|
| A1 | 用户不提任何问题，登录后系统已在推进一个有具体产出的 Run | 演示：新账号 3 分钟内出现 Artifact |
| A2 | 关掉模型，系统仍产出诚实的 provisional 结果且标注降级 | 断言 `generation_mode=fallback` 时仍带完整契约字段 |
| A3 | Agent 自己决定调用哪些工具、调几轮，序列非代码写死 | 关掉 LLM 时不产生工具调用；日志里 tool 序列随输入变化 |
| A4 | 每个工具调用是真实取数，可返回请求体里没有的信息 | 断言工具能取到初始 payload 未包含的字段 |
| A5 | 断电重启后 awaiting_approval 的 Run 可继续，且不重复执行写入 | 杀进程→恢复→幂等重放，Artifact 数量不变 |
| A6 | 一次 Run 的产出 ≥70% 可被 apply 成真实业务状态，而不是"建议看看" | 统计 proposal 类型的 apply 覆盖率 |
| A7 | 每条 Artifact 主张可点回逐字引文，捏造数字被自动回退 | 注入含数字样本，断言白名单外数字不出现 |
| A8 | 未授权用户的所有外呼为零（网关处强制，非调用方自觉） | 断言网关入口在无 consent 时不产生 HTTP 出口 |
| A9 | 评测跑真实模型且走线上同一批节点函数 | 复刻 Compass `evals/runner.py:97-185` 的教训：直调内部函数测的不是用户实际体验的东西 |

**这条要成为铁律**：评测调用与线上同一批节点函数。v1 评测全 mock、且测的是 coaching 模板函数而非 graph，等于没有质量护栏。

## 11. 未决问题（进入实现前必须定）

1. ~~模型来源~~ **已定并已实测：`deepseek-flash` @ `https://api.deepseek.com`**（§14-S1）。残留：首版要不要供应商回退链（建议不做，先网关层重试 + 失败降级确定性路径）。
2. ~~前端接 LangGraph Server 协议，还是自己发 SSE？~~ **已实测并解出第三选项，见 §14-S4。**
   决定：**走路线 B（自建 FastAPI + 自建 SSE 帧 + 前端自己维护时间线状态机），但线上格式按"未来可加适配器"来设计。**
   落地约束三条（现在就遵守，成本近零，日后省一次重构）：
   - 每帧带 `event_id`（客户端去重）、`seq`（按 run 单调、从 0 起）、`thread_id` / `run_id`。这正是 §3.2 append-only 事件表的天然形状。
   - 服务端为每个 run 维护**有界重放缓冲**：新开的订阅按 filter 从 `seq=0` 重放。断线续传本来就需要它。
   - 事件 kinds 用可判别联合（tagged union），不要用自由 JSON，便于将来一次性映射。
   这样若日后官方协议稳定，写适配器是 ~150 行的加法，而不是改地基。
3. ~~Artifact 类型集合 v2 首批做哪几个~~ **已定：能力面一次设计全（10 个能力域），按 M0–M4 依赖顺序落地**，契约、Artifact 清单与顺序见 `docs/v2/AGENT_CAPABILITY_MAP.md`。原建议的"先做三个"被用户"搭建完整 agent"的要求取代，但落地顺序保留，理由见该文档 §8。
4. ~~Obligation 的触发边界~~ **2026-09-20 已定并已实现**（`app/agent/obligations.py`、`app/db/models.py::Obligation`）：
   - **只有两种触发**：`on_return`（下次回来即可推进）与 `scheduled`（`not_before` 到点之后）。表里**没有 push 通道字段**，也没有 `notified_at`——后台调度器不存在，所以"未经邀请就动"在数据结构层面就不可表达，而不只是被禁止。
   - **自动开跑受冷却限制**：`AUTORUN_COOLDOWN_MINUTES`（默认 30）内只允许一次 `entry_point=obligation` 的 run。它只约束系统自己发起；**人在 feed 里点"接着做"永不受冷却限制**——冷却是为了防止 agent 反复花用户的 token 预算，把限速对着人的点击就成了方向相反的护栏。
   - **需要项目上下文的承诺不会自己开始**：`candidate_source` / `evidence_collect` / `compare_decide` / `action_plan` 的 obligation 若没有 `project_id`，仍列在界面上并写明"要先有一个决策项目"，但 `continuations` 不返回它。选了项目之后人可以手动启动，run 会带上该项目。
   - **拒绝即了结**：`POST /obligations/{id}/abandon`。没有这条的话，agent 写下的承诺只能被花掉、不能被否决。
   - 实测（2026-09-20）：`profile_diagnose` 跑完留下 `direction_explore` 承诺且模型自己要求等 72 小时，期间 `continuations` 返回 `no_due_obligation`；把 `not_before` 挪到过去后刷新页面，无点击自动起 run → 旧承诺 `fulfilled` → 生成更窄的新承诺。
5. ~~穗奈人格是否进 Agent system prompt~~ **已定：进，但受 §6.8 三条分离规则约束**（人格只有措辞权，没有判断权；风险提示不可被语气软化）。
6. **旧库数据是否要迁**：v1 有 `career_db.sql` / `career_decision_system.sql` 与真实 MySQL 数据。若学生试点要复用历史数据，`career_directions` 的 25 行种子知识必须带走。
7. ~~v1 归档点~~ **2026-09-19 已执行四层删除**（用户选择不建 tag）。`web/ backend/ agent_server/ android/` 已从工作树移除，570 个已跟踪文件全部可从 `HEAD`（`3f5cdda`）取回：`git checkout -- web backend agent_server android`。未提交的 2040 行改动、28 个未跟踪新文件、以及 `.env` 等 4 项被 gitignore 忽略的不可再生文件，存于 `backups/v1-uncommitted-2026-09-19/`（patch 需**先 checkout 后 apply**，且 `--exclude=.gitignore`）。
   副作用记录：①`scripts/verify-all.ps1`、`scripts/start-dev.ps1`、`start-dev.bat`、根 `README.md`、`docs/LOCAL_DEVELOPMENT.md` 等仍在描述已不存在的四层，属待清理状态；②`spikes/s1*` 读 `agent_server/.env` 取密钥，该路径已随删除消失，重跑 S1 需先从备份恢复该文件或改指 v2 配置；③MySQL 中的 `career_decision_system` / `career_db` **未动**，数据仍在，删掉的只是访问它的代码。

## 12. 明确不做

- 不做多 Agent 互相对话。一个 Agent + 可扩展工具集。
- 不提前做计费与多租户。自托管单组织优先。
- 不做工作流可视化拖拽编辑器。
- 不复刻 v1 的 15 个页面。
- ~~不引入 SkillSpec 注册表~~ **已反转**：本文原写"等第二个真实能力域出现、被结构逼出来再做"。用户决定一次搭建完整 Agent（10 个能力域），那个"逼迫事件"现在发生了，所以能力声明契约与注册表见 `docs/v2/AGENT_CAPABILITY_MAP.md`。仍然不做的：`agent_core/` 九文件预拆分、模型能力矩阵的硬编码表（§14-S1 要求改成启动时真实探测）。

## 13. 开工前的三个 spike（写代码之前）

v2 的地基上有三处是"文档宣称/生态传闻"，任何一处塌了都会导致中期返工，所以先用最小脚本证伪，不写进产品代码。

**S1 · 模型能力实测**（唯一能证伪 §6.1 主脊的一项）
用真实 `deepseek-v4.1-flash` 端点，测五项：①带 `tools` 的多步循环，模型能否自主决定调用顺序并正确传参；②**并行** tool_calls 是否返回；③工具结果回填后能否收敛（还是无限调用）；④`response_format` 在 `json_object` 与 `json_schema` 两档各支持到什么程度、枚举与 required 违反率；⑤`usage` 与缓存命中字段形状。
判据：30 个职业规划样例上 tool_calls 结构合法率 ≥ 95%，且无失控循环。**不达标就退回"模型只在既定阶段内做选择"的弱主脊，并同步下调 §10 的 A3。**
副作用：真实计费调用（峰谷计价，量级预计远低于 1 元）+ 读取 `agent_server/.env` 的密钥。密钥不外传、不打印、不进日志。

**S2 · MySQL checkpointer 一致性**
把 `langgraph-checkpoint-mysql` 挂到 LangGraph 官方 `checkpoint-conformance` 套件上跑；再手写两个用例：跑到 `interrupt()` 时杀进程重启后 `Command(resume=...)` 能续（A5），以及并发 `put` 不产生半写状态。
副作用：**会在 MySQL 建表**。必须用一个一次性空库（如 `career_v2_spike`），验完删库，绝不写进 v1 的 `career_db`。
退路：任一条不过 → checkpointer 换 SQLite，业务仍留 MySQL（两库分离恰好与 §6.2 的 approvals 独立库设计同构）。

**S3 · React Agent 侧组件成熟度**
一个最小页：SSE 消费 `astream_events` 帧 → 纯追加合并成时间线 → 渲染一个等待确认的 Proposal 卡 → 断线后按 `seq` 续传。核 LangGraph 官方 React 前端 hook 是否真如传闻可用。
判据：不手写状态机就能做到流式 + 断线续传；否则前端自己实现，也不构成换栈理由的撤回。

三个 spike 互不依赖，可并行；预计一轮做完。任一失败都不阻塞另外两个的结论落地。

**2026-09-19：三个都已执行，脚本在 `spikes/`，结果见 §14。**

## 14. Spike 实测结果（2026-09-19）

脚本：`spikes/s1_model_capability.py`、`spikes/s1b_structured_output.py`、`spikes/s2_mysql_checkpointer.py`。原始输出在 `spikes/s1_result.jsonl`、`spikes/s1b_result.jsonl`、`spikes/s2_sqlite.txt`。环境：`spikes/.venv`（Python 3.12，langgraph 1.2.11，与 `agent_server` 同版本）。

### S1 · 模型能力：主脊成立，但发现一个静默失效模式

24 次真实调用 / 10 个用例，`0` 次 HTTP 失败。

| 测项 | 结果 |
|---|---|
| tool_calls 结构合法率 | **100%**（10/10 用例零 schema 错误：无未知参数、无类型错、无枚举越界、无 limit 越界） |
| 多步链式调用 | 通过。三步接地用例 `preload→profile→job_samples×3→compare`，4 轮收敛 |
| **并行 tool_calls** | **支持**，5 个轮次返回了 >1 个 tool_call |
| 失控循环 | 0 例，全部自然收敛 |
| 接地（不编造 id） | 通过。缺 `project_id` 时它**拒绝编造并反问**（用例 c09，是我的断言写严了，模型行为优于断言） |
| 无证据时的诚实 | 通过。证据 fixture 返回 `found:false` 时它答"没有…所以我不会为你补充任何 SQL 方面的经历"；`dataCoverage:34` 被读出并主动降置信度 |
| `response_format: json_schema (strict)` | **不支持**：HTTP 400 `"This response_format type is unavailable now"` |
| `response_format: json_object` | 支持（给够预算时输出合法且字段正确的 JSON） |
| 流式 | 正常，35 chunk，`finish_reason=tool_calls`，tool_calls 在 delta 里增量下发 |
| usage 字段 | 齐全：`prompt_tokens_details.cached_tokens`、`completion_tokens_details.reasoning_tokens`、`prompt_cache_hit/miss_tokens` |
| 经济性 | 全程 prompt 17896 / completion 4031 / **cached 12416（69% 命中）**。DeepSeek 自动前缀缓存对多轮工具循环很有效 |

> **本节最重要的发现（必须写进网关）**：`deepseek-flash` 默认是**推理模型**，`reasoning_tokens` 计入 `max_tokens`。`max_tokens=300` 时 299 个 token 全是思考，`finish_reason=length` 且 **content 为空**；给 2000 则正常（147/194 是思考 token，占 76%；纯提示词约束那条用例 533/559 占 95%）。
>
> 危险在于：一个把 `max_tokens` 设得保守的节点会拿到空 content，形状上**与"模型没返回"不可区分**，于是自动降级到确定性基线。若降级不显式上报，系统会**悄无声息地退回 v1 的规则链**，而 v1 的评测恰好只断言 `generation_mode == "fallback"`——这个组合能长期不被察觉。
>
> 对策三条：①网关把 `finish_reason=length` 且 content 空**当作错误而非空结果**，绝不静默降级；②`max_tokens` 按"含思考预算"设定，默认 ≥1500；③`thinking: {"type":"disabled"}` 实测有效（reasoning_len=0、47 token 出正确 JSON），结构化抽取类节点显式关闭思考，判断类节点保留。

### S2 · MySQL checkpointer：路线否决，SQLite 退路已验实

**MySQL 路径失败，且失败方式不可接受。** `langgraph-checkpoint-mysql` 3.0.0 的迁移 1：

```sql
metadata JSON NOT NULL DEFAULT ('{}')
```

JSON 列的表达式默认值需要 **MySQL 8.0.13+**，本机 server 为 **8.0.12** → `ERROR 1064`。这本身只是版本边界，但真正的红旗是第二跑：迁移 0 已写入 `checkpoint_migrations.v=0`，此后 `setup()` **不报错直接返回，而 `checkpoints` / `checkpoint_blobs` 表根本不存在**（`SHOW TABLES` 只剩 `checkpoint_migrations`）。迁移记账与实际 schema 脱节，直到真正 `aput` 才又抛 1064。一个承载 A5（断电可恢复、重放不重复写入）的组件不能带"静默半完成"这个性质——即使升级 MySQL 绕开语法边界，这个属性仍然在。

**SQLite 路径全绿**（`langgraph-checkpoint-sqlite` 3.1.1）：

- 官方 conformance 套件：**Result FULL (5/5)**，base 能力 `put / put_writes / get_tuple / list / delete_thread` 全通过。
- **崩溃恢复（A5）实测通过**：跑到 `interrupt()` 后 `os._exit(0)` 硬杀进程 → 新进程按同 `thread_id` 取回同 `checkpoint_id` → `Command(resume={"approved":true})` → 最终 `steps == ['preload','gate','finalize']`，**无重复、无已完成节点重跑**。
- 并发写：24 路并行分支，`landed=24 unique=24`，全部落地。
- 已知缺口：extended 能力 `copy_thread` / `delete_for_runs` / `prune` **未实现**。其中 `copy_thread` 缺失意味着"从某次决策分叉重跑"（一个挺 AI 原生的能力）需要自己实现，不能指望 saver。

**结论**：§8 已改为 MySQL 存业务 + checkpointer 独立 SQLite 文件。这不是妥协——§6.2 本来就论证了"执行现场"与"审计/确认状态"应与业务库分离，两库各自备份、各自生命周期，checkpoint 可随意清理而审计不可。

清理确认：`career_v2_spike` 已 DROP，`career_db` / `career_decision_system` 等其余 13 个库未受影响。

### S3 · React 生态：官方 hook 是真的，但它绑定 LangGraph Server 协议

`@langchain/react` **1.1.1** 确实存在，官方定位 "React integration for LangGraph & LangChain"。`useStream` 提供根级 `values / messages / toolCalls / interrupts` 投影、会话式流协议 + remount 自动重连、选择器订阅（子图/媒体按需下发）、`useSuspenseStream`。同生态另有 `@assistant-ui/react` 0.15.21、Vercel `ai` 7.0.107。

**但**：quick start 是 `useStream({ assistantId, apiUrl: "http://localhost:2024" })`——2024 是 LangGraph Server 的端口，它讲的是 **LangGraph Server 线协议**，不是任意 FastAPI。README 里提到 "hosted Agent Server path 与 custom-adapter path 是同一 typed union 的两臂"，说明存在自定义适配器入口。

这把我原先"React 生态更成熟"的断言具体化成了一个必须选的岔路，已写进 §11.2。**注意 S3 未证伪换栈理由**：换栈的核心收益是单进程消除 Java↔Python 转译税（§8 末），前端无论走 A 还是 B 都不影响这一条。

### S4 · 自定义适配器实测：岔路解开了，但结论仍是自建（§11.2 已定）

读 `@langchain/react` 1.1.1 → `@langchain/langgraph-sdk` 1.11.1 → `@langchain/protocol` 0.0.19 的类型定义得出。

**好消息：`useStream` 不要求 LangGraph Server。** `UseStreamOptions` 是可判别联合，`transport` 传字符串/省略走 agent-server 分支，传一个 `AgentServerAdapter` 实例则走 custom 分支——且该分支下 `apiUrl` / `apiKey` / `client` / `fetch` 全部是 `never`，即**彻底绕开内置 SSE 工厂和平台协议端点**。适配器必需成员只有 5 个：

```ts
interface TransportAdapter {
  readonly threadId: string;
  open(): Promise<void>;
  send(command: Command): Promise<CommandResponse | ErrorResponse | void>;
  events(): AsyncIterable<Message>;
  close(): Promise<void>;
}
interface AgentServerAdapter extends TransportAdapter {
  getState?(): Promise<{ values; next?; tasks?; metadata?; checkpoint?; parent_checkpoint? } | null>;
  getHistory?(options?: { limit?: number }): Promise<Array<{ values; checkpoint? }>>;
  openEventStream?(params: SubscribeParams): EventStreamHandle;  // 带重放契约
}
```

**坏消息三条，足以定案：**

1. **类型上的 optional 在自建后端下不是 optional。** `getState?` 省略时官方文档写明"falls back to `client.threads.getState()`"——而 custom 分支强制 `client?: never`，即回退路径不存在。所以自定义适配器实际必须实现 `getState()`。
2. **`openEventStream` 的重放契约是硬要求且微妙**（原文："Implementations **MUST** buffer events ... replay them through every newly-opened stream whose filter matches ... expects to receive the run's full history from `seq=0`（客户端按 `event_id` 去重）... SDK 会推迟到 `run.start` 把 thread 在服务端提交之后再开流，**这个窗口内产生的事件也必须投递给迟到的订阅者**"）。自己实现就等于复刻"有界每-run 重放缓冲 + 启动竞态处理"。
3. **它要的是 `@langchain/protocol` 的 `Command`/`Message`/`SubscribeParams` 对象**，不是任意 JSON；而该包类型面里全是 `Assistant`/`AssistantRun`/`AssistantsSearchResponse` 这类 **LangGraph Platform 资源词汇**。接它 = 让 v2 采纳一套我们没选的 assistants/runs/threads 本体论，且绑在一个 **0.0.19 的 pre-1.0 包**上（源码注释还引用着 `plan-custom-transport.md §4 ... rollout`，说明这套契约本身还在迁移中）。

**定案**：走路线 B，自建 FastAPI + 自建 SSE 帧 + 前端自持时间线状态机（§11.2 已写成决定，含三条"现在就遵守、日后好接"的兼容约束）。理由不是省那 150 行适配器，而是**不要把 v2 的地基事件模型抵押给一个 0.0.x 且在 rollout 中的外部协议**——我们的 §3.2 事件模型（`run_id, seq` 唯一、append-only、有界重放）本来就独立推导出了它要求的性质，兼容成本因此接近零。

S3 那句"官方 hook 可用"因此要精确化为：**可用，但要用就得同时采纳它的事件重放语义和资源词汇；而我们自建的 SSE 本来就要做到同样的语义，所以采纳它只多送耦合，不多送能力。**
