# v2 Agent 能力地图与声明契约

> 配套 `AI_NATIVE_ARCHITECTURE.md`：那份定"为什么这样架构"，这份定"完整 Agent 由哪些能力构成、每个能力声明什么"。
> 参照物是 `参考开源项目/`：骨架取自 Career-Agents（division / registry / workflow / readiness），主循环与工具注册取自 OpenManus + Compass，工具面与反捏造取自 MyOfferAgent。**不是照搬其数量与假设**（见 §7）。

---

## 1. 为什么需要这份契约

一个能力域时不需要注册表；十个就需要。v1 的教训正在这条线上：8 类 Proposal 里只有 2 类真能落库（`CareerDecisionAgentService.java:188-192`），因为"能建议什么"和"能写出什么"从来没有在同一处声明过，两边各自长。

契约要一次性钉住四件事，缺一个就会重演 v1：**这个能力产出什么形状的成果物、它可以提议哪些写入动作、那些动作是否需要确认、它靠什么证据才敢下结论。**

## 2. `CapabilitySpec` 声明契约

Career-Agents 的 registry 有 `id/division/tags/skills/related_*` 但没有风险与确认语义（它的 md frontmatter 只有 5 个字段），MyOfferAgent 只有 `MODEL_CONFIG.standard/fast` 两档模型分层。这三项 **v2 必须自造**：`risk_tier`、`requires_approval`、`thinking`。

```python
class CapabilitySpec(BaseModel):
    id: str                      # 唯一，小写下划线；validate.py 查重
    domain: str                  # 10 个能力域之一，见 §3
    name / description: str
    required_context: list[str]  # 服务端必须已装载的上下文键（profile/project/...）
    tools: list[str]             # 允许调用的工具白名单，未声明即不可见
    artifact_type: str | None    # 产出哪种 Artifact；None = 只回话不产 Artifact
    proposal_types: list[str]    # 可提议的写入动作；空 = 纯只读
    risk_tier: Literal["R0","R1","R2","R3"]
    requires_approval: bool      # R2/R3 必为 True
    evidence_required: bool      # True 时无逐字引文则强制 isProvisional
    min_data_coverage: int       # 低于此值直接 provisional（照抄 Career-Agents 的 40）
    thinking: Literal["on","off"]  # deepseek-flash 的每调用开关，见 §5
    max_tokens: int              # 一律 ≥1500，见 §14-S1 的空 content 坑
    output_schema: dict          # json_object 模式下要满足的 schema（由 Pydantic 生成）
    next_capabilities: list[str] # 显式串链，取代 Career-Agents 写在散文里的顺序
```

`risk_tier` 语义（这是全套安全边界的落点）：

| 档 | 含义 | 允许 |
|---|---|---|
| R0 | 只读 | 直接执行，无 Proposal |
| R1 | 产出草稿 Artifact | 写 Artifact 表，不写业务表 |
| R2 | 提议业务写入 | 必须经 `interrupt()` 确认 → 才走 apply |
| R3 | 破坏性或终局语义（删除、确认唯一目标、提交复盘） | **Agent 永远不可执行**，只能把 Artifact 摆到人面前由人手操 |

## 3. 十个能力域

按"用户手里有什么 → Agent 能替他推进到哪"排，不是按组织架构排。

| # | id | 干什么 | Artifact | 关键工具 | risk | 需确认 | evidence | thinking |
|---|---|---|---|---|---|---|---|---|
| 1 | `profile_diagnose` | 画像诊断，算数据覆盖率并列出缺什么 | `ProfileGapReport` | `get_profile` `record_profile_fact` | R1 | 是（写画像事实） | 否 | off |
| 2 | `direction_explore` | 方向认知与真实岗位面貌（目录 + 岗位样本） | `DirectionBrief` | `search_directions` `get_job_samples` `get_requirement_items` | R0 | – | **是** | on |
| 3 | `decision_frame` | 把模糊问题框成可比较的决策项目与标准 | `DecisionFrame` | `get_project` `propose_criteria` | R1 | 是 | 否 | on |
| 4 | `candidate_source` | 生成/补全候选职业 | `CandidateList` | `search_directions` `list_candidates` | R2 | 是（`add_candidate`） | **是** | on |
| 5 | `evidence_collect` | 针对不确定项设计验证任务并归档证据 | `EvidencePlan`, `EvidenceItem` | `get_evidence` `search_job_postings` | R2 | 是（`collect_evidence`） | **是** | off |
| 6 | `compare_decide` | 多标准对比 + 反方论证 + 不确定项 | `ComparisonMatrix` | `list_candidates` `get_evidence` `compare_candidates` | R1 | – | **是** | on |
| 7 | `action_plan` | 4 周行动计划、里程碑、任务 | `ActionPlan` | `get_target` `get_plan` `estimate_load` | R2 | 是（`create_job_search_task`） | 否 | on |
| 8 | `weekly_review` | 周复盘、置信度趋势、下周聚焦 | `WeeklyReviewDraft` | `get_plan` `get_task_results` `get_review_history` | R3 | **禁止自动**（提交即终局） | 否 | on |
| 9 | `resume_build` | 简历生成/优化，JD 对齐，逐条改写 | `ResumeDraft` | `get_profile` `get_evidence` `get_jd` `match_jd` | R2 | 是（`create_resume_draft`） | **是** | on |
| 10 | `interview_prep` | 行为/技术题、追问、 STAR 素材组织 | `InterviewKit` | `get_resume` `match_jd` `get_evidence` | R1 | – | **是** | on |

`job_search_ops`（投递台账与转化统计）故意不列进第一版：它本质是 tracker，v1 已有页面形态，属于"表单一等公民"而非"Agent 一等公民"，先由 Artifact 面板承担。

三个来自参考项目、值得现在就固化的规则：

1. **`evidence_required=True` 的能力，无逐字引文即强制 `isProvisional`**（§6.4/§6.6）。这不是提示词要求，是 apply 前的代码校验——Career-Agents 用 `dataCoverage<40` 把 `confidence` 压到 0 的做法，本质就是"没依据就别装"。
2. **`compare_decide` 永远不能自动确认目标**（R1 只出矩阵）。`decision_targets` 的落库属 R3。v1 的 `DashboardService` 之所以能把人推错方向，就是因为"比较"和"拍板"没分开。
3. **`next_capabilities` 是数据不是散文**。Career-Agents 的 10 个 workflow 在 registry 里 `recommended_agents[]` + **0 个 steps**，顺序语义全写在 markdown 里（"Next Recommended Workflow"），机器不可校验。v2 把顺序声明进契约，`validate.py` 才能查断链。

## 4. 入口与编排

四个入口，全部走同一个 `run` 创建路径（v1 的问题是 `/chat/messages` 与 `/agent-runs/*` 两套并行）：

```text
1 Agent Shell 输入目标            → 新建 Run
2 Artifact 面板上的"继续推进"     → 新建 Run，required_context 带 artifact_id
3 Obligation 到期（下次打开时兑现）→ 恢复既有 Run
4 显式命令（/resume /compare ...） → 新建 Run 并直接锁定 capability
```

编排层的职责顺序照抄 Compass 的成本设计：`intake` 只做 sanity gate，紧接着一个**角色域闸门**（`intake_filter`）判断请求是否落在 10 个能力域内，越界直接 END——**这一步在 LLM 之前**，省钱且防注入面扩大；然后才进 `plan → tool loop → synthesize → approval_gate → finalize`。

域闸门用规则 + 关键词就够（不装模型），但和 v1 的区别必须是：**它只负责"拒绝域外请求"，不负责"决定调哪个工具"**。v1 把两件事混成一个中文子串匹配表，于是规划权被偷走了。

## 5. 工具层

注册方式取 OpenManus 的结构（`name/description/JSON-Schema/execute()` + Collection 分发、未知工具名回 `Error: Unknown tool`）叠加 MyOfferAgent 的纪律：

```python
@tool
async def get_job_samples(candidate_id: int, limit: int = 5) -> ToolResult:
    """取某候选职业的真实岗位样本。limit 上限 10。"""
```

- **schema 由 Pydantic 自动生成**（LangGraph `@tool` 原生支持），走 `tool_calls`，**不依赖 `response_format`**——§14-S1 实测 `json_schema strict` 在 `deepseek-flash` 上返回 400。
- **工具输入一律 `thinking=off` 的抽取节点产出 + Pydantic 校验**；校验失败时把 `ValidationError` 文本作为 tool 消息追加回对话、**只重试一次**，再失败就降级（照抄 MyOfferAgent `openai-client.ts` 的 schema-repair retry 与可移除参数白名单）。
- **输出必须裁剪**。MyOfferAgent 把 `get_resume(view="full")` 截到 30k 字符并在注释里写明防"token 炸弹"；v1 是靠 `max_length=120` 兜事件体积。v2 每个工具声明 `max_output_chars`，截断时返回 `truncated=true` 让模型知道该换更粗的工具，而不是以为数据就这么多。
- **删除语义用显式哨兵**（它的 `__CLEAR__`），不要靠"字段不传即删除"——那正是 §9 第 2 条 `requestId` 幂等要防的歧义。
- **工具真的取数**（§4），且带 `source_refs` 回指记录 id，这是 §6.4 逐字引文能反查原文的前提。

`thinking` 分档规则：抽取/清洗/格式化 → `off`；比较/取舍/生成建议/反方论证 → `on`。依据是 §14-S1：`off` 时 47 token 出正确 JSON，`on` 时 95% 输出是思考 token。不给 `off` 的节点，预算一律 ≥1500。

## 6. 完整性校验（`scripts/validate.py`）

Career-Agents 值得全盘借鉴——它用 `validate.py` + `generate-data.py` 把"注册表不腐化"当成 CI 门禁。v2 落库后仍需一个等价脚本，查这些：

1. `capability id` 全局唯一；`Spec.tools` 引用的工具都存在；`artifact_type` 与 `proposal_types` 都在枚举内。
2. **无孤儿能力**：注册了但没有任何入口/`next_capabilities` 指向它 → 报错（对应它的"磁盘有 md 但 divisions 未列 = 孤儿"）。
3. **无断链**：`next_capabilities` 指向不存在的 id（对应它的 workflow→agent、bundle→path 引用完整性）。
4. 每个能力必须有 `output_schema` 且非空，且 `risk_tier in {R2,R3}` 时 `requires_approval is True`——**这条是安全不变量，违反即红**。
5. 每个 `proposal_type` 必须有对应 apply 执行器注册。**专门治 v1 那个"声明 8 类只实现 2 类"的病**。
6. `evidence_required=True` 的能力必须能到达某个 `source_refs` 生成点。
7. system prompt 的人格段不得出现判断词（"你应该选""最适合你"）——把 §6.8 的禁用清单变成可扫描规则。

## 7. 明确不照搬

| 参考项目的东西 | 为什么不搬 |
|---|---|
| Career-Agents 的 19 division / 167 agent | 量级与重复（`career/` 与 `resume/` 里 `executive-resume-advisor` 重复注册、company-interviews 16 个高度同构）；10 个能力域覆盖中国大学生求职闭环已够 |
| 美式求职假设 | ATS 关键词、recruiter 外联话术、LinkedIn、F-1、FAANG 与 `companies/*.json` 那 16 家、`experience_level` 美式分级 |
| `readiness.js` 的正则/子串关键词打分 | 误匹配率高。只作**确定性先验与证据覆盖率**，绝不作为面向用户的权威结论 |
| Obsidian markdown 当业务库 | Compass 的 `vault_write` + `_meta/*.md` run-log 迁移逻辑。v2 用 MySQL |
| `generate-data.py` 生成物流水线 | 它服务 SEO/索引（`llms.txt`、`search-index.json`、README 模板），v2 无此需求 |
| `popularity_score` / `color` / `emoji` / `vibe` 当结构化字段 | 展示属性混进契约 |
| zod strict "每字段必填" 的工具参数 | 与 §14-S1 的"无严格 schema"叠加会放大失败率；参数要可缺省并有兜底 |
| 2644 行手写 MCP `inputSchema` 与 registry 双份维护 | 单一事实源：Pydantic → schema，不手写 |
| MyOfferAgent 韩/英双语 `languageRule` 与 SDK 绑定 | 中文单语，且要自己实现（其数字捏造检测与围栏折叠才是我们要的） |

## 8. 实现顺序

一次把能力面设计全，但**按依赖顺序落地**，否则第十个能力域会反过来改前面九个的契约：

```text
M0 骨架      run/step/event/artifact/proposal/approval 六表 + checkpointer + SSE 帧（§11.2 三条约束）
M1 只读闭环  R0 能力（#2 direction_explore）+ 工具真取数          → 验 A3 A4
M2 确认闭环  #4 candidate_source + #5 evidence_collect + 独立 approvals 表 → 验 A5 A6
M3 判断闭环  #6 compare_decide + 逐字引文 + 数字白名单            → 验 A7 A9
M4 全能力    #1 #3 #7 #9 #10 + R3 禁令 + validate.py              → 验 A1 A2 A8
```

M0–M2 结束时就该有一次人肉演示：从"我在 XX 和 YY 之间纠结"进去，出来一个待确认的候选职业 Proposal。这一步做完，"像不像 AI 原生"就有答案了，不必等 M4。

## 9. 落地状态（M0–M4，2026-09-20；M5 见 §10）

M0–M4 首版已实现并**用真模型在浏览器里走通**：`server/`（Python 3.12 + FastAPI + LangGraph + MySQL + SQLite checkpointer）与 `web/`（React 19 + Vite）。

门禁：`pytest` 全绿、`ruff` 零告警、`scripts/validate.py` 11 项、前端 `tsc` + 9 项 vitest + 生产构建。演示脚本 `scripts/demo_e2e.py`（`--chain` 跑两跳：建项目 → 采纳 → 往该项目写候选）。

已上线 8 个能力域（`skeleton_probe` + 7 个业务域），3 个仍标 `planned` 并在 UI 上禁用：周复盘、简历、面试准备。目录知识已从 v1 导入：25 方向 / 808 岗位 / 6032 条逐字要求 / 1022 条关联。

### 真机演示抓出的四个产品级缺陷（都已修，都不是单测能发现的）

1. **`structured()` 从没把 schema 告诉模型。** `json_object` 只保证"是合法 JSON"，不写形状，模型就自创外壳（实测返回 `{"speaker":"穗奈", ...}`），字段全丢。修法：把 `model_json_schema()` 写进 system prompt，重试时再写一次。
2. **缺证据的成果物照样端上确认门。** 有一轮模型一次工具都没调、覆盖度 0、`is_provisional=True`，但写入提议仍然出现等人采纳——于是写进一条垃圾候选。修法：`provisional && evidence_required` ⇒ 不生成 Proposal，改发 `write_withheld` 帧，UI 上与提议同等醒目。
3. **规划节点也会被思考 token 饿死。** 原先只给综合节点加了大预算，实测 `select_action` 在 2000 上限下思考占 1135 后无内容。修法：路由不是判断，**规划一律 `thinking:"off"`**，`thinking` 语义收窄为只管判断节点。
4. **payload schema 真的在挡事。** `add_candidate` 有两次被模型塞进整句长说明，`AddCandidatePayload` 直接判 `unsupported` 并说明原因，没有落库。这条不需要修，是它该有的样子。

### 已知限制，不藏着

- **`data_coverage` 语义偏弱**：它衡量"工具是否答了"，不是"问题是否答了"。上面第 2 条之所以能兜住，靠的是逐字引文缺失而非覆盖率，所以覆盖率目前只是提示性的，不能当门槛用。
- **模型是否调工具不确定**：同一目标两次跑，一次调了 3 轮工具、一次直接跳过。规划权交出去就得接受这个方差，靠 prompt 与预算约束，不能靠运气。评测集（Promptfoo）是下一步该补的那道闸。
- **v1 导入的方向-岗位关联有规则匹配噪声**（实测"数据分析师"下挂着实施工程师岗位），因为 v1 的映射本就是规则产物。`review_status` 字段留着，但还没有复核流程。
- **`spikes/.venv` 随 v1 目录一起失效**（base 解释器被删），重跑 S1 需改用 `server/.venv`。

## 10. M5：跨 run 的推进权与对象层（2026-09-20）

M0–M4 之后剩下的根本缺口不是能力数量，而是**没有人持有跨会话的目标**：每一环都要用户点一下才动，`Obligation` 只存在于设计文档 §3 的图里，代码中 0 处引用。M5 补的就是这一条，同时把前端从"一次 run 的事件转储"改成对象层。

**新增**

- `agent_obligations` 表 + `app/agent/obligations.py`：`open→claimed→fulfilled/abandoned`，`claim()` 用 rowcount 做单写者认领（与确认门同一套），触发只有 `on_return` 与 `scheduled` 两种。冷却只约束系统自发（`entry_point=obligation`），**不约束人的点击**。
- 模型在 `DigestDraft` 里多一个 `next_step{capability_id,intent,wait_hours}`：**复用已发生的那次 structured 调用，不加额外轮次**；`capability_id` 由代码对着注册表校验，非法/内部/未实现 ⇒ 静默丢弃且 run 不失败。
- `GET /api/v1/feed`（项目/成果物/承诺/待决断，跨 run）、`GET /api/v1/continuations`（该不该自己动 + 不动的原因）、`POST /api/v1/obligations/{id}/abandon`。
- 前端三栏（导航轨 / 对话流 / 成果物与承诺），Material 3 令牌化重写（以青穗绿为 seed 的角色色、色调表面、state layer、type scale）。

### 这轮真机跑出来的七个缺陷（都已修）

1. **`FRAME_KINDS` 从来就是废的**：`m.model_fields["kind"].default` 对无默认值的 `Literal` 返回 `PydanticUndefined`，所以它是 `(PydanticUndefined,)`——长度 1，而且**没有任何地方消费它**。改成从 `FRAME_MODELS` 一处声明派生 union 与 kinds 两份，并新增校验：帧 kinds 必须与前端 `FrameKind` 联合类型完全相等（前端对未知 kind 是 `default:` 静默丢弃，这类漂移只能靠契约检查暴露）。
2. **`action_plan` 的承诺链是死胡同**：`next_capabilities` 只有 `weekly_review`（planned），于是它的可承诺集合会静默回退成"全部能力"，设计好的顺序失效。新增校验"链必须落到可承诺的目标"当场抓出来。
3. **A1 在 dev 下根本不触发**：React StrictMode 双挂载，第一次的 `continuations` 请求被自己的 cleanup 用 `cancelled` 掐掉，第二次又因 `bootRef` 单飞守卫直接 return。修法：保留单飞守卫，但**不在 cleanup 里取消已经在飞的启动**。只有真开浏览器才会发现。
4. **时间线折叠出现重复 React key**：`step_id` 只在一轮 run 内唯一，旧数据回放还会把同一步拆成多组，用 `stepId` 当 key 直接撞。改为位置键。
5. **`usage_recorded` 没有 `step_id`**：token 用量落不到引起它的那一步，前端只能挂成"无归属"组，把一步拆成三截。给帧加 `step_id`（向后兼容的可选字段）。
6. **模型把整个响应体当"逐字引文"**：`§6.4` 要求原文引用，模型严格照做——于是 `{"count":2,"runs":[{"run_id":"63982e…"}]}` 以引文身份出现在学生面前。修法两头：prompt 明确 quote 要取面向人的原句；展示层检测结构化载荷，折叠原文、显示可读摘要，空返回直接说"工具返回为空"。
7. **"接着做"按钮是个死胡同**：缺项目的承诺永久禁用，而用户在左栏选了项目也解不开它。改为：选了项目即可手动启动，run 带上该项目（自动门控不变）。

### 实测的 A1 链路

`profile_diagnose` 跑完 → 承诺 `direction_explore`，且模型自己要求等 72 小时（`scheduled`）→ 期间 `continuations` 返回 `no_due_obligation`，界面写明"到点之后" → 将 `not_before` 挪到过去后刷新页面 → **无一次点击**自动起 run（`entry_point=obligation`）→ 旧承诺 `fulfilled` → 生成更窄的新承诺 `candidate_source`（因为没有项目而不再自动跑，等人指定）。事件顺序：`approval_resolved → obligation_created → run_completed`。

### 门禁现状

`pytest`（含 12 项 obligation 测试）、`ruff` 零告警、`scripts/validate.py` **14 项**（新增帧契约、链可达、每种帧有序列化样本）、前端 `tsc` + vitest + 生产构建全绿，浏览器控制台无错误。

## 11. M6–M7：前端按主流 Agent WebUI 重做（2026-09-20）

用户反馈两条：4K 屏下适配差、样式要参考主流 agent 产品（先给了深色参考，后改口用浅色参考图）。落地为纯前端一轮 + 一个只读端点。

**大屏几何**（实测 2561×1307 CSS px，DPR 1.5）：`.shell` 原来是固定 `max-width: 1560px`，左右各剩 **500px 死白**（39% 屏幕没用）。改成流式轨道 `clamp()` + `--app-max: 2240px`，实测变为 **161px 边距**，三栏 320 / 1080 / 560；正文列单独限宽 1080px，不让句子拉满屏宽。

**结构对齐参考图**（浅色，白卡 + 深绿主色 `#0f5c40`）：

- 每个 run 有独立头部（目标标题 + 状态胶囊 + `能力 · run id · 模型 · 步数` 元信息行）；顶栏的 token 统计降级为 mono 小字，诚实但不占主位。
- 穗奈的输出改成**带身份的正文**（头像 + 名字 + 徽章），不再是"产出成果物 · 长标题"这种卡片；结论 prose 直接进对话流。
- 过程折叠为**一行无边框**"过程 · 25 步 · 18 次查资料"，展开后是 `01. 02. 03.` 编号步骤 + mono 工具串。
- 逐字引文改成 tinted 卡片 + 「」；`next_actions` 改成 `行动 01/02/03` 卡片网格；`data_coverage` 用 conic-gradient 环形图（依据不足时环变麦穗色）。
- Enter 发送（Shift+Enter 换行），提示语与实现一致。

**一处契约修正**：`GET /api/v1/auth/me`。用户卡最初把身份与授权状态存在 localStorage 里，实测直接显示"未登录 / 未授权"——而**授权是服务端事实**，在别的标签页撤销后客户端缓存还在断言相反的话。现在身份与 consent 一律问服务端，客户端不存副本。

**新 UI 暴露出来的一个后端待办**：环形图会显示"覆盖度 100%（待补证）"，因为数字白名单把 run_id 十六进制片段里的 `0`、`2` 当成"工具没给过的数字"。方向是保守的（宁可误标），但误报现在很显眼，应当把 id 类字段从白名单比对里排除。

### 一个差点让所有浏览器验证作废的坑

`web/tsconfig.json` 原本既没有 `noEmit` 也没有 `outDir`，而 `npm run build` 用的是 `tsc -b`——于是每次构建都把每个 `.tsx` 编译成**同名的 `.js` 放在源码旁边**。Vite 的扩展解析顺序是 `.mjs, .js, .mts, .ts, .jsx, .tsx`，**`.js` 优先于 `.tsx`**，所以 dev server 会去喂那份陈旧的编译产物，改 `.tsx` 不生效也不报错。HMR 日志里出现 `/src/components/Timeline.js` 就是这个信号。

修法三条：删掉 `src/` 下全部生成物、`tsconfig.json` 加 `"noEmit": true`、build 脚本改成 `tsc --noEmit && vite build`，然后**重启 Vite**（它的模块图已经解析过那些 `.js`）。以后判断"页面是不是在跑我改的代码"，先看 HMR 日志里的路径后缀是 `.tsx` 还是 `.js`。

## 12. M8：按参考图 1:1 复刻（2026-09-20）

用户给了参考站的**真实 HTML 源码**，要求一比一复现样式排版。这一轮不再"取意"，而是把参考的 Tailwind 主题表逐条抄成 CSS 自定义属性，再按源码的 DOM 层级重写组件。

**抄下来的量**（`web/src/styles.css` 顶部）：色板（`--md-primary #005048`、`--md-surface #f2fbf7`、`--md-surface-container #e7f0ec`、`--md-secondary-fixed #cde8e1`、`--md-outline-variant #bec9c6`）、间距 4/8/16/24/32、圆角 8/16/24/32/9999、`rgba(0,80,72,.06)` 一档的阴影，以及固定几何 `--sidebar-w 320 / --topbar-h 64 / --feed-w 1024 / --agent-w 896 / --dock-w 896`。字号连 letter-spacing 一起抄（`--r-*` 与 `.t-*` 类）。字体走 CDN：Plus Jakarta Sans + Material Symbols Outlined（图标是**连字**，靠 `font-family` 生效，不用 filter；上线前要本地化）。

**实测出来的三处偏差**（都是量 `getBoundingClientRect()` 发现的，肉眼看截图看不出）：

1. `.dock` 的能力路由行原本 `flex-wrap: wrap`，10 个能力在 896px 里堆成两行，把输入框顶高到 196px；参考源码是 `overflow-x-auto no-scrollbar` 单行。改成不换行 + 隐藏滚动条后 dock 高度 168px。
2. 正文最后一屏被固定 dock 压住：`scrollHeight` 量到底时内容与 dock 顶边**重叠 36px**，因为 `.feed` 的 `padding-bottom: 176px` 是按参考的 dock 估的。改成 240px，实测留白 56px。
3. 窄屏（516px）出现整页横向滚动条，用户上一轮专门为此提过。遍历叶子节点定位到 `.pillar__foot` 里的来源标签 `get_requirement_items.items[0].original_…`——点号加下划线的路径**没有可断行的位置**，把 grid track 撑到 271px。加 `overflow-wrap: anywhere` + `min-width: 0` 后 `scrollWidth == clientWidth`。

顺带补掉的可访问性问题：搜索框、输入框、登录三处表单控件没有 `name`/`id`，控制台报 issue；现在都有了。

**门禁**：`tsc --noEmit` 零错、vitest 19 全过、`npm run build` 成功（CSS 22.8KB / JS 258KB）、`validate.py` 14/14、重载后控制台无错误。桌面尺寸（2560 视口）实测：sidebar 320 固定、topbar 64 固定、subhead 粘顶、feed 1024 居中、agent 卡与 dock 面板同为 896 且与正文同轴心、`documentElement` 无横向溢出。

## 13. M9：按用户改过的原型图重做 + 品牌 IP 落地（2026-09-20）

用户给了第二版原型（改过的参考图 + 它的导出源码），并要求把 `docs/品牌形象/` 的素材用起来。这一版的增量是**信息密度**：赛道树、状态缎带、证据浮标与抽屉、单列依据流、分段读数、IP 头像。

### 品牌素材流水线

`server/scripts/brand_assets.py`（`uv run --with pillow python server/scripts/brand_assets.py`）从 `BgSub_*.png`（透明底那一套，非前缀的是白底）切出 `web/public/brand/*.webp`：128px 头像、56px 高的「青穗集」书法 wordmark、8 张 160px 表情、260px 宽全身立绘，合计约 170KB。表情用**同一 FACE 框 `(223,50,1123,950)`** 裁，8 张画布一致所以头部位置一致，切换时不会跳。

**穗奈的脸跟着 run 的状态走**：`live` → explain/think，成果物依据不足 → worry，依据充分 → happy，承诺 → encourage，扣住写入/等确认 → warn，空态 → listen。这是 IP 唯一值得存在的理由——状态在读到字之前就能被看见。

### 结构映射（原型是 mock，我们得接真数据）

| 原型里的东西 | 这里的真实来源 |
| --- | --- |
| 赛道 → 会话 → 衍生任务 三层树 | capability 分组 → 该能力下的 run → 该 run 留下的 `open` obligation |
| 顶部面包屑缎带 | 能力名 · `ID: run_id[:8]` · 步数与查资料次数 · 分享/重放 |
| 「6 份证据原文核验」浮标 + 抽屉 | `artifact.content.evidence_basis` 条数；抽屉直接渲染已随成果物传来的原句，不额外请求 |
| 依据流卡片的「高置信度 99.2%」 | 没有置信度这个数，改成 `evidence_quotes` 命中判定的**「已核验逐字引文」**——这是代码算出来的事实 |
| 基准偏置条形矩阵（SQL 88.9%…） | 没有岗位技能频次数据，换成**本轮真实 token 开销**（输入/缓存命中/思考/输出），环形仍是代码算的 `data_coverage` |
| 用户气泡 + AC 首字母 | 深绿 primary 气泡 + 用户名首字母；副行写「你发起的这一轮 / 穗奈自己接上的下一步」（`entry_point`） |
| 侧栏用户卡 ⋮ | 真菜单：撤销/给予云端授权（`POST /auth/ai-consent`）、刷新用量、退出 |
| 顶栏三个图标 | `auto_awesome`=接着做、`notifications`=等你确认（带角标并跳过去）、头像=首字母 |
| 分享按钮 | 复制 `?run=<id>` 链接；开站时该参数优先于 localStorage 的 lastRun |

### 三处刻意不照抄

1. **四档思考强度（极速/标准/严格溯源/深度对抗）后端不存在**，画成四个能点的按钮就是假可供。分段控件改成**真实阶段读数**：`决定下一步 / 查资料 / 整理结论`，高亮当前那一步（来自 trace 的最后一个 group）。要让四档真的存在，得给 `create_run` 加 reasoning 预算并让规划/整理两步分别消费它——已记为待办，等用户点头再做。
2. 输入框左侧的**附件/定位/麦克风**是 mock 的装饰，删掉；同一个位置换成当前能力名与写入项目两个真实状态。
3. 顶栏的 `tune`（设置）没有对应页面，改成头像首字母（只作身份展示，不挂假点击）。

### 实测

真实 Chrome 2545 CSS px：`overflowX=false`；缎带 864、正文卡 808（= 864 − 40 头像 − 16 间距）、dock 与托盘同为 768 且与正文同轴心；末屏距 dock 顶边 71px。抽屉 440px 右贴、7 行、遮罩可点关；依据行 `data-on` 切换后原句出现、按钮文案变「收起原文」；赛道树四条，展开/折叠与会话/承诺子项计数正确（当前赛道 `3 个对话 · 有待办`）。分段控件 `整理结论=true`。门禁：`tsc --noEmit` 零错、vitest 19 全过、`npm run build` 成功（CSS 从 42.7KB 删到 36.1KB——清掉 59 条被取代的旧规则）、ruff 零告警、控制台无错误。

### M9-4：能力托盘溢出（用户指出）

托盘 10 个能力需要 1141px，容器只有 768px，而 `.tray` 同时写了 `justify-content: center` 和 `overflow-x: auto`——**居中的可滚动行会把起点推到负方向，`scrollLeft` 最小是 0，于是左边那截永远滚不回来**（实测首项左边缘在容器外 186px，「画像诊断」被切掉且无法访问）。四处修正：

1. 改 `justify-content: flex-start`，起点回到可见位置（实测首项完整可见）。
2. 溢出方向才淡出：`data-start` / `data-end` 三个 mask 规则，只在该侧还有内容时遮罩，两端都有时合并成一条。
3. 加左右两个 `.tray__nav` 按钮（各滚 70% 宽度），到边自动消失；窄屏（<980px）隐藏按钮，靠手势滑动。
4. 已实现的 7 个排在未实现的 3 个（周复盘/简历生成与优化/面试准备，`schedule` 图标 + disabled）前面——不滚动就能看到的全是可点的。
5. 选中项自动 `scrollIntoView({inline:'center', block:'nearest'})`：看不见的高亮等于会被误取消的选中。实测从 scrollLeft=0 点最右侧的「行动计划与任务」，托盘滚到 373（=max）并把选中项完整带入视野。

### M9-5：托盘收成一个按钮（用户否掉了横滚方案）

横滚条被判定为"能滚但没人滚"。改成**输入框左侧一个子按钮**：按钮上写当前工作流的名字与图标，点开是一个 430×460 的面板，10 个能力按四个阶段分组——认识自己 / 看清方向 / 做出决定 / 落地行动（前端把后端的 7 个 `domain` 归并成这四段，纯展示层）。未实现的三项照常列出但 disabled 并打「未实现」角标，不藏起来：路线图本身就是产品的一部分。

关闭路径三条都实测过：选中一项自动关、Esc 关、点面板外关（`pointerdown` 监听在 `open` 时才挂上，避免常驻）。

**微动效**（全部走 MD3 的 emphasized 曲线，且整块被 `prefers-reduced-motion: reduce` 压到 1ms）：面板从触发按钮处 `translateY(10px) scale(.96)` 弹出，chevron 开合旋转 180°；面板内条目按注册表序号 22ms 递进入场；选中项的勾从 `scale(0)` 弹到 1，行本身左移 3px 作 hover 状态层；成果物的四张卡（洞察/数据面板/依据流/行动）按 60ms 阶梯自上而下入场；逐字引文用 `clip-path` 从上往下掀开；思考过程展开淡入上浮；发送按钮在可发送时加一圈 4px 柔光环、按下 `scale(.92)`；证据浮标 hover 时箭头左移 3px。

### M10：退场动效、右上角重设、结尾追问（2026-09-20）

用户看了实机截图提三条，都成立：

**1. 收起没有动效。** 面板开有 `picker-in`，关是 React 直接卸载节点——视觉上"消失"而不是"收回"。改成三态 `closed | open | closing`：`closing` 期间保留挂载播 `picker-out`（190ms 淡出下沉回缩，曲线换成 accelerate 那条，和入场对称），定时器到点才卸载；面板内的条目在关闭时 `animation: none`，否则 22ms 递进会让退场变成逐行闪烁。实测点关闭后 60ms 仍在 DOM（`data-closing=true`、opacity 0.97 中途），320ms 后消失。

**2. 右上和左下都是用户身份。** 按用户的新版原型重设右上为**状态区**：`● 云端模型已连接 / 未授权·走确定性路径`（真实 `external_ai_consent`，跑动时点变脉冲）+ `tune`（账号菜单：授权开关 / 刷新用量 / 退出，菜单从左下角搬到右上并加 `menu-in` 下落动效）+ `notifications`（等你确认角标）+ `ios_share`（复制 `?run=` 链接）。**右上头像删除**。左下用户卡第二行不再重复授权状态，改说真实欠账：`穗奈答应过要接着做 N 件事` / `穗奈手上没有欠着的下一步`，右侧图标直接是退出。

**3. 结尾要有活人感。** 原来 `还该问清楚` 是一排 `<span>`，看得见点不动。改成一张 `.probe` 卡：先复述**这一轮真实的目标原文**（`你这次问的是「…」`），再说`这 N 处我手里没有依据`，下面 `你可以接着对穗奈说：` 把 `uncertainties` 变成可点 chip——点击把 `这条我拿不准，请带着原文回来：{原文}` 写进输入框并聚焦，发送键随即亮成 ready 态。**不自动发送**：措辞仍归人。追问卡 160ms 起、每条 chip 再 70ms 递进，hover 时箭头右移 3px。

顺带：独立成行的 `.note`（等你决定 / 你的决定 / 结束）原来铺满 864px 正文宽，和缩进 56px 的回答列对不齐，看着像游离的横条。加 `.note--alone`（左移 56px、限宽 896）后实测与 `.ev`、`.probe` 同左边缘 1056、同宽 808。

**门禁**：`tsc --noEmit` 零错、vitest 19 全过、build 成功（CSS 41.5KB）、无横向溢出、控制台无错误。另外专门审了一遍 Material 连字：遍历所有 `.ms`，把渲染宽度 > 1.6×字号的判为"退化成文字"，实测 0 个——之前怀疑的 `groups_3` 等图标其实正常。

## 14. M11：思考链改成耗时轨道（2026-09-20）

用户提两件事：思考链/工具调用的样式，以及正文改流式输出。这一条先做前者，因为**先量了再说**：取一份真实 run 的事件时间戳，`select_action 0.7s → tool_batch 0.1s → select_action 2.6s → draft_digest 3.8s`，总 7.3s——**整理结论这一步独占 52% 的墙钟，而它恰好是现在"啪"一下整块出现的那部分**。所以流式确实值得做，但做完这一版轨道后，等待已经能被看见。

**思考链从"折叠的一行"改成耗时轨道**：跑动时默认展开、跑完自动折（`manual ?? live`，用户手动开合优先）；每步一个节点＋序号＋名称，右侧一条**按最慢步归一化的耗时条**（4px 渐变条 + 等宽数字），工具调用降为 chip（`manage_search` + 工具中文名 + `N 条`），usage/摘要退到 notes 一行。summary 上挂总耗时胶囊。

**一个差点上线的假数据**：耗时最初按"组内各条时间戳的极差"算，实测四步全显示 `0.1s`——因为 `groupTrace.absorb()` 把 `step_started` 和"完成"两条**折进了组状态而不进 items**，剩下的 usage 行都落在步内同一瞬间，极差≈0 被我自己的 `Math.max(0.1, …)` 下限托住了。改成把两步边界存进 `TraceGroup.startedAt / endedAt`，`spanOf` 读这两个字段，前端 20 项测试补一条守住它（`times a step between its own open and close frames`）。修完实测 `0.7 / 0.1 / 2.6 / 3.8s`、总 `7.3s`，与直接读事件流的独立测量一致。

顺带：`tool_call` 的 chip 一开始是用正则去剥 reducer 生成的中文句子（`查了「X」（N 条来源）`）——那是把散文当协议解析，措辞一改就碎。改成 `TimelineItem` 带上 `toolName / refCount` 两个结构化字段。

**门禁**：`tsc --noEmit` 零错、vitest **20** 全过、build 成功（CSS 43.8KB）、无横向溢出。

### 待做（下一格）：正文流式输出

设计已定，不写进 `agent_events`：那是一串"还不是事实的文本"，会污染只追加的耐久日志并拖垮 seq/重放语义。走**进程内瞬时通道**（`EventLog` 已有 per-run waiter，同构再加一个 delta bus），SSE 路由把两路合并，delta 帧不带 `id:`/`seq`，因此晚到的订阅者直接拿最终 `artifact_created`，重放行为一字不变。digest 已经是 `conclusion` 打头的 JSON，所以用一个增量字符串读取器只把 `conclusion` 的值流出去，其余卡片仍在对象完成时出现。约 300 行、8 个文件，含网关流式累加（保住 §14-S1 的截断与授权护栏）。

## 15. M11-2：结论与推理流式输出（2026-09-20）

用户三条反馈：发送后输入框不清空、切会话草稿跟着串、以及"不像流式"。前两条是一行代码的漏（`launch()` 与 `openRun()` 里从没 `setGoal("")`），第三条是 M11 计划的落地。用户同时拍定**推理也要露出来**——事后看这个决定是对的：实测 deepseek-flash 一次 digest 里**推理阶段独占约 10s**，之后才开始写 JSON 正文；不露推理的话，前 10 秒界面就是死的。

### 通道：瞬时，绝不进耐久日志

`EventLog` 加 `publish_delta / subscribe_delta`（per-run，`maxsize=1`，**发布前先把队列里旧的挤掉**）。语义是"答案目前长这样"的**全量快照**而不是增量，所以前端不需要排序、不需要去重，慢客户端只会少看几帧、永远不会越拖越远。`agent_events` 一行没多写，`seq`/重放/去重语义一字未改。

`GET /runs/{id}/events` 改成两路合并：耐久流与 delta 队列各自泵进一个 merged queue，谁先到谁先出。**必须真并发**——digest 那 10 秒里一个耐久帧都没有，若只在耐久帧之间顺带 flush delta，结果就是最后一次性吐出来，看起来和没流式一样。delta 帧不带 `id:` 行，所以浏览器重连游标不会被它带偏。

### 网关：流式与既有护栏共用

`OpenAICompatibleProvider.stream()` 走 `client.stream("POST")` 逐行解 `data:`；**故意不重试**——已经给人看过的字不能悄悄重写（schema 修复重试保留，它会从头重流并替换）。`Gateway.stream_completion()` 把分片**折叠回一个普通响应信封**再交给现成的 `parse_completion`，于是 `finish_reason=length` 且内容为空的截断报错、tool_calls 解析、usage 归账（含 `reasoning_tokens`/`cached_tokens`）全部与阻塞路径同源，不是第二套实现。`stream_options.include_usage` 必须显式开，否则流式下 DeepSeek 根本不发 usage，`usage_recorded` 会静默归零。

`structured_stream()` 与 `structured()` 同构（json_object + 一次修复重试），只多一个 `on_delta`。digest 的正文是 JSON，所以 `streamed_conclusion()` 只把 `"conclusion"` 那个字符串**能解码到哪就显示到哪**：半个转义序列、截断的 `\uXXXX` 一律不猜，宁可少显示几个字。节流 80ms。

### 前端

`readRunStream` 多一个 `onDelta`，delta 不进 reducer、不动 cursor；`App` 存一份 `stream` 快照，`artifact_created` 一到就清空。`<LiveAnswer>` 挂在时间线末尾：穗奈头像＋"正在写"＋闪烁光标＋正文逐字增长，推理单独放在一个虚线框里并写明**「模型草稿，不是结论」**、限高 132px 内滚——半成型想法不能长得像 findings。

### 实测

真实 deepseek-flash 一轮：输入框发送后清空 ✓；切会话清空草稿 ✓；推理长度按 3 → 208 → 395 → 532 → 637 → 766 → 949 → 1053 → 1158 连续增长（约 10s）；正文随后开始流；`artifact_created` 落地后 live 卡自动消失、正式答案接管；控制台无报错。后端 `pytest` **81 通过**（新增 7：流式重组与 usage、无授权拒绝、截断仍报错、修复重试、`streamed_conclusion` 边界、delta 通道只留最新快照）、`ruff` 零告警、`validate.py` 14/14；前端 `tsc` 零错、vitest 20 全过、build 成功。

## 16. M12：切会话时输入框抖（2026-09-20）

量出来的，不是猜的：切换瞬间 `dock__inner` 的 left 从 **1056 → 1048**，`documentElement.clientWidth` 从 **2545 → 2560**。链条是「`openRun()` 先清空 items → 正文短于一屏 → 纵向滚动条消失 → 视区凭空宽 15px → 居中的 dock 与正文整体右移 8px → 回放数据到达、滚动条回来 → 再移回去」。

三处修：

1. `html { scrollbar-gutter: stable }` —— 根因。滚动条槽永久保留，宽度不再随内容长短变化。
2. 切会话时 `snapshot` 为 null，**示例卡（"还没有开始的任务"）会在正文空档里闪一下**——它原来的条件是 `items.length === 0 && !running`，切会话正好满足。改成派生一个 `waitingForRun = Boolean(runId) && !snapshot`，示例卡要求 `!waitingForRun`，空档期改为「正在取回这一轮…」锚点 + 同一条缎带的占位（缎带本身原先会消失约 65ms，顶部也跟着闪）。
3. `waitingForRun` 用**派生**而不是 `loadingRun` 状态位：第一版加了 state，实测仍有两帧没有缎带——因为首个帧到达就把 `loadingRun` 置 false，而 `snapshot` 要等 `refresh()` 异步回来，中间那段两边都是 false。派生条件覆盖整个窗口，也不可能留在"已加载"之后。

实测重跑同一次切换：`dockX: [1048]`、`feedX: [984]` 全程单值，缎带 18 帧全在，示例卡不再闪现；`vitest` 20 全过、build 成功、控制台无报错。

## 17. M13：所有内容切换处补入场动效（2026-09-20）

不是一处处撒，是一个机制 + 它覆盖不到的几处：

**机制是 React key**。CSS `animation` 只在节点挂载时跑一次，所以"内容换了但不动"的解法就是让节点重新挂载：容器直接把 `key` 绑到决定其内容的值上（`.feed` 用 `runId`），行内标签用 `<Swap when=…>`（它就是个带 `key` 的 span）。派生出这个最小形状是刻意的——`Swap` 不做包裹层，因为 `.feed` 是 flex 容器，多包一层 div 会破坏子项排布。

**只做入场，不做退场**：退场要把新旧内容同时挂着一段动画时间，对一个可能几千像素高的正文流是错的取舍。

接上的位置：切会话（整条正文 swap-in）、穗奈表情随状态换（face-in 淡入缩放）、侧栏赛道展开（track__list unfold、承诺子项 slide-in 递进）、缎带状态文字、右上授权胶囊、dock 溯源读数、能力选择器标签、抽屉条目 item-in 递进、确认卡 swap-in。另外给三处**只 transition 不 animation** 的地方补了过渡：`.session` 高亮随会话切换移动、`.seg__btn` 阶段高亮在三格之间跳（原来会瞬移，看着像渲染错误）、`.pill/.status` 换色。

**折叠用了 `::details-content` + `interpolate-size: allow-keywords`**（包在 `@supports selector(::details-content)` 里，因为不支持的浏览器会把 `height: 0` 直接坐实成"内容永久不可见"）。实测思考过程展开时高度逐帧 `0 → 1 → 3 → 9 → 18 → 30 → 44 → 58 → 69 → 79 → 88 → 96 → 168px`，是真的缓动高度而不是跳变。

全部受既有的 `prefers-reduced-motion: reduce` 总闸管辖（`*` 把 animation/transition 压到 1ms）。

**没动效的地方是有意的**：流式正文每个 delta 都在变，若套 `Swap` 会每帧重启动画——所以 `<LiveAnswer>` 明确排除。实测：各元素 `animation-name` 分别为 swap-in / face-in / unfold / item-in，`interpolateSize=allow-keywords`，feed 与 dock 左缘仍是单值 984 / 1048（动效没引入位移），无横向溢出、控制台无报错；vitest 20 全过、build 成功（CSS 46.6KB）。

## 18. P0：工程与项目定义收口（2026-09-20）

四层 v1 残留（`backend/` `agent_server/` `android/` `SQL脚本/` + 12 个 ps1 + `start-dev.bat`）删除，22 份 v1 文档移入 `docs/v1-历史/`；整个 v2 重写首次入库（两个 commit）；README 按当前单进程架构重写；新增 `scripts/verify.ps1` 作为唯一验证入口；`PROJECT_GOAL.md` 落定目标与不做清单。

**两处只有查 git 才会发现的坑**：

1. `.gitignore` 原来只写了 `agent_server/**/__pycache__/`，对 `server/` 没有任何规则——100 个 `.pyc` 差一点进库。改成全局 `__pycache__/` + `*.py[cod]`。
2. `git add -A` 会连 `参考开源项目/` 一起暂存，实测 **约 31,000 个文件**（HEAD 里 tracked 数为 0，即纯外部仓库）。提交前 `git reset` 掉并把该目录写进 ignore。同批清掉的还有 `web/vite.config.js` 和 `web/tsconfig.tsbuildinfo` 两个编译产物——前者正是 Vite 优先解析 `.js` 的那个坑，删掉后重跑 build 仍然成功，证明它是死文件。

**迁移方式确实已经统一**（Alembic 单一机制），但 P0 的验收句"任何开发者根据 README 都能启动当前系统"实测**不成立**：全新库上 `alembic upgrade head` 直接死在 `pymysql.err.OperationalError (1049, Unknown database)`。修在代码而不是文档里——`app/db/base.ensure_database()` 在迁移前建库，用比 `assert_safe_target` 更严的 `^career_v2[A-Za-z0-9_]*$`（库名要拼进 DDL，不能参数绑定），只连服务器不选库地下 `CREATE DATABASE IF NOT EXISTS … CHARACTER SET utf8mb4`。迁移与 `conftest` 各调一次。实测：把 `DB_URL` 指到不存在的 `career_v2_p0probe` → 建库 + 6 个 revision 全跑完 + 排序规则与生产一致（`utf8mb4_0900_ai_ci`），随后删掉该探针库，`career_db` / `career_decision_system` 两个 v1 库未受影响。

`ruff` 门禁从 `app tests scripts` 扩到含 `migrations`，并对 `migrations/versions/*` 容忍 Alembic 自动生成的样板 import——否则"加了迁移就跳过 lint"这个洞会一直留着。

### P1 的现状不是"没有表"，是"表是死的"

按 symbol 统计模型在 `app/` 里的引用（不含自身定义）：

| 对象 | 引用数 | 含义 |
| --- | --- | --- |
| `TaskResult` | **0** | 用户提交任务结果的表存在，但没有任何代码写入或读出——提交这个动作在产品里不存在 |
| `ComparisonResult` | **0** | 比较矩阵只活在 Artifact 的 JSON 里，`comparison_criteria/results` 两张表是空的 |
| `WeeklyReview` | 1 | 只在 registry 里作为 `status="planned"` 的能力名出现，没有 executor |
| `PlanTask` | 3 | 只在批准计划时写，之后没人按周/按到期读它 |
| `EvidenceItem` | 10 | 读（tools/domain）和写（executors）都通了 |

能力侧的对应事实：`is_valid_obligation_target()` 要求 `status == "implemented"`，所以 `weekly_review` 现在**不可能**被承诺——`action_plan` 一旦指向它就静默丢弃（registry 里那条注释就是上次修这个 bug 时留下的）。

所以 P1 的真实工作量是"把死表接上动词"，顺序按依赖走：**提交结果（用户动作，走 REST 不走 Proposal）→ 结果归档为证据（R2，`EvidenceItem.quote` 存用户原话）→ 周复盘能力 implemented（R3，模型起草、人终局确认）→ 带新证据重算比较 → Artifact 版本链**。`Artifact.version` 是 SQLAlchemy 的乐观锁计数，不是逻辑版本，所以版本链要加自引用列（如 `supersedes_id`），这是一次真迁移。

## 19. P1-1：任务结果提交（2026-09-20）

`TaskResult` 的引用数从 **0** 变成有读有写。闭环第 9 环节（用户做完事回来交账）第一次真的存在。

**为什么不走 Proposal**：这是用户对自己生活的陈述。让他"采纳并写入"自己刚打的那段话，是把确认门指错了对象——确认门要拦的是**随后**那一步业务写入（把这段话归档成证据），不是他的原话本身。所以 `POST /api/v1/tasks/{task_id}/results` 直接落 `TaskResult`，`body` 原样存（将来 `EvidenceItem.quote` 要能逐字对上），`request_id` 由前端生成，双击只落一行（二次提交返回 201 + `duplicate: true`）。别人的 task → 404，不承认存在。

**提交会自己把 agent 叫醒**：起一个 `evidence_collect` run，`entry_point="task_result"`，goal 里带任务标题；同一项目已有未结束 run 时不再起第二个，返回 `deferred_to_run`（限速只作用于系统自发，这里是用户动作触发的，但并发仍然不允许）。唤醒的 run 不能是瞎子——`get_plan` 现在把每条 task 的 `results` 原句带出来，`source_refs` 追加 `plan_tasks` 行；`feed` 增加 `tasks`（含 results），这是任务 id 唯一能对外的地方。

**前端 `TaskDeck`（行动清单）**挂在时间线之后、确认卡之前：待办在前、已交回的用引用块把原话贴出来（左侧竖线 = 这是人说的话，不是模型的话），可"再补一条"。

### 实测抓到的两个缺陷（都不是看代码能看出来的）

1. **提交后卡片还写着"未交回"**。`taskSubmitted` 走了 `openRun()`，而 `openRun` 只在后续帧（artifact/approval/终态）才刷 feed——提交后的 6 秒里对象层已经变了，界面还停在旧快照。改成提交后**无条件** `refreshFeed()`，跟"要不要跟着跑"是两件事。刷新页面后两条原话、链接、已交回状态都在，第三条仍是未交回。
2. **`scripts/demo_e2e.py` 被 M11-2 打断了**。瞬时 delta 帧没有 `seq`，脚本在 `max(frame["seq"] for frame in frames)` 上 `KeyError: 'seq'`——续跑游标和 seq 连续性检查都该只数耐久事件，新增 `persisted_seqs()`。这个脚本是 P3 评测和 P4 试点的入口，坏在手里两周没人发现，因为 verify.ps1 不跑它（要烧真 token）。

真模型侧的顺带证据：这次提交唤醒的 run 跑了 8 步，产出 **R2 提案"归档一条证据：广州数据分析入门岗 JD 硬性要求（第 1 批）"**，理由原文是"这份结果只覆盖到 1 个岗位（job_id 5），不是任务要求的 3 个…样本数不足，所以「广州数据分析入门岗的硬性要求长什么样」这个判断还不能成立，只能先记成单岗位快照"——第 10 环节（结果→证据）的提案形状已经自己长出来了，P1-2 要做的只是给它一个能落 `EvidenceItem` 的执行器。

门禁：`scripts/verify.ps1` 七项全 PASS（ruff / 契约完整性 / alembic drift / pytest / tsc / vitest 20 / vite build 41 modules），提交 `917476c`。注意 verify.ps1 的汇总块只打 PASS/FAIL 不打测试数，而后台输出文件会截掉头部——想引用具体条数得单独跑一次并留 `tail`。

## 20. P1-2：结果证据化，以及它暴露的两个结构性瞎点（2026-09-20）

第 10 环节（结果→证据）本来预计要写一条新链路，实际执行器早就在了（`collect_evidence` → `EvidenceItem`，`request_id` 幂等）。真正要补的是**引用链**，而补的时候用真模型连跑三轮，抓到两个看代码看不出来的洞。

### 先补引用链：模型只挑，不复述

- `get_plan` 把 `results[].id` 暴露出来（不暴露就没有可引用的东西），`CollectEvidencePayload` 新增 `result_id`。
- 执行器看到 `result_id` 就去 `task_results` 取那一行：先查它属于这个用户、属于这个项目（否则 `LookupError`，一条都写不下去），然后把 `quote` **换成那行的原话**、`source_ref` 换成 `{"table": "task_results", "id": ...}`、`kind` 从默认的 `job_signal` 改成 `action_result`。模型可以选择交回哪一条，不能改写它——归档出来的引文与它在页面上打的字逐字相同。
- 重复批准同一条提案仍只落一行（幂等沿用 `request_id`）。

### 洞一：唤醒它的东西，它读不到

`evidence_collect` 的工具表里没有 `get_plan`。也就是说：提交结果把 run 叫起来，goal 写着"把它整理成证据"，而这个 run **没有任何工具能读到"它"**。它只能去翻 JD，翻不到就什么都不提。加一行工具 + 一条 `test_the_woken_capability_can_read_what_woke_it`（"能力必须拿到它被唤醒所依据的那个工具"）。

### 洞二：项目 id 竟然由模型决定

真模型日志里 `get_plan / list_candidates / get_evidence` 全部 `arguments={"project_id": "default"}`、全部 0 来源，覆盖度 25、`write_withheld`，理由写得头头是道（"一点证据都没有"）——**诚实，但是错的**。`user_id` 一直是代码注入的，`project_id` 却照收模型给的字符串，这个不对称让整条证据能力在演示路径上一直是瞎子。改成 run 已绑定哪个项目就读哪个（`run_tools` 里覆写，并把 `project_rebound` 记进 trace，给 P3 的"工具调用正确率"当计数），配 `test_a_run_reads_the_project_it_belongs_to`。

修完同一份脚本的前后对比（真模型，同一个 demo 项目）：

| | 修前 | 修后 |
| --- | --- | --- |
| get_plan 来源 | 0 | 4 |
| get_evidence / requirement_items | 0 | 1 / 6+20 |
| EvidencePlan 覆盖度 | 25 · 依据不足 | 100 · 非临时 |
| 提案 | 无（`write_withheld`） | R2「归档一条证据」，走完审批 |

修后那一轮真模型跑完整链路（`server/var/live_p12b.py`，日志 `var/live-p12d.log`）：卡片上写的还是模型的转述，落库以后 `evidence_items.quote` 变成"第三次的账：我照着 JD 补了一周 SQL 练习，做完 3 道窗口函数题…"——与他在行动清单里交回的那段**逐字相同**，`source_ref` 指向 `task_results` 那一行。模型这次挑的是上一条交回的结果而不是最新那条（它有权挑），`supports` / `does_not_support` 两个字段被 schema 丢掉没有落库——那是 P1-4 比较矩阵要接的形。它同时把 `kind` 写成 `"evidence"`：一行证据的来源是代码说了算，现在引用了 `task_results` 就一律记 `action_result`。

### 浏览器里把后半段也跑了一遍

在行动清单里交回第 2 周任务的结果（"用 Kaggle 的泰坦尼克数据集做完一个小分析…6 小时，其中 4 小时在洗数据"）→ 唤醒的 run 读了计划（含他此前交回的全部三段），产出的不是一句复述，而是**跨他自己的两条记录做对照**："清洗占掉绝大部分时间，而你自述的高能量时刻在表达结论"，并明确写下"这只改变了对日常内容和兴趣落点的判断，没有改变先做哪条路这个主问题——那一侧证据仍不足"。卡片上出现"引自你交回的结果（写入时用你的原话）"；采纳之后库里两行证据 `verbatim_match=true`（`quote` 与 `task_results.body` 逐字相等）。

顺手撞到的一条判据实测：那张旧会话里遗留的待确认卡，点"采纳并写入"返回 **409**（审批已过期），界面把它显示成失败文本而不是"已写入"——"已过期审批不能继续执行 / 执行失败不得显示为成功"两条在真界面上成立。（这条提示是英文 "approval is no longer pending"，中文文案待收口。）

### 顺带收口的两处

- **没有出处的证据不再进确认门**：库里存着一行 `quote=""`、`source_ref={}` 的"证据"，是校验之前写进去的——而且 `get_evidence` 会把它当来源喂给后面每一个 run（这轮日志里 `get_evidence → 1 个来源` 就是它）。现在 `CollectEvidencePayload` 用 `model_validator` 要求 quote / source_ref / result_id 至少有一个，否则提案在建卡阶段就是 `unsupported`：让人批准一条打不开的空证据，比不提更糟。那行脏数据已由 `var/drop_unsourced_evidence.py` 删掉（删前整行导出到 `var/deleted-evidence.json`）。
- **卡片说清最后写的是谁的话**：`DecisionCard` 的字段表补 `result_id` → "引自你交回的结果（写入时用你的原话）"，否则人看到的是模型的转述，容易以为批准的就是那句转述。

### 门禁

树静止后重跑 `powershell -File scripts/verify.ps1`，七项全 PASS（日志 `server/var/verify-p12b.log`）：ruff、能力与契约完整性（14 条，0 failed）、`alembic check` 无漂移、全量 pytest（真 MySQL `career_v2_test`，含本轮新增的 `test_the_woken_capability_can_read_what_woke_it` / `test_an_archive_with_nothing_to_open_is_flagged_not_offered` / `test_a_run_reads_the_project_it_belongs_to`）、`tsc --noEmit`、vitest（2 文件 20 例）、`vite build`（41 模块）。门禁只打印 PASS/FAIL 不打印用例数，所以 pytest 的条数以日志为准。

## 21. P1-3：周复盘落表，以及"写完必须有人读"这条纪律（2026-09-20）

闭环第 11 环节（每周复盘）与目标三的第 8 项（人对复盘结果的确认）。这一环的难点不在模型能不能写一段总结，而在**谁有权结束一周**。

### 结构已经把答案定死了

- `weekly_review` 是 R3：`spec.py` 禁止 R3 声明 `proposal_types`，`graph.py` 又对"被批准的 R3 提案"主动判 `failed`。所以 Agent 只能产出 `WeeklyReviewDraft` 成果物，落库必须走人点的 REST：`POST /api/v1/projects/{id}/weekly-review`（`app/api/routes.py:206` → `RunService.confirm_weekly_review`）。
- 幂等两层：`request_id` 由前端生成，重复点击返回同一个 `review_id` + `duplicate: true`；`uq_review_user_week` 是"一人一周一条"，另一个项目来开同一周直接 409（中文文案），不静默改、不另开一周。
- 落库时 `run_id` 指向起草它的那个 run：这条复盘将来能被读回"当时是谁的话让它变成这样"。

### 提前堵掉 P1-2 那个瞎点

第 20 节量到的教训是"写了没人读=死路"。所以这一环同时补读路径：新增只读工具 `get_reviews`（`app/tools/domain.py`，返回本项目已确认的逐周复盘 + `{table: weekly_reviews}` 来源），并挂进 `weekly_review`（看趋势）、`compare_decide`（改结论）、`action_plan`（排下周）。三个能力各一条断言，见 `test_the_capabilities_after_a_review_are_given_the_tool_to_read_it`。

`DigestDraft` 是所有能力共用的起草形状，但复盘和摘要要说的不是一回事：`CapabilitySpec` 新增 `synthesis_notes`（逐项对账、trend 只能 up/flat/down 且要给理由、不许提 proposed），由 `synthesize` 拼进 prompt；复盘的三个字段（`confidence_trend/reason/next_focus`）进 `DigestDraft`，这样界面能编辑、能落库，而不是让趋势烂在散文里。

### 真实模型第一次就把预算问题炸出来了

`var/live_p13.py` 第一轮：**没有产出成果物**，run 以 `run_failed` 结束，原因是 `synthesize: model exhausted max_tokens on reasoning without emitting content`——`thinking="on"` + `max_tokens=2000`，推理把预算吃光，一个字的内容都没回来（§14-S1 的老坑，这次是新能力自己撞上）。系统没有把它伪装成"复盘已生成"，这条就是目标四要的"失败阶段可见"。处置：`weekly_review.max_tokens` 提到 4000（判断型能力要衡量整周，不是关掉 thinking）。

### 第二轮实测（真实模型 + 真实夹具数据）

| 环节 | 结果 |
| --- | --- |
| 周复盘 run 读到的 | `get_plan → 4 条来源`、`get_evidence → 2 条来源`、`get_reviews → 0 条来源`（此时库里确实还没有复盘） |
| 成果物 | `WeeklyReviewDraft`，覆盖度 100、非临时，**proposals = 0**（R3 没有自己落任何东西），run `completed` |
| 草稿质量 | 逐条对账"说了要做什么 / 实际交回什么"，并明写"JD 硬性要求清单没有交回""作品链接或截图没有交回"；`fact_check` 造数 0 条 |
| 不确定性表达 | 趋势判 `flat`，理由是"不是稳，是这次没有可比基线，且本周记录给出的信号方向不一致"——它用 `get_reviews` 的空结果说明了为什么不敢报 `up` |
| 人确认 | `201`，复盘行 `run_id` 指回起草 run；同 `request_id` 再点 → `201 duplicate: true`，`review_id` 不变 |
| 下一环读回 | 随后起的 `compare_decide` run 里 `get_reviews → 1 条来源`，`source_refs = {table: weekly_reviews, id: 4644f9fc…}` |

第 11→12 环节就此接上：本周的账，改变了下一次比较的输入。日志在 `server/var/live-p13b.log`（第一轮失败那份是 `live-p13.log`，保留着，因为它记录的是系统正确的失败行为）。

### 顺带

界面上 `WeeklyReviewCard` 把草稿全部字段预填且可改，按钮写"确认并写入本周复盘"，并明说这一步 Agent 不能替人做；`409/404` 直接显示服务端中文 `detail`。两条旧 tripwire 随之更新：`test_api.py` 的 implemented 集合加入 `weekly_review`（`resume_build` 仍是"不许宣称能用"），`test_obligations.py` 把 `weekly_review` 从"不可承诺目标"列表里移出——它现在是一个真的下一步。

### 界面实测与门禁

浏览器实测（`demo_21235` 真账号 + 真模型草稿）：卡片写明"草稿只是草稿：库里还没有这一周，下面每一栏都能改"和"这一步穗奈做不了：写入本周复盘的只能是你"，并列出"草稿引了 7 句原话"；把起始日改成上一周后点确认，卡片转为"已写入本周复盘"，库里随之多出 `2026-09-14` 那行（`request_id` 是前端生成的 UUID，`run_id` 同样指回起草 run）。

树静止后 `powershell -File scripts/verify.ps1` 七项全 PASS（日志 `server/var/verify-p13.log`）：ruff、能力与契约完整性 14 条、`alembic check` 无漂移、全量 pytest、`tsc --noEmit`、vitest（3 文件 24 例）、`vite build`。新增测试见 `server/tests/test_weekly_reviews.py`（8 例：原样落库且不经任何提案、重复确认幂等、跨项目同周 409、他人项目 404、日期格式在边界就被拒、写进去的能被下一个 run 读回、三个后续能力确有 `get_reviews`、R3 转 implemented 后仍不许自带写权限）与 `test_run_lifecycle.py::test_a_week_is_reviewed_by_the_run_but_closed_by_a_human`。
