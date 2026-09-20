# Agent 助手页面改版方案：从聊天页到职业规划 Agent 工作台

> 日期：2026-09-15  
> 结论：建议把页面做得更像“网页 Agent 助手 / 云 Agent 工作台”，但不要照搬 Manus 的通用云电脑定位。我们的差异化应该是“职业规划任务型 Agent”：对话只是入口，核心是任务、证据、候选方向、确认提案和行动闭环。

---

## 1. 前提校正

用户提出“页面要不要更像对话助手、网页对话助手、云 Agent，类似 Manus”。这个方向总体正确，但容易有一个误区：

- 如果只把页面改成大聊天框，本质仍然是 Chatbot。
- 如果照搬 Manus 的“通用云电脑 / 文件 / 浏览器 / 网站生成”体验，会偏离职业规划赛道。
- 更合适的是学习 Manus 的“任务执行感”：用户下达目标，Agent 拆解步骤，展示过程，产出可确认结果。

因此本项目页面不应只是“ChatGPT 式聊天页”，而应是：

```text
对话入口 + Agent 任务流 + 证据面板 + 职业方向比较 + 待确认提案 + 行动计划
```

---

## 2. 当前前端状态

当前已有基础页面：

- `web/src/pages/Assistant.vue`：已有会话侧边栏、对话区、欢迎语、消息发送、历史会话、依据/不确定性展开。
- `web/src/api/assistant.ts`：已有 `/chat/messages`、会话列表、会话详情、重命名、删除等 API。
- `web/src/router/index.ts`：已有 `/assistant` 路由。

所以不需要重建一个聊天助手页面。应该在现有 `Assistant.vue` 基础上升级为 Agent 工作台。

---

## 3. Manus-like 体验应该学什么

### 3.1 值得学习

| Manus-like 能力 | 我们的职业规划版本 |
| --- | --- |
| Chat mode / Agent mode 区分 | “快速问答”与“职业规划任务”分开 |
| Agent 自主规划任务 | 展示“已读取资料 → 正在分析 → 生成提案 → 等待确认” |
| 实时进度可见 | Agent Timeline：读取画像、比较方向、生成行动建议 |
| 交付结果 | 输出职业方向比较、证据卡、行动计划、复盘建议 |
| 子任务/任务列表 | 方向验证任务、简历任务、访谈任务、学习任务 |
| 持久线程 | 每个职业规划项目都是一个 Agent Thread |
| 文件/资料输入 | 支持简历、成绩、项目经历、岗位 JD 上传/解析 |

### 3.2 不建议照搬

| 不建议照搬 | 原因 |
| --- | --- |
| 云电脑/远程 VM 概念 | 过重，和职业规划 MVP 不直接相关 |
| 通用文件系统 | 增加安全、隐私和实现成本 |
| 浏览器自动操作 | 比赛阶段容易不稳定，且数据合规风险高 |
| 万能 Agent 平台 | 容易稀释职业规划定位 |
| 完全自治执行 | 职业决策属于高影响建议，必须人类确认 |

---

## 4. 推荐页面形态

### 4.1 桌面端布局

```text
┌───────────────────────────────────────────────────────────────┐
│ 顶部：当前职业规划项目 / 模型状态 / Agent 模式 / 隐私状态        │
├───────────────┬───────────────────────────────┬───────────────┤
│ 左侧线程栏     │ 中间 Agent 对话与任务流          │ 右侧上下文面板 │
│               │                               │               │
│ - 规划线程     │ - 用户目标                      │ - 职业画像     │
│ - 候选方向     │ - Agent 消息                    │ - 证据卡片     │
│ - 行动计划     │ - 工具调用 Timeline             │ - 候选方向比较 │
│ - 复盘         │ - 待确认提案                    │ - 下一步任务   │
└───────────────┴───────────────────────────────┴───────────────┘
```

### 4.2 移动端布局

移动端不适合三栏，建议：

```text
顶部项目选择
中间对话流
底部 Tab：证据 / 方向 / 提案 / 行动
```

---

## 5. 核心组件建议

### 5.1 Agent 模式切换

在页面顶部提供两个模式：

| 模式 | 用途 | 成本/风险 |
| --- | --- | --- |
| 快速问答 | 简单职业问题、解释概念、轻量建议 | 低成本，可用本地模型 |
| 职业规划任务 | 多步推理、读取上下文、生成提案、行动计划 | 成本更高，适合强模型或可切换模型 |

注意：这个模式不是必须立刻后端完全实现，前端可以先作为信息架构和用户预期管理。

### 5.2 Agent Timeline

每次运行展示状态：

```text
✓ 已读取职业画像
✓ 已读取候选方向
✓ 已读取个人证据
✓ 已比较岗位要求
→ 正在生成行动提案
○ 等待用户确认
```

对应后端/Agent Server 的事件：

- `node_started`
- `node_completed`
- `tool_plan_created`
- `tool_called`
- `tool_completed`
- `approval_required`
- `proposal_generated`

### 5.3 证据卡片

每条建议旁边显示：

- 依据：来自用户画像、项目经历、岗位样本、行动计划、复盘记录。
- 置信度：高 / 中 / 低。
- 反对意见：为什么可能不适合。
- 信息缺口：还需要确认什么。

### 5.4 候选方向比较卡

不要只给聊天回复，要给结构化比较：

| 方向 | 适配度 | 机会 | 风险 | 验证成本 | 下一步 |
| --- | --- | --- | --- | --- | --- |
| AI 产品经理 | 中高 | 高 | 作品集不足 | 中 | 做一个 AI 产品 case |
| 后端开发 | 中 | 稳定 | 兴趣待验证 | 中 | 完成后端项目 demo |
| 数据分析 | 中 | 中 | 竞争同质化 | 低 | 分析 3 个 JD 要求 |

### 5.5 待确认提案

每个 Agent 建议都应落成“待确认卡片”：

```text
Agent 建议新增候选方向：AI 产品经理
原因：你的项目经历与 AI 应用产品化高度相关
风险：缺少真实产品增长/商业化证据
确认后将：新增候选方向 + 创建 3 个验证任务
[确认执行] [暂不执行] [修改后执行]
```

### 5.6 任务成果区

类似 Manus 强调“交付成果”，我们的成果不是 PPT/网站，而是：

- 职业方向比较报告
- 个人证据账本
- 能力差距清单
- 2 周验证计划
- 简历优化建议
- 访谈问题清单
- 周复盘总结

---

## 6. 与当前页面的改造路径

### Phase 1：低风险 UI 改造

目标：不改大后端，只让页面更像 Agent。

- 保留左侧会话历史。
- 中间继续保留聊天流。
- 新增右侧 `AgentWorkspacePanel`。
- 消息下方新增“工具轨迹 / 依据 / 不确定性 / 下一步”。
- 欢迎页从“问我问题”改成“开启一个职业规划任务”。

### Phase 2：接入现有 Agent Run

目标：从普通 `/chat/messages` 逐步切到 `/api/v1/agent-runs/career-decision`。

- 前端新增 `web/src/api/agentRuns.ts`。
- 支持 `runCareerDecision`、`resumeCareerDecision`、`applyProposal`。
- Timeline 使用 Agent Server 返回的 events。
- Proposal 卡片调用后端 apply 接口。

### Phase 3：项目级 Agent Thread

目标：每个职业规划项目成为一个 Agent Thread。

- `/decision-projects/:id` 页面中嵌入 Agent 面板。
- `/assistant` 成为全局入口。
- 从项目页跳转到助手时带上 `projectId`。
- Agent 读取的是后端可信上下文，不信任浏览器拼接 context。

### Phase 4：职业规划 Agent 工作台

目标：形成完整产品差异化。

- 首页突出“创建职业规划 Agent”。
- 一个用户可以有多个职业规划项目。
- 每个项目有方向、证据、行动、复盘、Agent 线程。
- Agent 能持续更新建议，不是一次性回答。

---

## 7. API 与数据结构建议

### 7.1 前端 Agent Run 类型

```ts
export type AgentRunEvent = {
  type: 'node_started' | 'node_completed' | 'tool_plan_created' | 'tool_called' | 'tool_completed' | 'approval_required' | 'proposal_generated'
  node?: string
  message?: string
  metadata?: Record<string, unknown>
}

export type AgentProposalCard = {
  id: string
  type: 'add_candidate' | 'collect_evidence' | 'create_task' | 'adjust_task'
  title: string
  rationale: string
  risks: string[]
  payload: Record<string, unknown>
  status: 'pending' | 'applied' | 'rejected'
}
```

### 7.2 页面状态

```ts
export type AgentWorkspaceState = {
  mode: 'quick_chat' | 'career_planning'
  threadId: string | null
  projectId: number | null
  events: AgentRunEvent[]
  proposals: AgentProposalCard[]
  evidenceCards: EvidenceCard[]
  selectedCandidateId: number | null
}
```

---

## 8. 风险与成本

| 风险 | 说明 | 建议 |
| --- | --- | --- |
| UI 像 Manus 但能力跟不上 | 用户期待自主完成复杂任务 | 页面文案明确“职业规划任务”，不要承诺通用云电脑 |
| Agent 过程不可控 | 多步工具调用可能慢或失败 | 先做只读工具轨迹和可恢复状态 |
| 隐私风险 | 职业资料、简历、个人经历敏感 | 明确本地模型/外部模型状态和授权 |
| 付费模型成本 | Agent 模式比聊天更贵 | 快速问答用本地模型，关键节点用强模型 |
| 前端复杂度上升 | 三栏工作台会增加状态管理 | 先做右侧只读面板，再接确认动作 |

---

## 9. 最终建议

建议把页面做得更像 Manus 类 Agent 产品，但只学习三件事：

1. **任务感**：Agent 不是回答问题，而是在推进职业规划任务。
2. **过程可见**：展示读取了什么、正在分析什么、下一步要做什么。
3. **结果可执行**：每个建议都能变成待确认提案和行动计划。

不要学习它的通用云电脑定位。我们的产品定位应更清晰：

```text
穗奈不是万能云 Agent，而是一个职业规划 Agent。
她通过对话理解目标，通过工具读取证据，通过提案推进决策，通过行动计划持续陪伴。
```

---

## 10. 建议下一步实施

如果进入代码实现，建议按这个顺序：

1. 新建 `web/src/api/agentRuns.ts`，封装后端 Agent Run API。
2. 新建 `web/src/components/assistant/AgentTimeline.vue`。
3. 新建 `web/src/components/assistant/AgentWorkspacePanel.vue`。
4. 在 `Assistant.vue` 改为三栏布局：左侧线程、中间对话、右侧 Agent 工作区。
5. 先用当前响应里的 `evidenceBasis / uncertainties / nextStep / actions` 填充右侧面板。
6. 再接入真正的 `agent-runs/career-decision` 事件和 proposal apply。

---

## 11. 参考来源

- Manus Help Center：Chat mode 与 Agent mode 差异  
  https://help.manus.im/en/articles/11711128-what-are-the-differences-between-chat-mode-and-agent-mode
- Manus Help Center：Cloud Computer 说明  
  https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer
- Manus API：Agents overview  
  https://open.manus.ai/docs/v2/agents-overview
- Manus API：Introduction  
  https://open.manus.ai/docs/v2/introduction
- Manus Blog：My Computer / Desktop  
  https://manus.im/blog/manus-my-computer-desktop

---

## 12. 求职执行工作台补充

如果产品定位扩展到“帮客户制作找工作相关材料”，页面应在职业规划工作台之外增加“求职执行”视角。

建议右侧 Agent 工作区增加这些 Tab：

| Tab | 内容 |
| --- | --- |
| 方向 | 候选职业方向、适配度、风险、验证动作 |
| 证据 | 用户经历、项目、技能、岗位要求、可信来源 |
| 材料 | 简历版本、项目描述、求职信、个人介绍、平台资料文案 |
| 岗位 | JD 匹配、关键词差距、投递优先级 |
| 面试 | 问题库、回答提纲、项目讲述、反问问题 |
| 行动 | 投递任务、学习任务、作品集任务、复盘任务 |

页面文案应避免“我可以替你完成一切求职动作”，更适合表达为：

```text
我会帮你规划方向、制作材料、准备面试，并把每一步变成可确认、可追踪的行动。
```

---

## 关联：单 Agent + Skill 架构

- 专业职业规划 Agent 的 Skill 化架构详见：docs/CAREER_AGENT_SKILL_ARCHITECTURE.md。

