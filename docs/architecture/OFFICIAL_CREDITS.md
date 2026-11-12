<!-- 青穗集 · 官方积分和权限操作说明：产品计价、可靠结算、配置及服务器管理命令。 -->
# 官方积分与账号权限

用户在官方账号区域查看剩余积分，点击打开用量明细。PC 和云网页连接同一个官方中转账本；用户自配第三方 Key 的调用不扣官方积分。本期没有独立运营后台页面。

## 每日额度

默认每日 2300 积分，Asia/Shanghai（北京时间）零点进入新业务日。每日额度不累计；赠送积分也只在赠送当日有效。每个官方账号跨设备、跨访问令牌、跨能力共用额度。所有者同样默认 2300，不自动享有无限额度。

显示的剩余积分 = 当日基础额度 + 当日赠分 − 已结算积分 − 正在预留的积分。跨零点执行的请求仍结算到预留日，新业务日独立发放额度。管理员可以显式改变单账号每日额度，变更立即作用于今天与未来；不能降低到今天已使用与已预留金额以下。

## 计价算法

本期统一公开价格，不公开内部模型路由：

| 用量 | 每 1000 tokens 积分 |
| --- | ---: |
| 普通输入 | 10 |
| 缓存输入 | 2.5 |
| 输出 | 40 |

`积分 = (输入 tokens − 缓存 tokens) × 0.01 + 缓存 tokens × 0.0025 + 输出 tokens × 0.04`。

缓存仅使用上游 usage 的 `prompt_tokens_details.cached_tokens` 或 `input_tokens_details.cached_tokens`，且不超过输入总量。不把思考 tokens 在 completion/output tokens 之外再次计费。例如 1000 输入、400 缓存、100 输出，消费 11 积分。一次 Agent 任务可包含对话、规划、工具后续处理、画像整理等多次调用，每次都留下用量记录；不能将一条用户消息承诺成固定消费金额。

这是产品计价，不是上游人民币价格。后续应依据中转供应商实际成本、不同模型调用比例和长上下文负载校准；当前没有未经验证的利润或兑换率承诺。调整价格时同时更改价格版本，新请求快照保存所有价格，历史账目不重算。

实现上 1 积分 = 1,000,000 微积分，使用安全整数并在乘法时使用 BigInt 检查范围。界面最多显示两位小数，小于 0.01 的正数显示 `<0.01`，账本不按显示精度逐次取整。

## 请求与账本

1. 上游调用前，数据库事务中按输入估算、输出上限预留积分（图片每张暂估 4096 输入 tokens，不把 base64 传输体积当作文本 tokens），同时创建用量事件与账号执行租约。
2. 使用真实 JSON/SSE usage 结算，退回未用预留；没有完整 usage 时标为未计费，不伪造 tokens。
3. 失败、取消、流中断和过期租约释放预留；结算事件的 state 防止重复扣款或重复退款。
4. 输入估算并非所有模型的可靠上限。实际计价超过预留时，用户最多扣除预留，差额由平台承担；`points_calculated` 和 `points_charged` 分别保留应计与实扣用于审计。
5. 多实例使用 coordination 行锁与账号日账本原子操作，避免不同凭证和能力并发超支；SQLite 使用串行事务，PostgreSQL 使用同一事务连接。
6. 新积分与旧 wallet 余额分开。开启新积分后不叠加旧每日次数与输出预算；历史 104 条等旧记录不会重新扣积分。读取账本不调用付费模型。

独立业务表：`relay_account_policies`、`relay_point_days`、`relay_point_adjustments`、`relay_admin_audit`；`relay_usage_events` 增加积分预留、实扣、应计、价格快照与缓存量。均为加法迁移，可迁往 PostgreSQL。保留原始历史记录，调整使用新记录，不覆盖消费记录。

设计参考 New API 的 BillingSession 预留、实际结算与幂等退款思想，以及 LiteLLM 的按请求记录实际用量与消费思想。本项目使用自己的 TypeScript 实现，没有复制其项目代码：

- https://github.com/QuantumNous/new-api/blob/main/service/billing_session.go
- https://github.com/BerriAI/litellm/blob/main/litellm/proxy/spend_tracking/spend_tracking_utils.py

## 服务端配置

只在官方中转 `.env.relay` 配置；客户端不需要也不能保存管理员凭证。

```dotenv
RELAY_POINTS_ENABLED=true
RELAY_DAILY_POINTS=2300
RELAY_POINTS_VERSION=2026-10-v1
RELAY_POINTS_INPUT_MICROS_PER_TOKEN=10000
RELAY_POINTS_CACHED_MICROS_PER_TOKEN=2500
RELAY_POINTS_OUTPUT_MICROS_PER_TOKEN=40000
RELAY_POINTS_IMAGE_MICROS=200000000
```

价格单位是每 token 微积分。图片价格仅为现有异步图片能力预留；配置积分不代表启用生图。修改全局配置后重启官方中转。单账号限额与赠分在数据库中，命令执行后即生效，无需重启。

## NatsuNagi 与权限管理

首个所有者由服务器控制台精确匹配已存在且有效的账号进行一次性绑定。云端已核实 `NatsuNagi` 的账号 ID 为 **6**。权限绑定 ID，不根据当前用户名判定，也不把客户端传来的角色当作授权依据。数据库只允许一个所有者；重复绑定同一账号幂等，不能用此入口接管另一个已存在的所有者。

权限：

| 权限 | 能力 |
| --- | --- |
| `accounts.read` | 查看脱敏账号列表 |
| `credits.manage` | 调整每日额度、赠送当日积分 |
| `permissions.manage` | 分配或撤销管理权限，仅所有者保有 |

服务器命令（先 `ssh suinai-relay`，再 `cd /opt/qingsuiji/app/agent`）：

```bash
# 查询自己的当前额度与权限，不输出密码或令牌
sudo /usr/local/bin/node dist/relay/relay-admin.js inspect NatsuNagi

# 将自己的每日额度设为 10000；若不执行，仍为默认 2300
sudo /usr/local/bin/node dist/relay/relay-admin.js limit NatsuNagi 10000

# 额外赠送今天 500 积分；同一个 reference 重试不会重复入账
sudo /usr/local/bin/node dist/relay/relay-admin.js grant NatsuNagi 500 gift-20261031-001 "测试补充"

# 将某已存在账号设为可查看账号和管理积分的管理员
sudo /usr/local/bin/node dist/relay/relay-admin.js permissions some_user accounts.read,credits.manage

# 撤销该管理员权限
sudo /usr/local/bin/node dist/relay/relay-admin.js permissions some_user none
```

本地开发在 `agent` 目录使用 `npm run relay:admin -- <命令>`。首次所有者绑定命令是 `owner NatsuNagi`，只在服务器执行。日后管理可用账号令牌访问受保护的 `/v1/admin/accounts` 系列 API，但本期不提供后台页面。所有管理变更记录操作者、目标 ID、操作时间、原因/值与唯一赠分编号。现有 `/admin/*` 根管理凭证入口继续只允许服务器访问，不放进前端。

本人接口为 `GET /v1/account/credits`，按当前官方身份隔离、支持稳定游标分页。Web 通过 `GET /api/v1/agent/official/credits` 同源代理，不能指定其他 account_id。所有账号授权每次从数据库验证，撤销后下一次请求生效。
