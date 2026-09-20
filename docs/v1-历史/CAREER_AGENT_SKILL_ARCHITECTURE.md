# 专业职业规划 Agent：单 Agent + 内置 Skill 架构

> 日期：2026-09-15  
> 结论：建议采用“一个专业职业规划 Agent + 多个内置 Skill”的架构，而不是一开始做多个松散 Agent。这样更利于比赛展示、产品聚焦、工程可控和后续评测。

---

## 1. 前提校正

“做一个 Agent，然后内置 Skill”这个方向是对的，但不能理解成：

```text
一个大模型 + 一个很长的系统提示词 + 很多 if/else
```

更准确的定义应该是：

```text
一个职业规划主 Agent
  + 可路由的专业 Skill
  + 结构化输入输出
  + 只读工具与证据链
  + 用户确认后的安全写入
  + 模型评测和可观测性
```

也就是说，Agent 是用户感知到的统一专家；Skill 是 Agent 内部解决专业任务的模块化能力。

---

## 2. 为什么不建议一开始做多个独立 Agent

| 方案 | 优点 | 风险 | 当前建议 |
| --- | --- | --- | --- |
| 一个 Agent + 多 Skill | 用户体验统一、工程简单、上下文连续、易评测 | 主 Agent 设计要清晰 | 推荐 |
| 多个 Agent 协作 | 看起来更 Agentic，可模拟专家团队 | 调试难、成本高、上下文漂移、结果不稳定 | 后期再加 |
| 纯聊天助手 | 实现快 | 不像专业 Agent，难形成闭环 | 不够 |
| 完全平台化工作流 | 灵活 | 初期开发成本高，偏离 MVP | 暂缓 |

当前阶段最适合：

```text
一个 Career Planning Agent
内部有多个 Skills
必要时模拟多角色审查
但不要暴露成多个分裂的聊天机器人
```

---

## 3. 建议的 Skill 划分

### 3.1 核心职业规划 Skill

| Skill | 解决的问题 | 主要输出 |
| --- | --- | --- |
| Profile Diagnosis Skill | 用户是谁、有什么经历和约束 | 职业画像、优势、约束、信息缺口 |
| Career Option Skill | 用户可以选哪些方向 | 候选方向、推荐理由、反对因素 |
| Fit & Gap Skill | 当前能力和目标岗位差多远 | 匹配点、能力缺口、验证动作 |
| Decision Coaching Skill | 怎么做职业选择 | 决策建议、风险、不确定性、下一步 |

### 3.2 求职执行 Skill

| Skill | 解决的问题 | 主要输出 |
| --- | --- | --- |
| JD Matching Skill | 这个岗位适不适合投 | JD 匹配度、关键词缺口、投递建议 |
| Resume Tailoring Skill | 简历如何针对岗位改 | 定制简历草稿、改写理由、缺证据提示 |
| Project Story Skill | 项目经历怎么讲 | STAR/CAR 表达、面试讲述脚本 |
| Cover Letter Skill | 求职信/私信怎么写 | 求职信、内推私信、邮件草稿 |
| Interview Prep Skill | 面试怎么准备 | 问题库、回答提纲、追问风险、反问问题 |
| Job Search Plan Skill | 接下来怎么推进 | 投递计划、跟进节奏、任务清单 |
| Review Skill | 没反馈怎么办 | 投递漏斗复盘、材料调整、方向修正 |

### 3.3 安全与质量 Skill

| Skill | 作用 |
| --- | --- |
| Evidence Guard Skill | 检查建议是否有证据支持，防止编造经历 |
| Privacy Guard Skill | 判断是否涉及敏感资料和外部模型授权 |
| Approval Skill | 把写入动作变成待确认提案 |
| Model Eval Skill | 比较本地模型和付费模型在同一任务上的表现 |

---

## 4. Skill 不应只是 Prompt

每个 Skill 至少应该包含 6 个部分：

```text
SkillSpec
  ├─ name：技能名称
  ├─ trigger：什么情况下调用
  ├─ required_context：需要哪些上下文
  ├─ tools：允许调用哪些只读工具
  ├─ output_schema：结构化输出
  ├─ guardrails：禁止事项和确认边界
  └─ eval_cases：评测用例
```

示例：

```text
JD Matching Skill
  trigger：用户粘贴 JD，或询问“这个岗位适合我吗”
  required_context：用户画像、项目经历、目标岗位/JD
  tools：get_user_profile, get_personal_evidence, get_job_samples
  output_schema：匹配点、缺口、风险、定制简历建议、是否建议投递
  guardrails：不得编造用户经历，不得承诺拿到面试，不得自动投递
  eval_cases：不同岗位、不同背景、信息不足、JD 过度模糊等案例
```

---

## 5. 推荐目录结构

建议在 Python Agent Server 中新增 Skill 层，不要把所有逻辑继续堆进一个 `graph.py`。

```text
agent_server/app/agents/career_planning/
  graph.py
  state.py
  router.py
  prompts/
  nodes/
    diagnose.py
    plan_tools.py
    execute_skill.py
    approval.py
    synthesize.py
  skills/
    base.py
    profile_diagnosis.py
    career_option.py
    fit_gap.py
    jd_matching.py
    resume_tailoring.py
    project_story.py
    interview_prep.py
    job_search_plan.py
    review.py
    guards.py
  evals/
    cases/
    rubric.py
```

旧的 `career_decision` 可以保留，新的 `career_planning` 平行演进，稳定后再切流量。

---

## 6. 主 Agent 工作流

```text
用户输入
  ↓
Intent / Task Router
  ↓
选择一个或多个 Skill
  ↓
读取可信上下文和只读工具
  ↓
Skill 结构化产出
  ↓
Evidence Guard / Privacy Guard
  ↓
主 Agent 汇总解释
  ↓
生成待确认 Proposal
  ↓
用户确认
  ↓
Spring Boot 幂等写入
  ↓
下次会话继续读取新状态
```

这里的关键点是：

- Skill 可以产生建议。
- Skill 不能直接写业务数据。
- 所有写入必须变成 Proposal。
- Proposal 必须经过用户确认。
- Backend 负责最终业务执行。

---

## 7. 页面如何体现 Skill

用户不一定需要看到内部 Skill 名称，但要看到 Agent 正在执行什么能力。

建议 Timeline 文案：

```text
✓ 正在理解你的职业画像
✓ 正在比较候选方向
✓ 正在分析岗位 JD
✓ 正在生成简历修改建议
✓ 正在准备面试问题
→ 等待你确认是否创建行动计划
```

右侧工作区可以按成果分类：

- 方向
- 证据
- 材料
- 岗位
- 面试
- 行动
- 复盘

---

## 8. 与模型策略的关系

Skill 架构可以帮助我们控制本地模型和付费模型的使用：

| Skill | 推荐模型策略 |
| --- | --- |
| 简单问答 / 资料整理 | 本地模型优先 |
| 结构化 JD 匹配 | 本地模型可先试，失败 fallback 付费模型 |
| 简历定制 / 面试准备 | 强模型优先，特别是比赛展示 |
| Evidence Guard | 规则 + 强模型抽检 |
| Proposal 生成 | 强 schema 校验，模型失败则降级模板 |
| 写入执行 | 不用模型，由后端规则执行 |

这样不是“选择一个模型”，而是“不同 Skill 可以用不同模型策略”。

---

## 9. MVP 优先级

第一版不需要做完所有 Skill。建议先做 5 个：

1. Profile Diagnosis Skill
2. Career Option Skill
3. JD Matching Skill
4. Resume Tailoring Skill
5. Job Search Plan Skill

这 5 个能覆盖：

```text
职业方向 → 岗位匹配 → 简历材料 → 行动计划
```

对于比赛和演示，已经足够体现“专业职业规划 Agent”。

---

## 10. 定义完成标准

一个 Skill 完成，不是写完 prompt 就算完成，而是必须满足：

- 有明确触发条件。
- 有结构化输出 schema。
- 有至少 3 个正常案例和 2 个边界案例。
- 有证据引用规则。
- 有禁止编造和隐私规则。
- 能在本地模型和至少一个强模型上跑同一批用例。
- 前端能展示其过程或产物。
- 如果涉及写入，必须通过 Proposal + 用户确认。

---

## 11. 最终建议

产品层面：

```text
做一个统一的“穗奈职业规划 Agent”
```

工程层面：

```text
内部拆成多个可测试、可路由、可复用的 Skill
```

不要让用户在多个 Agent 之间切换；用户只需要感觉自己在和一个专业职业规划顾问协作。内部可以有多个 Skill 负责不同任务。

一句话：

```text
对用户是一个 Agent；对工程是一个 Skill 系统；对安全是一个审批边界；对评测是一个可比较的任务集。
```
