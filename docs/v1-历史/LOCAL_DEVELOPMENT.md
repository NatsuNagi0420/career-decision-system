# 本地开发

## 局域网调试地址

```text
Agent  http://127.0.0.1:8001
后端   https://当前局域网IP:8443
Web    https://当前局域网IP:5173
```

Agent 只被同一台电脑上的后端调用，因此保留回环 HTTP；学生端、Web 和 Android 到后端的通信必须使用 HTTPS。

## 首次准备

需要 Miniconda、MySQL 8、Android SDK 35 和 Chrome。项目 Conda 前缀会固定 Python 3.12、OpenJDK 21、Maven 3.9.9、Node.js 24.10 和 npm。

```powershell
cd D:\Project\career-decision-system
.\scripts\setup-local-https.ps1

cd agent_server
conda env create --prefix .venv --file environment.yml
.\.venv\python.exe -m pip install -r requirements.txt

cd ..\web
& ..\agent_server\.venv\npm.cmd install
```

根目录启动器会自动检测默认路由对应的私有 IPv4。IP 变化时，选择“检测并同步局域网 IP”即可更新本地 `.env`、运行时 CORS 和 HTTPS 证书。也可以手动重新生成：

```powershell
.\scripts\setup-local-https.ps1 -IncludeLanIps
```

## 必要配置

后端最关键的环境变量：

```powershell
$env:DB_URL = 'jdbc:mysql://127.0.0.1:3306/career_decision_system?useUnicode=true&characterEncoding=utf8&serverTimezone=Asia/Shanghai'
$env:DB_USERNAME = 'root'
$env:DB_PASSWORD = 'your-password'
```

后端与 Agent 的配置位置：

```text
backend/src/main/resources/application.yml
career.agent-server.base-url       <- AGENT_SERVER_BASE_URL
career.agent-server.internal-token <- AGENT_INTERNAL_TOKEN
career.agent-server.timeout-seconds<- AGENT_SERVER_TIMEOUT_SECONDS
```

Agent 的对应配置在 `agent_server/.env`：

```text
INTERNAL_API_TOKEN=change-me
```

这两个内部令牌必须一致。启动器默认同时注入 `change-me`，仅限本地开发。

## 启动与停止

推荐使用根目录启动器：

```powershell
.\scripts\start-dev.ps1 -Target all
```

也可以双击 `start-dev.bat`。菜单支持 Agent、后端、Web 分层启动、IP 同步、状态、最近日志和分别停止。每次操作后都会返回主菜单，只有选择“退出启动器”才结束；服务在后台运行，关闭菜单窗口不会停止服务。

```powershell
.\scripts\start-dev.ps1 -Target status
.\scripts\start-dev.ps1 -Target sync-ip
.\scripts\start-dev.ps1 -Target logs
.\scripts\start-dev.ps1 -Target stop
```

日志位于根目录 `logs/`。后端启动失败时先查看 `backend-dev.err.log`，常见原因是 MySQL 未启动、密码错误或 `8443` 被占用。

## Web 地址配置

唯一后端地址入口是 `web/src/utils/request.ts`，本地覆盖写在 `web/.env`：

```text
VITE_BACKEND_BASE_URL=https://当前局域网IP:8443
VITE_DEV_HTTPS=true
```

业务页面不得直接创建 axios、fetch 或硬编码主机。

## Android 地址与证书

唯一地址入口是：

```text
android/app/src/main/java/com/careerdecision/mobile/network/RequestConfig.kt
```

Debug 默认指向 `https://192.168.1.159:8443`，Gradle 覆盖也会拒绝 HTTP。`setup-local-https.ps1` 会把公开根证书同步到 Debug 专用资源，真机无需安装系统 CA，但证书变化后必须重新构建并覆盖安装 Debug APK。Release 不包含开发 CA，也拒绝本地或模拟器主机。

## 真实模型

默认 `LLM_PROVIDER=mock`，核心流程始终可使用规则降级。真实 OpenAI-compatible 配置模板为：

```text
agent_server/.env.openai-compatible.example
```

将其内容写入未提交的 `agent_server/.env`，填写真实 `LLM_MODEL`、`LLM_BASE_URL` 和 `LLM_API_KEY`。密钥不得写入源码、日志或提交记录。

根目录启动器只会精确更新 `agent_server/.env` 的 `BACKEND_BASE_URL`，不会改写模型、API Key、Token 或其他 `.env` 配置。修改模型配置后需要执行 `.\start-dev.bat stop-agent`，再重新启动所需链路；`.\start-dev.bat status` 会显示 Agent 当前实际使用的提供方。进程级环境变量仍会按标准优先级覆盖 `.env`。

真实模型端到端验收会创建测试账号，只发起一次外部模型调用，并验证用户撤回授权后立即回到规则降级：

```powershell
.\scripts\smoke-runtime.ps1 -RequireRealModel
```

也可以在三层服务已经按真实配置启动后运行：

```powershell
.\scripts\smoke-api.ps1 -RequireRealModel
```

没有 `-RequireRealModel` 的日常门禁保持 mock 模式，不会产生外部模型费用。

## 数据库备份恢复

发布前使用 MySQL 自带的 `mysqldump` 和 `mysql` 做一次全量恢复演练：

```powershell
.\scripts\verify-db-backup.ps1
```

脚本把备份写入 Git 已忽略的 `backups/`，恢复到随机命名的临时数据库，逐表比较精确行数后删除临时库。它不会覆盖或删除当前 `career_decision_system`。非默认安装位置可通过 `-MySqlPath`、`-MySqlDumpPath` 或 `MYSQL_BIN_DIR` 指定；数据库凭据优先读取 `DB_USERNAME` 和 `DB_PASSWORD`。

决策旅程 V2 不继续使用旧项目数据。完成备份并启动一次后端、确认 Flyway V10 已应用后，可以只清理 `flow_version < 2` 的旧项目及其派生计划：

```powershell
.\scripts\reset-decision-v1.ps1 -Environment local -ConfirmReset -WhatIf
.\scripts\reset-decision-v1.ps1 -Environment local -ConfirmReset
```

脚本只允许连接本机数据库，且必须同时提供环境名和显式确认；它会保留用户资料、个人经历、职业方向和真实岗位。先运行 `-WhatIf` 查看目标，确认数据库名称和连接信息无误后再执行第二条命令。

## 学生试点指标

真实试点账号统一使用一个独立前缀，例如 `pilot26`。试点结束后运行：

```powershell
.\scripts\report-pilot-metrics.ps1 `
  -CohortPrefix "pilot26" `
  -RequireAcceptance
```

脚本拒绝 `smoke`、`web`、`test` 和 `demo` 前缀，只输出匿名编号与量化指标。验收要求为 10 至 15 名真实参与者，且至少一人完成目标确认、任务、成果、复盘和复盘后继续行动。报告写入未跟踪的 `pilot-results/`；定性记录使用 `docs/学生试点记录模板.md`。

## 验证

全部静态与自动化门禁：

```powershell
.\scripts\verify-all.ps1
```

已启动服务上的新版 API 闭环：

```powershell
.\scripts\smoke-api.ps1
```

自动启动或复用 Agent、HTTPS 后端和 HTTPS Web，再执行 API 与浏览器烟测：

```powershell
.\scripts\smoke-runtime.ps1
```

Android 真机完整烟测：

```powershell
.\scripts\smoke-android.ps1 -Username "test_user" -Password "test_password" -RequireAuthenticatedFlow
```

该账号需要已有当前行动计划和至少一项可执行任务。严格模式会生成唯一成果标记；真机完成任务后，脚本会轮询同一个 HTTPS 后端，只有后端任务状态为 `completed` 且成果标记已经入库才会通过。这一结果可直接由 Web 读取，用于验证 Android 与 Web 共享同一份服务端数据。
