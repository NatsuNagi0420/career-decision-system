<!-- 青穗集 · 当前项目入口；默认运行 TypeScript Agent + React 穗奈桌面。 -->
# 青穗集 · 穗奈 Agent

青穗集是一个面向求职成长的本机 Agent：穗奈通过持续对话整理用户画像、匹配岗位、解释技能差距、规划行动，并逐步协助完成简历等成果。当前运行主线是 React/Vite 前端 + TypeScript Agent + SQLite。

## 启动

首次安装：

```powershell
npm run setup
```

开发模式（前端 `5188`，Agent `8110`）：

```powershell
npm run dev
```

生产构建并启动 Agent：

```powershell
npm run build
npm start
```

浏览器平时打开 `http://127.0.0.1:5188/`。前端固定使用 5188；端口占用时会明确报错，不会自动切到其他端口。8110 是本机 Agent API；使用已部署的官方服务时直接访问 `api.suinai.me`，不需要再在电脑启动 8120。运营方本地调试中转时才启动 8120。

模型配置和沙箱边界见 [Agent 使用说明](agent/README.md)。上游官方密钥只放在中转服务端，不放入前端或 `VITE_*` 配置。

## 目录

详细边界见 [仓库结构与重构基线](docs/architecture/REPOSITORY_LAYOUT.md)。

- `agent/`：当前 TypeScript Agent、模型适配、工具执行、审批、文件成果和唯一 SQLite 主库。
- `web/`：当前 React/Vite 穗奈桌面、对话交互、个人页和岗位/简历组件。
- `assets/web/`：运行时公共网页素材；页面通过 Agent 的只读素材接口读取。
- `docs/`：产品决策、架构说明、岗位库导入规则、研究笔记和品牌交接文档。
- `scripts/`：按 `dev/`、`catalogue/`、`verify/` 分组的开发、岗位库和验证脚本。
- `backups/`、`logs/`：本机运行产生的备份与日志，不进入版本库。

## 唯一主库

默认位置：Windows 为 `%LOCALAPPDATA%/Qingsuiji/agent/agent.sqlite`，Linux/macOS 为 `$XDG_STATE_HOME/Qingsuiji/agent/agent.sqlite`（未设置时为 `~/.local/state/Qingsuiji/agent/agent.sqlite`）；可用 `AGENT_DATA_DIR` 覆盖。

账号、会话、执行记录、职业资料、简历状态和岗位参考库共用这一份 SQLite 主库。运行时数据库、日志、备份、原始岗位交付、模型密钥和个人会话不会提交到 Git。新环境不会悄悄填入演示账号或岗位，需要恢复受控备份或明确导入。

岗位批次导入：

```powershell
npm run catalogue:import -- --archive "docs/岗位库扩充/待导入/新批次.zip" --review "docs/岗位库扩充/对应批次清洗规则.json"
```

本机 Agent 状态备份（先停止 8110，再执行）：

```powershell
npm --prefix agent run backup -- "D:\Backups\qingsuiji-agent"
```

备份包含主 SQLite、成果与本机资料区，不包含你绑定的用户源码项目。恢复前保留当前状态目录，并同时恢复 `agent.sqlite`、`workspaces/`、`artifacts/`、`local-open/` 与 `project-edits/`。

导入规则、数据库备份和边界见 [数据库统一维护](docs/agent-foundation/DATABASE_20261024.md)。

## 验证

```powershell
npm run check
npm test
npm run build
python scripts/catalogue/test-merge-job-catalogue.py
```

测试使用临时数据库和明确的模型替身；通过不代表任意真实模型都能稳定完成职业任务。真实模型请求会产生费用，并受第三方隐私、接口兼容性和本地沙箱权限影响。

## 当前边界

当前系统已经具备对话、流式事件、模型连接测试、Windows 本机写入限制、递归项目工作区、工具执行、审批、文件成果、岗位库读取、画像记录和简历预览/导出底座。职业判断、岗位证据对照和简历事实审查已经通过官方服务路由到 Jev；正式投递、自动联网求职、密码找回与真实支付仍属于后续产品范围。

## 官方服务

本地端运行在 8110，浏览器开发界面运行在 5188；官方模型中转运行在 8120。用户自配模型只调用自己的 OpenAI 兼容接口，官方模式只显示 `Suinai Flash`，能力路由、真实模型和上游 Key 留在 8120。

8120 本地默认使用 SQLite；生产可用 `RELAY_DATABASE_URL` 切换 PostgreSQL，并通过 `npm --prefix agent run relay:migrate -- <SQLite源库路径>` 迁移。账号、令牌撤销/轮换、用量事件、脱敏日志、账号级并发租约、健康告警、备份和异步生图回收已经具备。阿里云 Linux ECS 的 HTTPS、Nginx、systemd 和本机回连步骤见 [8120 官方中转部署](deploy/relay/README.md)。公网运营仍需补充密码找回/邮箱验证和真实支付回调。


## 官方账号与多端任务

PC 首次打开先选择“青穗集账号登录”或“本机 API Key”。本机入口会创建并记住这台电脑的设备会话，不把 API Key 当作账号提交；登录官方账号后仍可使用第三方模型，Key 留在本机。

云端 `https://agent.suinai.me` 运行 Cloud Hub，保存设备、队列与同步进度。电脑主动连接它接收任务，不暴露本机端口。小程序登录同一官方账号后，在电脑“设备与同步”扫描二维码绑定；绑定后可从电脑项目与已有会话中继续，或远程新开会话。云端执行是独立模式，电脑离线的任务会等待电脑上线。

源码位于 `agent/src/cloud-hub/`，部署、备份、权限和当前同步边界见 [Cloud Hub 文档](deploy/hub/README.md)。小程序真机还需配置 `agent.suinai.me` 为 request / downloadFile 合法域名。


## Windows 安装包

本机内测发行入口为 `npm run release:windows`，构建脚本和安装向导位于 `scripts/release/` 与 `desktop/windows/`。安装后可选择目录、创建桌面快捷方式，启动时自动打开浏览器 WebUI；任务栏托盘与网页左侧均提供“完全退出”。用户不需要安装 Node.js 或启动开发服务。

构建参数、用户资料保留规则、第三方许可和未签名内测边界见 [Windows 发行说明](desktop/windows/README.md)。
