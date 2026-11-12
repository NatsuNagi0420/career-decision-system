<!-- 青穗集 · 当前仓库边界；目录调整时同步更新。 -->
# 仓库结构

本仓库只把当前可运行的产品主线放在默认路径：React/Vite 穗奈桌面、TypeScript Agent、本机 SQLite、网页素材和岗位库工具。旧运行时代码已经清理；研究材料和历史决策文档仍保留在文档区，便于追溯设计依据。

## 运行时主线

```text
web/                         React 19 + Vite，穗奈桌面与用户交互
  ├─ src/                    页面、对话状态、个人主页、岗位与简历组件
  ├─ public/                 字体等前端静态资源
  ├─ scripts/                Live2D、启动动效和品牌素材构建工具
  └─ vendor/                 本地 Live2D 运行时依赖
agent/                       TypeScript Agent、本机 API 与唯一 SQLite 主库
  ├─ src/                    配置、模型适配、执行循环、工具、审批与文件成果
  │   └─ cloud-hub/          扫码绑定、任务队列、PC 连接器与可选云端执行器
  ├─ test/                   Agent 单元测试和接口契约测试
本机状态（默认不在仓库；Windows 使用 `%LOCALAPPDATA%/Qingsuiji/`，可由 `AGENT_DATA_DIR`/`RELAY_DATA_DIR` 覆盖）
  ├─ agent/                  账号、会话、岗位库和成果运行数据
  └─ relay/                  官方中转凭证与每日配额
uni-app/                     小程序：官方账号、执行位置、跨端任务和同步画像
deploy/hub/                  Cloud Hub 服务、HTTPS 与备份部署说明
assets/web/                  页面运行时读取的公共素材
scripts/                     当前开发辅助脚本
  ├─ dev/                    开发启动、预检和交互预览
  ├─ catalogue/              岗位库清洗、导入和合并回归
  └─ verify/                 Agent 全量验证入口
docs/                        产品、架构、研究和品牌交接文档
backups/                     本机数据库备份（不入 Git）
logs/                        本机操作与验证日志（不入 Git）
```

平时只打开 `http://127.0.0.1:5173/`。5173 是前端，8110 是 TypeScript Agent API；配置官方模型时才额外运行 8120 中转。它们是同一套本机应用的服务边界，不是三套用户系统。

## 文档区

- `docs/architecture/`：当前仓库和系统边界。
- `docs/agent-foundation/`：Agent、模型、沙箱、文件成果和数据库说明。
- `docs/v2/`：当前产品目标、工作流、岗位库和 UI 决策；文件名保留决策日期。
- `docs/岗位库扩充/`：岗位批次、清洗规则、字段契约和导入说明。
- `docs/品牌形象/`：穗奈原画、Live2D 交接包和网页素材制作资料。
- `docs/参考资料/`：论文、开源项目研究和可复核的资料整理。
- `docs/v1-历史/`：历史设计文档，只用于追溯，不参与构建和运行。

`参考开源项目/` 是本机只读参考目录，已被 Git 忽略；它不是产品依赖，也不会被运行时加载。

## 版本库边界

进入版本库的内容包括当前源码、可复现脚本、网页运行时素材、契约测试和不含密钥/个人数据的文档。以下内容只保留在本机或单独制品存储：

- 用户状态目录中的 `Qingsuiji/agent/`、`Qingsuiji/relay/`、`logs/`、`backups/`、`tmp/`；仓库内遗留的 `agent/var/` 与 `agent/relay-var/` 仅是迁移历史副本，不进入当前运行链路；
- `.env`、SQLite 数据库、个人会话、运行日志和官方中转凭证；
- `docs/参考资料` 的原始 PDF/网页抓取物；
- `docs/品牌形象` 的 PSD/KRA/CLIP/ZIP 原画交接包；
- `docs/岗位库扩充` 的原始岗位交付压缩包。

大素材未来若需要公开发布，应使用 Git LFS 或制品存储，不要把原画源文件直接塞进应用仓库。

## 大改前的基线

1. 先运行 `npm run check`、`npm test` 和 `npm run build`。
2. 将可运行版本保存为明确的 Git 提交或标签。
3. 后续大改使用独立分支，每次只改变一个边界，例如 Agent 执行内核、岗位匹配、简历工作流或 UI。
4. 新功能只依赖 `agent/`、`web/` 和 `assets/web/` 的当前接口，不重新引入已经清理的旧运行时代码。

## 多端架构（2026-10-29）

官方模型中转：`api.suinai.me`。设备与任务同步：`agent.suinai.me` Cloud Hub。PC 主动连接 Hub 认领任务，云端执行是另一个可选位置，不会代替离线 PC。部署和具体能力边界见 [Cloud Hub](../../deploy/hub/README.md)。
