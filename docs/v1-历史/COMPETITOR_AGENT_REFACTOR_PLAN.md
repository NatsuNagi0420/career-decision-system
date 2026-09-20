# 职业规划 Agent 重构方案：竞品与热门 Agent 项目参考

> 日期：2026-09-15  
> 结论：建议重构，但不建议推倒重写。当前项目已有 Python Agent Server、Spring Boot 可信边界、模型网关、只读工具、审批/提案雏形；问题不是“没有 Agent”，而是用户可见体验还不够像一个成熟的职业规划 Agent。

---

## 1. 前提校正

### 1.1 “重构”是对的，但“换栈重写”风险很高

当前项目已经具备几个重要资产：

- `agent_server` 已有 LangGraph 风格的职业决策 Agent 主流程。
- `backend` 已经开始承担可信上下文装配、用户鉴权、Agent Run 代理、提案应用边界。
- 已有本地模型接入和 OpenAI-compatible 模型网关测试。
- `参考开源项目` 已经按能力分类沉淀了一批可借鉴项目。

因此，推荐的重构不是“把 Python/Spring Boot 换掉”，而是：

1. 保留现有 Python Agent Runtime。
2. 保留 Spring Boot 作为业务写入、鉴权、审计和幂等边界。
3. 把当前“单次职业建议流程”重构为“可持续陪伴的职业规划 Agent 系统”。

### 1.2 当前不像 Agent 的核心原因

不是语言问题，也不是模型一定不够强，而是产品闭环还缺几类 Agent 特征：

- 缺长期线程与记忆：用户无法明显感受到 Agent 持续理解自己。
- 缺可见工具调用：Agent 是否查了画像、候选方向、岗位证据、行动计划不够直观。
- 缺多阶段任务拆解：当前更像“一次问答 + 一次建议”，而不是“诊断 → 搜证 → 比较 → 提案 → 执行 → 复盘”。
- 缺明确人类确认点：用户难以区分“AI 建议”和“系统已执行动作”。
- 缺评测台：无法比较本地模型和未来付费模型在同一 Agent 框架下的表现。

---

## 2. 竞品参考：应该学什么，不应该照抄什么

### 2.1 海外/通用职业产品可借鉴能力

| 竞品/产品方向 | 可借鉴点 | 对本项目的改造启发 |
| --- | --- | --- |
| Teal | 简历优化、职位匹配、求职追踪、AI Resume Builder | 增加“候选方向 - 岗位要求 - 用户证据”的匹配解释，不只给结论 |
| Careerflow | LinkedIn 优化、求职 CRM、简历/职位管理 | 增加职业规划后的行动追踪和复盘，而不是只做一次建议 |
| LinkedIn AI 求职/职业辅助 | 用自然语言描述目标，让 AI 帮用户探索岗位和路径 | 把用户模糊表达转成可比较的职业方向和验证任务 |
| 猎聘/智联等国内招聘平台 AI 功能 | AI 简历、AI 面试、岗位推荐、职业辅导 | 可借鉴“求职结果导向”，但不要只做招聘工具，要保留职业决策定位 |

### 2.2 竞品共同模式

成熟职业类 AI 产品通常不是只回答“我适合什么职业”，而是形成闭环：

1. 收集用户画像：教育、技能、经历、偏好、约束、风险承受度。
2. 生成候选方向：不是单一路径，而是多条可比较路径。
3. 绑定市场证据：岗位样本、技能要求、薪资/城市/行业趋势、招聘密度。
4. 提供差距分析：当前能力与目标岗位之间缺什么。
5. 输出行动计划：课程、项目、简历、作品集、投递、访谈、实习。
6. 持续跟踪：每周复盘、行动完成度、方向是否调整。

### 2.3 不建议照抄的地方

- 不要把产品做成单纯“简历修改器”。这会偏离赛道的职业规划价值。
- 不要把岗位推荐当成核心智能。岗位推荐容易受数据源、实时性和合规约束影响。
- 不要一开始追求全自动执行。职业决策属于高影响建议，必须保留用户确认、证据来源和反对意见。
- 不要直接做“多 Agent 炫技”。职业规划更需要可靠证据链、可解释判断和长期陪伴。

---

## 3. 热门 Agent 项目参考：该融合哪些能力

> GitHub 活跃度数据由 GitHub API 于 2026-09-15 拉取，仅作为热度和生态参考，不代表技术优劣。

| 项目 | 当前热度参考 | 核心能力 | 我们该怎么借鉴 |
| --- | ---: | --- | --- |
| LangGraph | 41,688 stars | 有状态工作流、长流程、checkpoint、人类中断/恢复 | 继续作为 Agent Runtime 主干，补 durable checkpointer、线程持久化、interrupt/resume |
| OpenAI Agents SDK | 29,452 stars | Agent、handoff、guardrails、sessions、tracing | 借鉴“agent handoff/guardrail/tracing”的产品化抽象，不必整体迁移 |
| AutoGen | 60,989 stars | 多 Agent 对话和协作 | 仅借鉴多角色辩论/审查模式，例如“支持者 vs 反对者 vs 证据审查” |
| CrewAI | 58,584 stars | 角色型 Agent、Crew/Flow 编排 | 借鉴角色任务分工，但不要让职业规划变成不可控多 Agent 聊天 |
| Dify | 155,800 stars | 工作流、RAG、模型接入、应用配置化 | 借鉴后台配置化、工作流可视化、模型/provider 管理思路 |
| LlamaIndex | 52,168 stars | 文档处理、RAG、知识索引 | 借鉴职业知识库、岗位样本、用户资料检索，不必整体换框架 |
| LiteLLM | 58,780 stars | 多模型网关、成本、路由、fallback | 对齐我们未来“本地模型 + 付费模型”的统一调用层 |
| Langfuse | 34,635 stars | Trace、评测、观测、prompt/version 管理 | 建议接入或仿照建立 Agent 轨迹、成本、质量观测 |
| Promptfoo | 25,118 stars | Prompt/Agent/RAG 测试、模型对比、红队 | 建议先做本地模型 vs 付费模型的职业决策评测集 |

---

## 4. 结合已拉取开源项目的迁移映射

本项目 `参考开源项目` 已有分类，不需要重复拉取。建议按下面方式吸收：

| 本地参考项目分类 | 代表项目 | 可拿来用的能力 | 落地到本项目 |
| --- | --- | --- | --- |
| `01_职业领域与产品闭环` | Career-Agents / Compass / JobFit-AI / JobSync / MyOfferAgent | 职业任务拆解、岗位匹配、求职流程、用户行动闭环 | 设计“职业路径地图 + 行动计划 + 复盘”产品流程 |
| `02_Agent工作流与应用平台` | LangGraph | 状态机、工具规划、checkpoint、中断恢复 | 重构 `career_decision` 为多节点职业规划 Agent |
| `03_RAG与职业知识库` | LlamaIndex | 文档索引、检索、知识库组织 | 建立职业知识库、岗位样本库、学校/专业/城市约束库 |
| `04_本地模型与模型网关` | LiteLLM / llama.cpp | 多模型路由、本地模型、OpenAI-compatible 接口 | 做统一模型配置、成本记录、模型评测、fallback |
| `05_评测与可观测性` | Langfuse / Promptfoo | 轨迹、评测、红队、质量回归 | 建立 Agent Eval Bench，比较本地模型和付费模型 |

---

## 5. 推荐目标架构

### 5.1 分层边界

```text
Web / App
  └─ 展示 Agent 线程、工具轨迹、证据卡片、待确认提案、行动计划

Spring Boot Backend
  ├─ 鉴权 / 用户边界
  ├─ 可信上下文装配
  ├─ 业务写入 / 幂等 / 审计
  ├─ Agent Run / Thread / Proposal / Approval 持久化
  └─ 调用 Python Agent Server

Python Agent Server
  ├─ Career Planning Graph
  ├─ Read-only Domain Tools
  ├─ Model Gateway
  ├─ Evidence Normalizer
  ├─ Proposal Generator
  └─ Eval / Trace Hooks

Data / Knowledge
  ├─ 用户画像与经历证据
  ├─ 候选职业方向
  ├─ 岗位样本与市场证据
  ├─ 行动计划与复盘
  └─ 职业知识库 / RAG
```

### 5.2 Agent 内部分工

建议从“一个职业决策 Agent”演进成“一个主 Agent + 多个专用节点”，不是一开始做完全自治多 Agent。

| 节点 | 职责 | 是否需要模型 |
| --- | --- | --- |
| Profile Evidence Extractor | 整理用户画像、经历、技能、约束、偏好 | 部分需要 |
| Career Option Scout | 生成/补全候选职业方向 | 需要 |
| Market Evidence Retriever | 获取岗位样本、技能要求、职业趋势 | 初期可规则/RAG，后续可联网 |
| Fit & Gap Analyzer | 比较用户证据和目标方向差距 | 需要 |
| Decision Coach | 给出建议、反对意见、不确定性 | 需要 |
| Action Plan Builder | 生成可执行任务和验证动作 | 需要 |
| Approval Gate | 把行动变成“待确认提案” | 不应依赖模型执行写入 |
| Review/Nudge Agent | 每周复盘、提醒、调整方向 | 部分需要 |
| Eval Harness | 同一输入下比较不同模型输出 | 不需要或少量需要 |

---

## 6. 用户可见体验应该改成什么样

### 6.1 从“一次问答”变为“规划线程”

用户打开一个职业规划线程后，应看到：

- Agent 当前目标：例如“帮你比较 AI 产品经理、后端开发、数据分析三个方向”。
- 已读取资料：项目背景、用户画像、候选方向、证据、行动计划。
- 正在进行的步骤：诊断、搜证、比较、提案、等待确认、复盘。
- 证据卡片：每个建议对应哪些用户经历或岗位证据。
- 反对意见：为什么这个方向可能不适合。
- 待确认动作：新增候选方向、添加证据、创建任务、调整计划。

### 6.2 最小闭环

首个重构版本建议只做这条闭环：

```text
用户目标/问题
  → 读取可信上下文
  → 识别信息缺口
  → 调用只读工具补证据
  → 输出候选方向比较
  → 生成待确认提案
  → 用户确认
  → 后端幂等写入
  → 下次 Agent Run 能读到新结果
```

这条闭环做扎实，才会明显像 Agent。

---

## 7. 本地模型与付费模型策略

当前本地模型目录：

```text
D:\IDE\llama-b10037-bin-win-cuda-13.3-x64\Models
```

已发现模型文件：

- `Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-IQ4_NL.gguf`
- `mmproj-Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive-f16.gguf`

建议不要主观判断“本地模型够不够”，而是建立评测集：

| 评测维度 | 说明 |
| --- | --- |
| 结构化输出稳定性 | 是否稳定返回符合 schema 的 JSON |
| 证据忠实性 | 是否只引用输入和工具结果，不编造经历/岗位 |
| 职业建议质量 | 是否能给出多路径、反对意见、不确定性 |
| 工具规划能力 | 是否能判断下一步该读什么上下文 |
| 中文表达与用户感 | 是否像职业规划教练，而不是泛泛聊天 |
| 安全边界 | 是否会绕过用户确认，声称已经执行动作 |
| 成本/速度 | 本地模型、付费模型在延迟和质量上的权衡 |

模型策略：

- 本地模型：用于开发、低成本演示、非敏感草稿。
- 付费模型：用于比赛展示、高质量建议、复杂推理、结构化输出稳定性要求高的节点。
- Gateway：统一 OpenAI-compatible 接口，所有模型走同一测试集，不让业务代码感知模型差异。

---

## 8. 分阶段重构路线

### Phase 0：冻结边界，避免误重写

目标：不破坏当前可运行系统。

- 保留现有 `agent_server` / `backend` / `web` 分层。
- 不切换 TypeScript Agent 框架。
- 不拆掉 Spring Boot 的可信写入边界。
- 所有新能力先通过增量模块接入。

### Phase 1：让当前系统真正闭环

优先级最高。

- 增加 `agent_threads` 或等价线程持久化。
- 将 LangGraph checkpointer 从内存迁移到 SQLite/Postgres/Redis 等持久化方案。
- 完善 proposal schema，让 `create_task`、`adjust_task`、`review_target` 等动作可安全落库。
- 前端展示 Agent 运行轨迹、工具调用、证据卡片、待确认提案。
- 每次提案应用后，下一次 Agent Run 必须能读取到结果。

### Phase 2：重构 Agent Graph

目标：从“职业决策问答”变成“职业规划工作流”。

建议目录：

```text
agent_server/app/agents/career_planning/
  graph.py
  state.py
  nodes/
    profile.py
    option_scout.py
    market_evidence.py
    fit_gap.py
    decision_coach.py
    action_plan.py
    approval.py
  prompts/
  evals/
```

保留当前 `career_decision`，新建 `career_planning` 平行演进，确认稳定后再迁移入口。

### Phase 3：职业知识库与岗位证据

目标：建议有依据，而不是泛泛而谈。

- 建立岗位样本表或文档库。
- 记录岗位要求：技能、学历、经验、城市、薪资、岗位职责。
- 引入 LlamaIndex/RAG 思路，但先小规模本地知识库。
- 所有建议引用证据来源和置信度。

### Phase 4：模型评测与可观测性

目标：回答“不同 LLM 在我们的 Agent 框架下做得怎么样”。

- 建立 `agent_server/evals/career_planning_cases/`。
- 每个 case 包含：用户画像、候选方向、岗位证据、期望约束、评分标准。
- 用 Promptfoo 或自研轻量脚本比较：本地模型、付费模型、不同 prompt、不同 graph 版本。
- 接入 Langfuse 或轻量 trace 表，记录：模型、prompt version、工具调用、输出、耗时、错误。

### Phase 5：竞赛展示打磨

目标：让评委一眼看到“这是 Agent，不是普通聊天机器人”。

- 首页/演示页突出 Agent 工作流。
- 展示一次完整线程：问题 → 诊断 → 工具读取 → 证据 → 对比 → 提案 → 用户确认 → 行动计划更新。
- 给出模型评测对比：本地模型 vs 付费模型在职业规划任务上的表现。
- 展示安全边界：未经确认不会写入；敏感信息不会直接发外部模型。

---

## 9. 近期两周建议 Backlog

### 第 1 周：让 Agent 闭环可见

1. 后端：补 `agent_threads` / `agent_approvals` / proposal schema。
2. Agent Server：把 checkpointer 从 `InMemorySaver` 抽象成可替换持久化。
3. 前端：做 Agent 运行轨迹 Timeline。
4. 前端：做“待确认提案”卡片。
5. 测试：确认 proposal apply 后下一轮 Agent 能读到变化。

### 第 2 周：做职业规划差异化

1. 新建 `career_planning` graph，不立刻删除旧 graph。
2. 增加职业画像证据账本。
3. 增加候选方向比较卡：适配度、机会、风险、验证成本。
4. 增加行动计划 Builder。
5. 增加 10-20 条 Agent Eval case，开始比较本地模型与付费模型。

---

## 10. 非目标

这些事情现在不建议做：

- 不建议全量 TypeScript 重写 Agent Runtime。
- 不建议把 Dify/Coze 直接作为主系统替代现有工程。
- 不建议一开始做完全自治多 Agent 团队。
- 不建议让 Agent 直接写业务数据库。
- 不建议为了“看起来高级”牺牲安全、可解释和可评测。

---

## 11. 最终建议

可以重构，而且应该重构；但重构目标不是换语言、换框架、堆开源项目，而是把系统从“可调用模型的职业建议功能”升级为：

```text
有长期线程、有工具轨迹、有证据账本、有候选方向比较、有待确认提案、有行动计划、有复盘、有模型评测的职业规划 Agent。
```

最稳妥路线是：

1. 继续使用 Python + LangGraph。
2. Spring Boot 继续作为可信业务边界。
3. 参考竞品做产品闭环。
4. 参考热门 Agent 项目做状态、工具、审批、观测、评测。
5. 先做 2 周增量重构，确认演示效果，再决定是否更大规模调整。

---

## 12. 资料来源与参考链接

### 职业规划/求职竞品

- Teal: https://www.tealhq.com/
- Teal AI Resume Builder: https://www.tealhq.com/resume-builder
- Careerflow: https://www.careerflow.ai/
- Careerflow AI Resume Builder: https://www.careerflow.ai/resume-builder
- LinkedIn AI-powered job search: https://blog.linkedin.com/2024/june/13/linkedin-premium-features-ai-powered-job-search-career-coaching
- 猎聘 AI 简历/求职工具: https://www.liepin.com/
- 智联招聘 AI 模拟面试/AI 简历工具: https://www.zhaopin.com/

### Agent / RAG / 评测 / 观测项目

- LangGraph: https://github.com/langchain-ai/langgraph
- LangGraph Docs: https://langchain-ai.github.io/langgraph/
- OpenAI Agents SDK: https://github.com/openai/openai-agents-python
- OpenAI Agents SDK Docs: https://openai.github.io/openai-agents-python/
- Microsoft AutoGen: https://github.com/microsoft/autogen
- Microsoft AutoGen Docs: https://microsoft.github.io/autogen/
- CrewAI: https://github.com/crewAIInc/crewAI
- CrewAI Docs: https://docs.crewai.com/
- Dify: https://github.com/langgenius/dify
- LlamaIndex: https://github.com/run-llama/llama_index
- LiteLLM: https://github.com/BerriAI/litellm
- Langfuse: https://github.com/langfuse/langfuse
- Promptfoo: https://github.com/promptfoo/promptfoo

---

## 13. 页面形态补充

- Manus-like / 云 Agent 风格页面改版建议详见：docs/AGENT_ASSISTANT_UI_REFACTOR.md。


---

## 14. 扩展定位：职业规划 + 求职执行 Agent

用户补充的产品定位是：不仅帮客户规划职业，也要帮客户制作找工作相关的一切事物。这个方向是合理的，但需要拆成分层闭环，避免产品变成范围失控的“万能求职平台”。

### 14.1 更准确的产品定位

建议定位为：

```text
职业规划与求职执行 Agent
= 帮用户明确职业方向
+ 识别能力差距
+ 制作求职材料
+ 推进求职任务
+ 基于反馈持续调整策略
```

对外表达可以是：

```text
穗奈是一个职业规划与求职执行 Agent。她不只回答“我适合什么职业”，还会把职业方向拆成求职材料、作品集、投递、面试和复盘任务，陪用户完成从方向选择到求职落地的全过程。
```

### 14.2 不能直接承诺“一切都包办”

“找工作相关的一切事物”可以作为长期愿景，但不适合作为 MVP 承诺。原因：

- 职业建议属于高影响决策，必须提供依据、反对意见和不确定性。
- 简历、作品集、求职信不能伪造经历，只能重组、表达和补证据。
- 自动投递、代沟通、爬取岗位等动作涉及账号、隐私、平台规则和合规风险。
- 市场岗位和薪资信息会变化，不能把未经验证的信息当成确定事实。

因此，Agent 应该“辅助制作、辅助决策、辅助执行”，而不是替用户做不可逆或有风险的动作。

### 14.3 产品闭环建议

| 阶段 | 用户问题 | Agent 应交付的东西 |
| --- | --- | --- |
| 职业诊断 | 我适合什么方向？ | 职业画像、候选方向、适配度解释、反对意见 |
| 差距分析 | 我离目标岗位差什么？ | 能力差距清单、证据缺口、学习/项目建议 |
| 材料制作 | 我怎么包装自己？ | 简历版本、求职信、项目描述、作品集结构、LinkedIn/BOSS/猎聘资料文案 |
| 岗位匹配 | 这个 JD 值不值得投？ | JD 匹配度、关键词差距、风险提示、定制简历建议 |
| 面试准备 | 面试怎么讲？ | 高频问题、STAR 回答、项目讲述脚本、反问问题 |
| 投递推进 | 我接下来做什么？ | 投递清单、跟进节奏、内推/邮件/私信模板 |
| 复盘优化 | 为什么没反馈？ | 投递漏斗分析、材料调整建议、方向修正建议 |

### 14.4 MVP 应先做的 5 个“求职执行”能力

优先级建议如下：

1. **JD 匹配分析**：用户粘贴岗位 JD，Agent 对比用户画像和经历，输出匹配点、缺口、风险、简历改写建议。
2. **定制简历生成**：基于真实经历生成某个岗位方向的简历版本，明确标注哪些内容缺证据，禁止编造。
3. **项目经历包装**：把用户项目转成 STAR / CAR / 业务价值表达，适配不同岗位。
4. **面试准备包**：根据目标岗位和用户经历生成面试问题、回答提纲、追问风险、反问问题。
5. **求职行动计划**：把方向验证、简历修改、投递、面试准备、复盘拆成可跟踪任务。

这些能力最能体现“Agent 帮你推进事情”，且和职业规划主线高度相关。

### 14.5 中长期能力

后续可以再做：

- 多岗位版本简历管理。
- 求职信 / 邮件 / 内推私信生成。
- 作品集页面或项目 README 生成。
- 投递 CRM 与状态追踪。
- 面试复盘和 offer 比较。
- 职业路线长期复盘。
- 在用户授权后接入外部招聘平台或邮箱，但必须有明确权限、日志和撤销机制。

### 14.6 架构含义

这个定位要求 Agent 架构增加“产物生成”和“执行跟踪”两类能力：

```text
Career Planning Agent
  ├─ 职业诊断
  ├─ 候选方向比较
  ├─ 差距分析
  └─ 决策建议

Job Search Execution Agent
  ├─ JD 匹配
  ├─ 简历/求职信/项目描述生成
  ├─ 面试准备
  ├─ 投递计划
  └─ 复盘优化

Approval / Safety Gate
  ├─ 防止编造经历
  ├─ 防止未确认写入
  ├─ 防止未经授权对外投递/发送
  └─ 记录证据来源和修改原因
```

### 14.7 页面含义

前端不应只有“助手聊天页”，而应提供两个明确入口：

| 入口 | 适合任务 |
| --- | --- |
| 职业规划 Agent | 方向选择、适配分析、差距分析、长期规划 |
| 求职执行 Agent | JD 分析、简历定制、面试准备、投递计划、复盘 |

但底层不一定需要两个完全独立系统，可以是同一个 Agent Runtime 下的两个任务模式。

### 14.8 关键约束

- 所有求职材料必须基于用户真实经历。
- AI 生成内容要保留“待用户确认”状态。
- 外发邮件、投递、修改公开资料等动作必须二次确认。
- 需要区分事实、建议和猜测。
- 不要承诺保证 offer。
- 不要把单次简历润色误包装成完整职业规划。

---

## 关联：单 Agent + Skill 架构

- 专业职业规划 Agent 的 Skill 化架构详见：docs/CAREER_AGENT_SKILL_ARCHITECTURE.md。

