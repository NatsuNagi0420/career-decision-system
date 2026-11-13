# 云端发布记录 · 2026-11-13

- GitHub `master` 与线上服务发布版本：`4216135f`（完善岗位学习与练习流程）。
- 发布目录：`/opt/qingsuiji/releases/career-20261113T075137Z-4216135f`。
- 回滚目录：`/opt/qingsuiji/releases/points-20261031T033617Z`；发布备份：`/var/backups/qingsuiji/deployments/career-20261113T075137Z`。
- 更新范围：`agent.suinai.me` 的 Web 与 Cloud Hub，以及 `api.suinai.me` 对应的 8120 Relay。前端保留既有哈希静态资源，Hub/Relay 各自使用独立编译产物。
- 发布前在 SQLite 副本验证新建学习/岗位准备表；正式库发布前后 `quick_check=ok`，用户、账号映射、设备、同步会话、远程任务、对话、消息、岗位目录和记忆计数均未变化。
- `/etc/qingsuiji/agent.env` 与 `/opt/qingsuiji/app/agent/.env.relay` 的校验和发布前后不变；没有上传客户端密钥，也没有覆盖云端数据库或环境配置。
- 服务端保持 `AGENT_DEPLOYMENT_MODE=server`、`AGENT_SERVER_COMMANDS=false`、官方账号身份、`HUB_CLOUD_EXECUTOR=true` 与 `memory_sync=1`。
- 发布后 `qingsuiji-agent`、`qingsuiji-relay`、`nginx` 均为 active；Hub 与 Relay 健康端点返回 200。岗位练习及题库接口未登录时均返回 401。
- Chrome 检查 `https://agent.suinai.me/`，确认显示官方账号登录入口，没有本机 API Key 登录入口。
- 质量检查：类型检查通过；Agent 357 项通过、1 项跳过；Web 423 项通过；Hub、Relay、Web 构建通过。
