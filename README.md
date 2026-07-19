# 职业决策系统

面向大学生的职业决策与行动产品。第一版闭环为：

```text
个人档案 -> 决策项目 -> 候选职业 -> 岗位验证
-> 确定目标 -> 4 周行动计划 -> 任务成果 -> 每周复盘
```

## 四层结构

- `web/`：完整决策工作区，Vue 3 + TypeScript。
- `android/`：今日行动端，Kotlin + Jetpack Compose + Room + WorkManager。
- `backend/`：业务数据与权限，Spring Boot + MyBatis + Flyway（B1/V2-V9）。
- `agent_server/`：结构化 AI 工作流，FastAPI + LangGraph + Pydantic。

Web 和 Android 只访问后端；后端通过内部令牌访问 Agent。Agent 不直接写业务数据库。

## 本地启动

局域网调试强制使用 HTTPS：

```text
Agent  http://127.0.0.1:8001
后端   https://当前局域网IP:8443
Web    https://当前局域网IP:5173
```

启动器会自动检测默认网卡的私有 IPv4，同步 `agent_server/.env` 与 `web/.env` 中的本地地址，并在 IP 变化时刷新 HTTPS 证书。也可以手动准备证书：

```powershell
.\scripts\setup-local-https.ps1
```

随后双击根目录 `start-dev.bat`，或运行：

```powershell
.\scripts\start-dev.ps1 -Target all
```

启动器会在后台运行服务，完成操作后持续返回主菜单，可继续查看状态、最近日志或停止服务；只有选择“退出启动器”才结束菜单。关闭菜单窗口不会停止已经启动的服务。

## 质量门禁

```powershell
.\scripts\verify-all.ps1
```

默认执行：

- 后端执行 128 项（127 通过，1 条有编号的平台例外）；
- Agent 102 条测试和 Ruff，其中含 32 条固定教练评测；
- Web 类型检查、97 条单测、生产构建、四个规范视口共 100 项 Playwright 检查；
- Android 94 条单测、Debug/Release 构建和 Lint；
- PowerShell 语法、乱码、统一请求层、HTTPS 和明文流量策略扫描。

运行真实局域网 HTTPS 链路：

```powershell
.\scripts\verify-all.ps1 -IncludeRuntimeSmoke
```

对当前 MySQL 做全量备份，并恢复到随机临时库逐表核对：

```powershell
.\scripts\verify-db-backup.ps1
```

备份保存在 Git 已忽略的 `backups/`，临时恢复库在核对后自动删除。

真实学生试点结束后，按匿名账号前缀生成量化验收报告：

```powershell
.\scripts\report-pilot-metrics.ps1 -CohortPrefix "pilot26" -RequireAcceptance
```

报告保存在 Git 已忽略的 `pilot-results/`，不会包含用户名、联系方式、项目正文或聊天内容。

配置 `agent_server/.env` 并重启 Agent 后，执行一次真实 OpenAI-compatible 调用和授权撤回降级验收：

```powershell
.\scripts\verify-all.ps1 -IncludeRealModelSmoke
```

该命令可能产生一次模型调用费用；普通 `verify-all.ps1` 不会调用外部模型。

真机基础烟测：

```powershell
.\scripts\smoke-android.ps1
```

真机登录、完成任务和成果同步：

```powershell
.\scripts\smoke-android.ps1 `
  -Username "your_test_user" `
  -Password "your_test_password" `
  -RequireAuthenticatedFlow
```

Android 真机必须安装 `.local-https\mkcert-rootCA.pem` 作为本地调试 CA。

## 当前边界

代码侧迭代 1 至 7 已完成；迭代 8 的评测、配置模板和烟测已完成。真实模型调用、Android 真机跨端同步以及 10 至 15 名学生试点仍需外部设备、密钥和参与者，不能用自动化结果代替。

## 关键文档

- `项目需求文档.md`：第一版产品需求。
- `第一版实施计划.md`：八个迭代及当前状态。
- `docs/ARCHITECTURE.md`：系统边界和数据流。
- `docs/LOCAL_DEVELOPMENT.md`：本地配置与启动。
- `docs/LOCAL_HTTPS.md`：证书与真机 HTTPS。
- `docs/PRIVACY_AND_AI_CONSENT.md`：外部 AI 授权、最小数据和日志边界。
- `docs/学生试点方案.md`：试点任务、指标和访谈提纲。
- `docs/TEST_EXCEPTIONS.md`：有编号的测试平台例外。
