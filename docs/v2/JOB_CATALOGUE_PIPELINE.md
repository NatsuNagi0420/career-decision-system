# 岗位证据库更新与按用户检索技术方案

> 日期：2026-09-21  
> 状态：**A 已实施（§15），B/C/D 未实施**  
> 对应需求：定时更新岗位库，使 Agent 能根据用户情况给出岗位  
> 本文是需求取舍与技术边界，不是爬虫说明书。不自动操作招聘网站（见 `PROJECT_GOAL.md` §七）。

---

## 0. 结论先行

| 命题 | 判断 | 说明 |
| --- | --- | --- |
| 岗位必须是真实雇主 JD | **成立** | 结论只能引用原文，不能引用模型常识 |
| 库必须能更新、能过期 | **成立** | 当前 808 条是一次性导入，表上没有可证伪的时间 |
| 必须做成日更全网招聘库 | **不成立** | 那是招聘平台，不是职业决策 Agent |
| 必须按用户情况给出岗位 | **部分成立** | 成立的是「带理由的样本检索」；不成立的是「匹配度推荐引擎」 |
| 定时爬智联/Boss/实习僧 | **作为本项目路径不可行** | 合规、反爬、运维、产品偏移同时不成立 |
| 当前 v2 能否直接上定时同步 | **不能** | 缺批次、原文、去重键、时间戳、过期、审核门闩 |

**推荐建设的系统名称：岗位证据管家（Catalogue Steward）**，不是 Job Crawler，也不是推荐引擎。

一句话目标：

> 让 Agent 在授权数据与用户主动提供的 JD 上，按学生的城市、求职类型、候选方向和证据缺口，取出少量可引用的真实岗位样本；样本可批次替换、可过期下线、可追溯到原文。禁止把关键词命中数显示为「适合度」。

---

## 1. 需求复述（甲方原意）

提出方的意图拆成四条，避免后文偷换：

1. 过去有真实岗位数据，筛选后约 800 条进入系统。
2. 职业规划 Agent 需要真实岗位，而不是目录散文。
3. 岗位库应能定时更新，以免结论建立在过期市场上。
4. 更新之后，Agent 应能根据用户情况推荐岗位。

后文按这四条设计，但第 3、4 条必须改写成可验收、不违法、不破坏现有决策闭环的形态。否则会在试点阶段把青穗集做成劣质招聘网站。

---

## 2. 前提校正（事实，不是观点）

以下均已在本机库与代码中核对。

### 2.1 「800 条」是什么

| 项 | 事实 |
| --- | --- |
| 旧库 | `career_db.t_2025_multi_area_job_info` **恰好 800 行**，与 v2 `jobs` 808 行（800 智联 + 8 种子）对应 |
| 来源 URL | `https://www.zhaopin.com/jobdetail/...` |
| 旧表时间 | `update_date` 为「6月28日」这类**无年份**中文月日，不能做新鲜度判断 |
| 去重 | `job_code` 799 个不重复 / 800 行，故 v2 **故意不建** `(source_platform, source_job_code)` 唯一键 |
| 实习/校招 | 标题命中 0 |
| 经验字段 | 800/808 为空 |
| 方向关联 | 1022 条，全部未审；规则噪声仍在（数据分析下挂实施工程师） |
| 进入方式 | `scripts/import_catalog.py` 一次性从 v1 导入，有数据则拒绝再导 |

因此：不是「活的岗位库被筛成 800」，而是「一份 2025 智联多地区切片被固化」。更大的原始采集如果曾经存在，已不在当前 `career_db` 里。定时更新**没有现成增量接口可以接**。

### 2.2 v1 已经做过的「推荐」是什么

`POST /jobs/recommendations` 接受 `target_role` / `target_cities` / `skills`，甚至把 `mbti_type` 放进请求，返回 `matchScore: 95` 与「技能关键词命中 2 项」。

这与现行原则冲突：

- `PROJECT_GOAL.md`：不允许把证据数量表达为职业适合度；不以推荐一个职业为目标。
- `compare_candidates` 现行规则：`score = 命中的逐字证据条数，上限 5`。
- 人格硬规则：不得复述未经工具返回的数字、薪资、要求。

若定时更新是为了把 v1 的 `matchScore` 做大，这是回退，不是演进。

### 2.3 产品真正要的「真实」

真实 = 雇主写过、可逐字引用、能指回出处、采集时间已知、对得上学生的市场切片（实习/校招/城市/方向）。  
「今天还在招、能投递」是招聘网站的真实，不是本 Agent 的验收项。本阶段明确不做自动投递、不做自动操作招聘网站。

---

## 3. 目标与非目标

### 3.1 要做

1. **可替换的样本库**：新批次能进、旧批次能过期、Agent 只读未过期且质检通过的行。
2. **原文账本**：每条岗位保留 raw、hash、采集时间、来源类型；要求拆成 `job_requirement_items.original_text`。
3. **按用户约束检索 5–8 条样本**，每条带「为何出现 + 对上哪些原文 + 仍缺什么」。
4. **用户主动提交 JD** 成为一等公民来源（粘贴原文；可选：用户指定的单条 URL，失败则退回粘贴）。
5. **方向关联默认 pending**，未审核不得当作「该方向的市场现状」主样本。

### 3.2 不做

- 不采集、不定时登录、不绕过招聘网站的访问控制或反爬（本文不提供此类设计）。
- 不恢复 v1 的 `matchScore` / MBTI 推荐。
- 不建设收藏夹信息流、投递台账、ATS。
- 不把开放联网搜索的摘要当作岗位证据。
- 不在 FastAPI 进程内 `asyncio.create_task` 里跑采集（P2 已证明这条路径不可靠）。

---

## 4. 总体架构

```text
        合法批次文件 / 学校就业数据 / 用户粘贴的 JD
                         │
                         ▼
              ┌─────────────────────┐
              │  Ingest Adapter     │  校验来源类型、授权标记、体积
              │  （接入适配器）      │
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  job_raw_records    │  原文 + hash + captured_at
              │  job_import_batches │  批次、操作者、统计、失败行
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  Normalize          │  城市/薪资/求职类型/标题
              │  Extract            │  任职要求 → original_text
              │  Link (pending)     │  方向关联提案，默认未审
              └─────────┬───────────┘
                        ▼
              ┌─────────────────────┐
              │  jobs + items       │  质检通过才 status=active
              └─────────┬───────────┘
          ┌─────────────┴──────────────┐
          ▼                            ▼
  只读工具 retrieve_job_samples    过期扫描 expire_stale_jobs
  （按用户约束取 5–8 条）          （独立进程，不在请求路径）
          ▼
     compare / evidence / plan     仍只引用 original_text
```

调度：Windows 计划任务或独立 worker 调用

`python -m scripts.catalogue_refresh --source <adapter>`

禁止挂在 Agent Run 或 FastAPI 生命周期里。

---

## 5. 数据模型（相对现状的增量）

v1 schema review 已要求分层，v2 **没建**。本方案补回，并加上学生场景缺的字段。

### 5.1 新增表

**`job_import_batches`**

| 列 | 用途 |
| --- | --- |
| id, created_at, operator_user_id | 审计 |
| source_type | `dump` / `school` / `user_paste` / `user_url` |
| source_label | 例如 `gz-campus-2026q3` |
| license_note | 授权/来源说明，空则不得标 `dump` |
| stats_json | 读入/去重/入职/失败 |
| status | `running` / `committed` / `failed` / `reverted` |

**`job_raw_records`**

| 列 | 用途 |
| --- | --- |
| id, batch_id | 归属批次 |
| payload | 原样 JSON/文本，不在展示层改写 |
| content_hash | SHA-256，跨源去重主键 |
| source_url | 可空；用户粘贴可无 URL |
| captured_at | **必须有**，UTC |
| fetch_status | `provided` / `fetched` / `failed` |

同一 `content_hash` 在有效期内不重复建 `jobs` 行，只更新 `last_seen_at`。

### 5.2 `jobs` 增列

| 列 | 用途 |
| --- | --- |
| captured_at | 采集时间，Agent 展示「样本日期」 |
| last_seen_at | 最近一次批次仍见到 |
| expires_at | 超过则不得被检索工具返回 |
| content_hash | 对应 raw |
| work_type | `intern` / `campus` / `fulltime` / `unknown` |
| source_type | 与批次一致 |
| quality_flags | JSON，如 `no_experience` / `html_noise` / `unreviewed_link` |
| batch_id | 最后写入批次 |

**去重策略（吸收 799/800 教训）：**

- 主去重键：`content_hash`
- 辅键：`(source_platform, source_job_code)` **非唯一**，仅作提示
- 冲突：同 hash 合并；同 code 不同 hash 视为更新，旧行 `status=superseded`

现有 808 行迁移：`source_type=legacy_zhaopin_2025`，`captured_at` 空，`quality_flags` 含 `undated`，**默认不进入学生主检索**，只作社招对照且 `is_provisional`。

### 5.3 关联与抽取

沿用 `job_requirement_items`（`original_text` + `extractor_name@version`）和 `career_direction_job_rel.review_status`。

新规则：**检索工具默认 `review_status=reviewed`。** 未审关联可在探索能力里当线索，但文案必须是「未审核，可能挂错方向」。

---

## 6. 接入层：源策略（可行性的核心）

按「能否作为定时更新的合法输入」分级。**只评估路径，不提供对招聘站的采集实现。**

| 级别 | 源 | 能否定时 | 对学生是否真 | 可行性 | 说明 |
| --- | --- | --- | --- | --- | --- |
| L0 | 用户粘贴 JD 正文 | 随使用发生 | 最高 | **高** | 对齐城市/实习/他真会看的岗；已是验证任务形态 |
| L1 | 策展批次（手工/就业办/老师收集的实习校招） | 月/季 | 高 | **高** | 试点的主库；25 方向 × 15–30 条即够 |
| L2 | 授权数据集、学校导出、合作方 CSV | 按合同 | 中高 | **中** | 取决于有没有源；有则写 adapter，无则不做 |
| L3 | 用户给出的**单条** JD URL，系统只拉这一页 | 随使用 | 高 | **中低** | 须站点允许、失败回粘贴；禁止做成队列爬全站 |
| L4 | Agent 开放联网搜索摘要 | 实时 | 低 | **低** | 摘要不是原文，不可复现，破坏评测 |
| L5 | 多站定时爬取招聘列表/详情 | 日/时 | 表面高 | **对本项目不可行** | 条款、反爬、登录、HTML 漂移、产品变成招聘站 |

**定时更新的合法含义：** L1/L2 按日历跑批次；L0/L3 按用户事件写入。不是 L5。

试点最低诚实配置：

- 每个试点可能用到的方向，至少 15 条 **实习或校招** 样本，含广州（或学生所在城市）。
- 旧 800 条智联社招打标隔离。
- 每个学生至少交回 2–3 条自己找的 JD。

---

## 7. 解析、质检、关联

流水线对每条 raw：

1. **Normalize**：城市去区划噪声（旧数据有「东莞-None」）；薪资解析沿用现字段；`work_type` 用标题/正文规则（实习/应届/校招/社招），不明则 `unknown`，学生检索默认排除 `fulltime`+无实习标记的社招。
2. **Extract**：任职要求拆行，写入 `original_text`，禁止改数字。抽取器版本化，重跑可重建条目而不改 raw。
3. **Quality gate**（不通过则 `status=rejected`，Agent 不可见）：
   - 正文长度下限
   - 至少 N 条 requirement items（建议 N=3）
   - `captured_at` 非空（legacy 除外且不进主检索）
   - 非空标题与城市
4. **Link**：规则/模型提议方向，**一律 pending**。人工（或老师账号）审核后才 `reviewed`。
5. **Expire**：`expires_at = captured_at + TTL`。建议实习 90 天、社招 180 天。过期行保留供审计，检索工具不返回。

质检是门闩。没有门闩的定时更新，只会把噪声刷新得更快。

---

## 8. Agent：「按用户情况给出岗位」怎么做

不恢复 `POST /jobs/recommendations`，不引入协同过滤。新增只读工具：

```text
retrieve_job_samples(
  project_id,
  direction_id?,          # 缺省：当前项目候选
  city?,                  # 缺省：画像约束
  work_type?,             # intern/campus，学生默认这两者
  limit=6                 # 上限 8
)
```

### 8.1 硬过滤（代码，模型不能关）

- `jobs.status=active` 且 `now < expires_at`
- `work_type` 命中
- 城市：画像城市或项目约束；空城市的岗降权或排除
- 方向：仅 `review_status=reviewed` 的关联
- 同一公司同一标题只留最新 hash

### 8.2 排序（确定性，可解释）

对过滤后的集合打分，**不得输出 0–100 适合度**：

```text
overlap = 与画像事实、比较标准、缺口关键词 命中的 requirement 条数
gap     = 该岗有、用户证据没有的硬性要求条数
score   = overlap  （展示为「对上 N 条原文」）
```

返回顺序：`overlap` 降序，其次 `captured_at` 新者优先。`gap` 大的岗仍然可以出现——对学生，缺口样本往往比「全对上」更有决策价值。

### 8.3 返回形状（必须能进证据账本）

每条样本：

- job_id, title, company, city, salary_text, work_type, captured_at
- `why_selected`：城市 / 方向 / 求职类型（代码生成，不许模型编）
- `matched_quotes[]`：对上的 `original_text`
- `gap_quotes[]`：用户尚未有证据的要求原文
- `source_refs`

模型只叙述这些字段。禁止再生成 `matchScore`。比较矩阵继续只用引文，不用检索分。

### 8.4 与现有闭环的衔接

| 能力 | 用法 |
| --- | --- |
| `direction_explore` | 取该方向 reviewed 样本，回答「实际在做什么」 |
| `evidence_collect` | 把样本要求归档；或生成「请再贴 2 条本地实习 JD」任务 |
| `compare_decide` | 格子引用条目原文，不引用检索分 |
| `action_plan` | 任务可以是「针对 gap_quotes 去补证据」，不是「去投这 8 个岗」 |

用户未选方向时：**拒绝岗位检索**，只允许方向探索。这是防止「没决策问题就推荐岗位」的产品门闩。

---

## 9. 运行与调度

| 项 | 选择 | 理由 |
| --- | --- | --- |
| 进程 | 独立 CLI + 操作系统计划任务 | 避开当前 FastAPI 同步 DB / 进程内 task 的 P2 风险 |
| 频率 | 策展库 **每月或每季**；用户粘贴实时 | 决策证据不需要分钟级 SLA |
| 失败 | 批次 `failed`，不部分提交；可 revert | 避免半新半旧被 Agent 读到 |
| 观测 | 批次统计 + 过期数量 + 检索工具空结果率 | 空结果应触发「请粘贴 JD」，而不是让模型补市场 |
| 规模 | 先按 **≤5,000** 条设计 | 架构文档已否决向量库；此量级 SQL 过滤足够。破万再评估 MySQL 内余弦 |

---

## 10. 技术可行性评估

评分含义：高 = 以现有栈 1–2 周可做出可验收切片；中 = 能做但依赖外部或要先补表；低 = 能写代码但产品/合规不成立。

| 模块 | 可行性 | 依据 | 主要风险 |
| --- | --- | --- | --- |
| 补批次/原文/时间戳/过期 schema | **高** | v1 已设计，v2 未建；Alembic 成熟 | 808 行无日期，必须隔离而非假装有 `captured_at` |
| 用户粘贴 → 条目 → 证据 | **高** | 与 `task_results`→`EvidenceItem` 同构 | 抽取质量；学生贴广告页 |
| 策展实习/校招批次导入 | **高** | 离线 CSV adapter 工作量可控 | **内容从哪来**是人力问题，不是工程问题 |
| 确定性检索工具 | **高** | 过滤+关键词重叠已有先例 | 打分弱；必须文案纪律 |
| 方向关联审核工作流 | **中** | 字段已有，流程没有 | 无人审则检索为空或继续噪声 |
| 授权数据源定时拉 | **中、源依赖** | adapter 好写 | 现在没有已签约源 |
| 用户单条 URL 抓取 | **中低** | 单 URL 技术简单 | 条款、反爬、登录墙；必须可降级粘贴 |
| 语义向量推荐 | **现阶段低收益** | 语料 ≪ 万；已否决独立向量库 | 会把 overlap 伪装成适合度 |
| 开放联网搜索当证据 | **低** | 与 `source_refs`、评测复现冲突 | 知乎/广告混进市场现状 |
| 多站定时爬库 | **对本项目不可行** | 见 §6 L5；`PROJECT_GOAL` 明确禁止自动操作招聘站 | 法律、封禁、HTML 漂移、产品偏移。本文不评估如何实现 |

### 10.1 「定时更新有没有必要」

**有必要的部分：** 样本必须能被新批次替换，过期必须对 Agent 不可见。否则「市场现状」不可证伪。这是管家管道，不是爬虫。

**没有必要的部分：** 为了推荐而日更全网。试点 10–15 人、决策周期以周计，月/季更新的实习校招样本 + 学生当场粘贴，在证据质量上优于日更的错方向社招。

### 10.2 「根据用户情况推荐」能不能做

能做 **检索**，不能做诚实的 **推荐引擎**。

用户侧可用信号（已存在或易取）：城市、学历、毕业年、候选方向、比较缺口、已归档证据。  
不可用信号：MBTI、库内点击协同、未审关联、过期岗、模型对市场的记忆。

v1 `matchScore: 95` 那种接口，技术上半天能仿出来，**可行性高、正确性低**。本方案把「能写」和「该上」分开。

### 10.3 工作量（仅管家路径，不含爬虫）

| 阶段 | 范围 | 粗估 |
| --- | --- | --- |
| A | schema + legacy 打标隔离 + 过期字段 | 2–4 日 |
| B | 粘贴入库 + 抽取 + 进证据 | 3–5 日 |
| C | 批次导入 CLI + 质检 + pending 关联 | 4–7 日 |
| D | `retrieve_job_samples` + 样本卡 UI（非信息流） | 4–6 日 |
| E | 审核工作流（最小：后台列表 + 通过/拒绝） | 3–5 日 |
| 策展内容 | 每方向 15–30 条实习/校招 | **人力主成本**，工程代劳不了 |

A–D 可在现有 FastAPI + MySQL + 只读工具框架内完成，不引入新中间件。E 可以先用 SQL/内部页。

---

## 11. 分期与门闩

与 `PROJECT_GOAL.md` 对齐：不能让本方案抢 P2 可靠性与 P3 真模型评测。岗位管道是 **P4 试点的数据前提**，不是 P0。

**进入开发的门闩（同时满足）：**

1. 比较棋盘/任务交回在 UI 上可见（否则新样本仍埋在聊天里）。
2. 明确首批内容从哪来（就业办 / 老师 / 手工，而不是「先把爬虫写了再找数据」）。
3. 文案采用「岗位样本」，产品与 UI 不出现「精准推荐」「匹配度 xx%」。

**阶段门闩：**

- A 完成前，禁止写检索工具（否则继续检索 undated 智联社招）。
- 无 reviewed 关联前，禁止把某方向的岗称为「该方向市场现状」。
- 没有 L0 粘贴前，不宣称「能跟用户情况对齐」——对齐的主通道是用户自己的 JD。

---

## 12. 验收标准

不以「库里有多少条」为完成。同时满足：

1. 新批次可完整提交或整批失败，Agent 读不到半成品。
2. 过期样本检索不到；界面能看到样本日期。
3. 学生主检索默认实习/校招；legacy 800 条不出现在主列表，除非显式打开「社招对照」。
4. 检索结果每条有代码生成的 `why_selected` + 至少 1 条 `original_text`；无 `matchScore`。
5. 用户粘贴的 JD 能进入证据并改变比较格。
6. 未审方向关联不进入主检索。
7. 刷新管道在独立进程跑；杀掉 API 进程不中断、不损坏批次。
8. 固定评测集不依赖外部网页。

---

## 13. 风险与忽略变量

- **内容源：** 工程做完而没有实习 JD，管道是空转。这是本方案最大风险。
- **审核人力：** 自动关联不审就启用，会精确刷新噪声。
- **分布偏差：** 源偏向测试/销售时，检索会放大库的形状。硬过滤 `work_type` 只能部分缓解。
- **旧数据无年份：** 不能回填假 `captured_at`。
- **法律：** 无授权批量抓取招聘站不在可行路径内；单 URL 也要可降级。
- **产品文案：** 「推荐」一词会把老师和学生的预期拉到 Boss。对外说「按你的约束取出可引用的岗位样本」。
- **P2：** 管道若塞进现有 web 进程，会继承同步 DB 阻塞。

---

## 14. 决策建议（供立项勾选）

建议采纳：

- [ ] 建设 Catalogue Steward（§4–§9），不建设多站爬虫
- [ ] 「推荐」在技术与 UI 上落实为 `retrieve_job_samples`
- [ ] L0 粘贴 + L1 策展作为试点数据源；L2 有源再接
- [ ] 800 条智联社照隔离为 legacy
- [ ] 本方案排在闭环可见性与运行可靠性之后，作为试点数据前提

明确拒绝：

- [ ] 以定时爬取各招聘网站作为更新手段
- [ ] 恢复 v1 `matchScore` / MBTI 岗位推荐
- [ ] 用联网搜索摘要填比较矩阵

若以上「建议采纳」不能勾选，则本需求应退回产品讨论，而不是开工。

---

## 15. 实施记录：阶段 A（2026-09-21）

范围只到 §10.3 的 A 行：schema、legacy 打标隔离、过期字段与数据层查询规则。**B/C/D 未动**（见 §15.3）。

### 15.1 做了什么

**迁移 `f495db1845fc`（`job catalogue batches and provenance`，down = `3f9a41c7de05`）**

- 新表 `job_import_batches`：`source_type`（`dump`/`school`/`user_paste`/`user_url`）、`source_label`、`license_note`、`stats_json`、`status`（`running`/`committed`/`failed`/`reverted`）、`operator_user_id`、`created_at`、`finished_at`。
- 新表 `job_raw_records`：`payload` 原文、`content_hash`、`source_url` 可空、`captured_at` 必填、`fetch_status`、`batch_id`（CASCADE）。它是**追加式账本**，不按 hash 去重——「同一段正文在 3 月又见到一次」本身是市场事实，也正是 `last_seen_at` 的来源。
- `jobs` 增列：`captured_at`、`last_seen_at`、`expires_at`、`content_hash`、`work_type`、`source_type`、`quality_flags`、`batch_id`。
- 去重主键 `content_hash` **建了唯一索引**；`(source_platform, source_job_code)` 保持非唯一（库里实测 800 条智联行只有 799 个不重复 code，全库 808 行 / 807 个；建键会让导入当场失败）。`jobs.batch_id` 用 `ON DELETE SET NULL`：删批次不连带抹掉岗位行。
- 同一条迁移里做数据打标（增量，不改生产库手工状态）。`career_v2` 升级后实测：

  | 项 | 结果 |
  | --- | --- |
  | `source_type` | 808/808 = `legacy_zhaopin_2025`（800 zhaopin + 8 seed；`source_platform` 保持原值不变） |
  | `work_type` | 808/808 = `unknown`。旧数据里没有可读的东西支持 `fulltime`，写 `fulltime` 就是替那份切片编一个它没答过的分类 |
  | `quality_flags` | 795 行 `["undated","no_experience"]`、8 行 `["undated"]`（seed 那 8 条有经验字段）、5 行额外 `no_description`（智联那 5 条空正文） |
  | `captured_at` / `expires_at` / `content_hash` | **808 行全部仍为 NULL**（非空计数 = 0）。没有原始 payload 可 hash，也没有日期可回填 |

**数据层规则 `server/app/db/catalogue.py`（新增，只到规则为止）**

- `retrieval_ready_jobs()`：`status=active` 且（`expires_at` 为空 或 `now < expires_at`）——含 legacy，用作社招对照。
- `student_main_jobs()`：在上面之外再要求 `captured_at` 非空 **且** `expires_at` 非空。理由：主检索的每一行既要报得出「样本日期」，也要有死线可退；只满足其中一条不算可证伪。那 808 条两条都不满足，因此**不需要任何人记得按名字排除它们**。
- `is_retrieval_ready()` / `is_student_main_ready()` 不自带一份 Python 版谓词，而是去跑上面那两条语句——同一条规则不留两处。
- `record_incoming_job()`：同 hash → 合并、草稿不落表、只挪 `last_seen_at`；同 `(source_platform, source_job_code)` 不同 hash → 旧行 `superseded`、插入新行；否则插入。返回 `(行, 动作)` 给批次统计用。legacy 那 808 条没有 hash 可撞，正是靠后半条规则在新批次进来时安静退场。
- `new_import_batch()`：`dump` 且 `license_note` 为空 → 直接抛错；不是那四种来源类型之一 → 抛错。
- 过期只做在查询条件里，**没有** `expire_stale_jobs` 之类的写库进程（§4 图上那条属于后续）。

**测试：新增 22 条（`tests/test_catalogue_rules.py` 17、`tests/test_catalogue_migration.py` 5）**

- 迁移侧在隔离探针库 `career_v2_migrate_probe` 上真跑 alembic 子进程：空库（连库本身都不存在）一路 `upgrade head`；以及先升到 `f495db1845fc` 的上一条、用旧 schema 的原始 SQL 插 3 行、再升 head，断言这三行**被打了标且三个时间/hash 列仍为 NULL**。断言里的标记字面量取自 `app.db.catalogue` 的常量，迁移 SQL 与代码由此互相钉住。同一条 revision 还来回跑了 `downgrade -1` → `upgrade head`，第一次烟测就把降级炸出来了（见下）。
- 另有一条从迁移建出来的库里用 ORM 读回，走同一批查询助手——防「迁移与 `create_all` 形状不一样而后续切片没发现」。
- 负向验证 7 处，逐条摘守卫、各自红在自己那条：`captured_at IS NOT NULL`、`expires_at IS NOT NULL`、dump 授权门闩、`content_hash` 唯一索引（把 `unique=True` 换成普通索引后那条 `IntegrityError` 测试当场不红 → 说明它承重）、合并分支的 `last_seen_at`、`superseded` 那一句、迁移里的打标 `op.execute`。第一轮跑出过一条**假绿**：摘掉 `captured_at` 条件时测试仍全绿，因为当时没有「有死线但无采集时间」这种形状的用例行；补 `test_a_row_with_a_deadline_but_no_capture_date_still_cannot_answer` 之后才红。

**本机 MySQL 8.0.12 的三条 DDL 事实**（写在这为了下次别重新试）：`ALTER TABLE ... ADD COLUMN <json> NOT NULL` 在非空表上可行，不需要 server_default；但 `DEFAULT (json_array())` 这种表达式默认值要 8.0.13+，本机报 1064。第三条：**`downgrade` 里不能先 `DROP INDEX` 再 `DROP TABLE`**——`job_raw_records.batch_id` 那个索引正被它的 FK 骑着，MySQL 1553 直接拒绝，让它随表一起消失才对；这条是烟测降级时抓到的，现在由 `test_the_catalogue_revision_walks_back_and_forward_again` 钉住。

### 15.2 怎么在本地升级

```powershell
cd server
.venv\Scripts\python.exe -m alembic upgrade head    # 3f9a41c7de05 -> f495db1845fc
.venv\Scripts\python.exe -m alembic check          # 应报 No new upgrade operations detected
```

测试库 `career_v2_test` 由 `conftest.py` 按模型 `create_all`，不需要跑迁移。本次升级前做过一份增量备份：`backups/career_v2-pre-stage-a-20260921.sql`（`backups/` 已在 gitignore 内）。

### 15.3 本阶段明确没做

- **B**：粘贴入库、`python -m scripts.catalogue_refresh` CSV 导入、正文质检（长度下限 / ≥3 条 `original_text` / `captured_at` 非空）、方向关联写入。关联实测仍是 `career_direction_job_rel.review_status` 全 1022 条 `pending`（没有一条变 `reviewed`）。顺带记一处读码事实：模型里 `DirectionJobLink.review_status` 的默认值是 `unreviewed`，而库里出现过的唯一值是 `pending`——**那条默认值从来没被用到**，后面定「默认只取 reviewed」之前要先说清这两个词是不是一回事。
- **C**：`retrieve_job_samples` 只读工具；`get_job_samples` 补 `source_platform` / `captured_at`（现在仍不返回来源平台，也不返回正文——正文还是只在 `job_requirement_items.original_text`）。
- **D**：样本卡、粘贴入口、任何前端改动。`web/src/styles.css` 里 `max-width: 980px` 藏 inspector 那段本阶段没碰。
- 依旧没有：任何招聘网站的采集、登录、定时请求；`matchScore` / 适合度百分比 / MBTI 推岗 / 协同过滤；自动投递、收藏夹信息流、ATS；把岗位更新挂进 LangGraph Run 或 FastAPI 进程内 `asyncio.create_task`。
