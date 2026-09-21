# 青穗集 · 职业决策 Agent（v2）

面向大学生与初入职场者的**证据驱动职业决策**产品。用户带着一个模糊的职业困惑进来，Agent（穗奈）在授权与代码约束内自主查资料、整理结论、提出写入并等用户确认，并且**跨会话记住自己承诺的下一步**。

产品目标与本阶段范围的唯一权威表述见 [`docs/v2/PROJECT_GOAL.md`](docs/v2/PROJECT_GOAL.md)。

## 一句话架构

**一个 Python 进程拥有全部服务端能力，一个 React 壳只负责呈现与交互。**

```text
React (Vite, 5173)  ──/api──►  FastAPI + LangGraph (8100)  ──►  MySQL career_v2   业务事实
                                   │                              （Alembic 迁移）
                                   ├──►  SQLite var/checkpoints.sqlite   可恢复执行状态
                                   └──►  OpenAI-compatible 模型（deepseek-flash 等）
```

- 没有 Java 后端、没有 Android 客户端、没有独立的 Agent 服务。v1 的四层结构已于 2026-09-19 整体删除，历史文档归档在 `docs/v1-历史/`。
- 浏览器与 Python 服务同源（Vite 代理 `/api`、`/healthz`），因此不需要 CORS。

## 核心对象

| 对象 | 含义 | 为什么存在 |
| --- | --- | --- |
| `Run` / `Step` | 一次推进及其步骤 | 任务可恢复、可审计 |
| `Event` | 只追加的事件流，`(run_id, seq)` 唯一 | SSE 断线后从最后序号续传，重放不重复 |
| `Artifact` | 成果物，带 `data_coverage` / `is_provisional` / 逐字引文 | 结论必须能回指原句 |
| `Proposal` + `Approval` | 想写入什么 + 人是否批准 | 重要业务写入必须过人 |
| `Obligation` | Agent 对自己的下一步承诺 | 推进权在 Agent 手上，跨会话不失忆 |

公理是：**模型决定下一步做什么，代码决定能不能做**。风险分级 R0–R3 写在 `CapabilitySpec` 里，R2/R3 一律需要审批，R3 不允许携带写入——这些由校验器强制，不靠提示词自觉。

## 本地启动

前置：Python 3.12–3.13、Node 20+、一个可连的 MySQL 8。迁移会自己建库，但只允许建/写库名以 `career_v2` 开头的库，其他目标一律被 `assert_safe_target` 拒绝。

```powershell
# 1) 服务端
cd server
uv sync --extra dev
copy .env.example .env       # 填 DB_URL；LLM_PROVIDER=mock 可完全离线跑通
.venv\Scripts\python.exe -m alembic upgrade head   # 库不存在时先 CREATE DATABASE career_v2
.venv\Scripts\python.exe scripts\import_catalog.py   # 载入职业方向/岗位目录
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8100

# 2) 前端（另开终端）
cd web
npm ci
npm run dev                  # http://127.0.0.1:5173
```

注册账号时勾选"同意把决策上下文交给云端模型处理"才会调用真实模型；不勾选则走确定性路径，并在结果上明确标注依据有限。真实模型配置见 `server/.env.example` 的 `LLM_*` 项。

## 一条命令验证全部

```powershell
powershell -File scripts\verify.ps1          # 含真实 MySQL 测试库，约 7 分钟
powershell -File scripts\verify.ps1 -Quick   # 跳过 pytest
```

它依次跑：ruff、能力与契约完整性（`server/scripts/validate.py` 16 项）、Alembic 漂移检查、pytest、`tsc --noEmit`、vitest、生产构建，并给出逐项结论。

`validate.py` 里有几条是**跨语言契约**：后端帧类型集合必须等于前端 `FrameKind`、每种帧都要有序列化样本、能力链不能通向没有实现的能力。这类不一致以前靠人眼发现。

## 测试与评测的边界

- `server/tests/` 用真实 MySQL（`career_v2_test`，缺失时同样自动建库）+ `ScriptedProvider`，覆盖结构、权限、审批、事件与承诺，**不调用真实模型**。
- 真实模型的质量门禁在 `server/evals/`：38 条固定案例 + 引用溯源校验器，只写专用库 `career_v2_eval`（`career_v2`/`career_v2_test`/两个 v1 库被硬性禁止写入）。

  ```powershell
  cd server
  .venv\Scripts\python.exe -m scripts.run_evals --check                       # 只核对案例集，不连库不花钱
  .venv\Scripts\python.exe -m scripts.run_evals --limit 5                     # 假模型，只验机器本身转不转
  .venv\Scripts\python.exe -m scripts.run_evals --live                        # 真模型出基线，38 例约 $0.14
  .venv\Scripts\python.exe -m scripts.run_evals --live --only candidates_from_profile,compare_two_directions
                                                                                # 只重跑改过口径的那几例，和基线做配对比较
  .venv\Scripts\python.exe -m scripts.run_evals --rescore var\eval-xxx-live.json   # 改了评分器就重算引用，不再花钱
  ```

  当前基线与七条指标的口径都记在 `docs/v2/AGENT_CAPABILITY_MAP.md` §31–§37（§33–§34 引用质量的成因与第一次提升，§35 提示词指纹：跨轮差异才能归因到"哪一版提示词/工具契约"，§36 界面上两处把状态当出处的假话，§37 一次自激门禁红的负向验证——它证明了自己先前那句结论说重了）。**离线跑故意过不了阈值**（报告末尾会自己说明），只有 `--live` 的数字才拿来比较。
- **不要同时开两个 pytest 会话**：它们共享 `career_v2_test`，`TRUNCATE` 会互相打断。评测跑 `career_v2_eval`，但仍不能与别人的全量 pytest 并发（MySQL 1684 并发改表）。

## 文档

| 位置 | 内容 |
| --- | --- |
| `docs/v2/PROJECT_GOAL.md` | 项目目标、验收标准、P0–P4 优先级、明确不做的事 |
| `docs/v2/PILOT_PROTOCOL.md` | P4 小规模试点的观察口径与判读规则（全部可用现有表算出，缺的是人不是代码） |
| `docs/v2/AI_NATIVE_ARCHITECTURE.md` | AI 原生公理、对象模型、事件与审批契约、§11 试点与运维约定 |
| `docs/v2/AGENT_CAPABILITY_MAP.md` | 能力地图与**逐里程碑落地记录**（含实测发现的缺陷） |
| `docs/v1-历史/` | v1 四层架构时期的规格与计划，仅供追溯，**不描述当前系统** |
| `docs/品牌形象/` | 品牌与穗奈 IP 素材（`BgSub_*` 为透明底） |

## 目录

```text
server/   FastAPI + LangGraph 服务：API、鉴权、能力注册表、工具、事件、审批、承诺
  scripts/   validate.py（契约校验）、run_evals.py（真模型评测入口）、import_catalog.py（职业目录）、brand_assets.py（品牌素材切图）、demo_e2e.py
  evals/     38 条固定评测案例、引用溯源校验器、指标探测与报告
web/      React 19 + Vite 应用壳：对话流、成果物、确认门、对象层侧栏
spikes/   一次性技术验证（模型行为、checkpoint 一致性），结论已并入文档
scripts/  verify.ps1 —— 唯一验证入口
docs/     v2 现行文档 + v1 历史归档 + 品牌形象素材
参考开源项目/  只读研究材料，不入库、不参与构建，其自带的 AGENTS.md 不适用于本项目
```
