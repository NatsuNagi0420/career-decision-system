<!-- 青穗集 · 当前项目入口；默认运行 TypeScript Agent + React 穗奈桌面。 -->
# 青穗集 · 穗奈 Agent

青穗集是一个面向求职成长的本机 Agent：穗奈通过持续对话整理用户画像、匹配岗位、解释技能差距、规划行动，并逐步协助完成简历等成果。当前运行主线是 React/Vite 前端 + TypeScript Agent + SQLite。

## 启动

首次安装：

```powershell
npm run setup
```

开发模式（前端 `5173`，Agent `8110`）：

```powershell
npm run dev
```

生产构建并启动 Agent：

```powershell
npm run build
npm start
```

浏览器平时打开 `http://127.0.0.1:5173/`。8110 是前端代理到的本机 API，配置官方模型时还需要单独运行 8120 官方中转；这三个端口不是三套用户或三套数据库。

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

默认位置：`agent/var/agent.sqlite`。

账号、会话、执行记录、职业资料、简历状态和岗位参考库共用这一份 SQLite 主库。运行时数据库、日志、备份、原始岗位交付、模型密钥和个人会话不会提交到 Git。新环境不会悄悄填入演示账号或岗位，需要恢复受控备份或明确导入。

岗位批次导入：

```powershell
npm run catalogue:import -- --archive "docs/岗位库扩充/待导入/新批次.zip" --review "docs/岗位库扩充/对应批次清洗规则.json"
```

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

当前系统已经具备对话、流式事件、模型连接测试、工具执行、审批、文件成果、岗位库读取、画像记录和本地下载等底座能力。职业规划的深度匹配、证据质量、简历结构化生成和正式投递仍需要在后续工作流重构中继续打磨。
