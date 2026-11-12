<!-- 青穗集 · 8120 官方服务运营说明：本地联调与后续云端部署共用的最小运营闭环。 -->
# 8120 官方服务当前运营能力

8120 负责隐藏上游模型路由。客户端只发送 `Suinai Flash` 对外模型名和能力标识，真实模型、能力路由和上游 Key 只存在于官方服务环境。

当前已经加入：

- 官方账号注册与登录：`POST /v1/auth/register`、`POST /v1/auth/login`。
- 每个账号获得独立访问令牌；退出登录会撤销当前令牌。
- 管理员可以撤销和轮换令牌，旧令牌不会继续有效。
- 每个请求只记录令牌摘要、路径、状态码、能力标识和耗时，不记录请求正文、上游 Key 或模型返回正文。
- 每日请求次数和输出预留按令牌统计；账号登录生成的多个令牌共享同一账号的额度检查。
- SQLite 使用 WAL、忙等待和跨进程令牌租约，避免多实例同时占用同一账号通道。
- `/healthz` 和 `/admin/upstream` 返回上游连续失败状态；连续失败达到 3 次时标记为 `degraded`。
- 健康计数只吸收上游网络、超时、上游响应和流式中断；本地账号失败、每日额度和并发限制不会误报为上游故障。
- 可通过 `npm run relay:token -- backup <path>` 生成 SQLite 独立备份；配置 `RELAY_DATABASE_URL` 后使用 PostgreSQL，并可通过 `npm run relay:migrate -- <SQLite源库路径>` 做空库迁移和校验。
- 官方异步图片通道支持提交、后台轮询、状态持久化、过期回收和受保护内容读取；只有 8120 保存真实图片模型与上游任务号，客户端收到的任务号和内容地址会被重新映射并按账号隔离。
- 官方服务返回会清理真实上游模型、供应商信息、路由信息和内部判断问题；客户端只看到 Suinai Flash、Suinai Decide、Suinai Image 等产品能力。
- 用量事件保存输入/输出 token、能力、结算状态和价格快照；失败、取消、无 usage 的请求不会被虚构扣费。

## 管理命令

在 `agent` 目录执行：

```text
npm run relay:token -- issue <label>
npm run relay:token -- rotate <token-hash> [new-label]
npm run relay:token -- revoke <token-hash>
npm run relay:token -- list
npm run relay:token -- usage [YYYY-MM-DD]
npm run relay:token -- backup <absolute-path>
```

`RELAY_ADMIN_TOKEN` 只放在 8120 服务端环境，用于访问 `/admin/*`；它不能写入客户端 `.env`，也不能与上游 API Key 混用。

## 官方图片通道

服务端配置：

```dotenv
RELAY_IMAGE_MODEL=gemini-3.1-flash-image
RELAY_IMAGE_PATH=images/tasks
RELAY_IMAGE_DISPLAY_NAME=Suinai Image
```

客户端调用 `POST /v1/images/tasks` 时使用 `model: "Suinai Image"` 或省略 `model`，传入 `prompt`、`n`、`size` 等图片参数；随后用返回的本地 `task_id` 请求 `GET /v1/images/tasks/:id`，成功结果中的内容地址再通过 `GET /v1/images/tasks/:id/content/:index` 读取。Gemini 图片模型不能携带 `quality`，上游具体模型参数仍以供应商文档为准。图片正文由上游控制保留时间，过期后返回受保护的过期状态。

## 当前边界

本批已完成本地联调所需的账号隔离、令牌轮换与撤销、用量事件、日志脱敏、SQLite 备份、PostgreSQL 迁移、账号级租约、上游健康告警和异步图片任务回收。`RELAY_BILLING_ENABLED=true` 时按服务端价格快照扣减官方积分，支付渠道和充值回调仍需接入。公网发布前还需要 HTTPS/反向代理、密码找回与邮箱验证、外部监控接收和云端部署编排；当前 8120 适合本地联调与小范围内测，不应直接暴露到公网。
