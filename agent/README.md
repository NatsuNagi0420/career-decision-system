<!-- 青穗集 · 自研 TypeScript Agent 使用与运维说明；只描述已实现能力，不把夹具或配置当作真实验收。 -->
# 青穗集 TypeScript Agent

实现于 2026-10-20 至 2026-10-22。默认应用现为本机 TypeScript 服务 + 现有 React/穗奈桌面。不是把整个开源 Agent 项目换名，也不是仅换系统提示词：执行循环、工具契约、持久状态、审批与成果版本均由本项目实现。

## 1. 启动与使用

在项目根目录，首次安装和构建：

~~~powershell
npm run setup
npm run build
npm start
~~~

访问 http://127.0.0.1:8110 。首次使用注册本地账号（密码至少 8 位），打开「模型设置」。开发时使用 npm run dev，同时启动 8110 服务和 5173 Vite；若已启动正式服务，请先在它的终端 Ctrl+C，避免占用同一端口。

- 当前只维护用户状态目录中的唯一 agent.sqlite；岗位与账号、会话共库。Windows 默认目录是 `%LOCALAPPDATA%/Qingsuiji/agent/`，Linux/macOS 默认是 `$XDG_STATE_HOME/Qingsuiji/agent/`（未设置时为 `~/.local/state/Qingsuiji/agent/`），也可以用 `AGENT_DATA_DIR` 显式覆盖。旧版数据库不属于当前运行链路；主库中的历史归档已删除，不合并成当前账号。本机备份不会自动合并到当前账号，只有明确恢复时才会读取。新版没有内置公共账号或默认密码。
- 状态目录包含 `agent.sqlite`、`workspaces/`、`artifacts/`、`local-open/` 和临时运行文件。备份时先停服务，并备份整个状态目录；密钥使用 DPAPI 时依赖原 Windows 用户，复制数据库到其他用户不会自动解密。仓库内遗留的 `agent/var/` 与 `agent/relay-var/` 不属于当前运行链路。
- 默认只监听本机回环地址，不应作为公网多租户服务发布。
- Agent 核心要求 Node.js 22.17.0 以上；本轮 Windows 实测使用 22.17.0。原生组件的传递依赖 undici 8.11.2 声明要求 22.19.0 以上，推荐新安装使用 Node.js 22.19.0 以上。当前原生 ACL/runner 路径已通过实测，但本轮没有升级系统 Node，也没有验证未使用的 HTTP 代理模块。node:sqlite 仍可能提示实验性 API；发布前需固定运行环境。

## 2. 用户自带接口

在「模型设置」填写连接名称、接口地址（Base URL）和 API Key，点击「拉取模型列表」，搜索并选择模型，再按「保存并测试连接」。不需要先保存，也不需要预先知道模型名称；只有服务不提供模型列表时，才勾选手动填写。

- 新连接默认自动检测 Chat Completions / Responses 协议，也可在高级选项中固定协议。自动检测只对明确的路径或协议不匹配切换；鉴权、额度、限流、503 不会通过换协议反复请求。New API 等网关的具体兼容性仍取决于其上游和模型。
- 地址可填 API 根地址或 /v1；完整 /chat/completions、/responses、/models 路径会自动整理，只填域名时补 /v1。自定义路径前缀会保留。拉取列表请求该 API 下的 GET /models；列表出现模型不等于当前模型一定可用或支持工具。
- 不强制 API Key 具有 sk- 前缀。密钥不回显，不放进角色提示、资料清单或命令环境，不存进浏览器 localStorage。
- 本机、私网地址需在高级选项中明确授权；默认 HTTPS。HTTP 仅限明确授权的本机/私网。
- 连接测试会真实发起少量模型请求，可能计费：聊天/流式、结构化测试工具与工具结果续答。遇到明确不支持的协议或参数时会进行有限次数的兼容尝试；页面分别显示聊天、流式和工具往返结果及失败原因。普通 JSON 响应不会被当作流式通过。
- 聊天通过但工具不通过时，只开放聊天，不能伪装文件操作。修改配置后需重新测试。
- 默认密钥只保留在服务内存，退出该账号或重启服务后需重新填写；Windows 可选当前系统用户 DPAPI 加密。它不抵御同一系统用户运行的恶意软件。
- 勾选外部模型授权后，当前对话及选取资料中的相关内容会发送给所选服务。撤回授权会停止未完成任务，但不能撤回已发送的数据或已经产生的费用。

## 3. 真正可以做什么

1. 持久对话、连续修改同一成果、查看真实工具记录与简短任务步骤；命令运行时可在执行侧栏实时看到 stdout/stderr，完成后仍保留完整结果。
2. 只读导入用户明确选取的文字版 PDF、DOCX、UTF-8 文本／源码和 PNG/JPG/GIF/WebP。文本单文件 1 MB，PDF/DOCX/图片单文件 4 MB，每次前端最多 5 份；PDF 最多 40 页、文档正文最多 20 万字符。不支持旧版 DOC 或扫描件 OCR。
3. list_files / read_file / search_files 检查本对话资料。
4. write_file 在 outputs/ 写入真实文本，publish_file 登记命令生成的文件；自动维护 SHA-256 和不可变版本。同内容不重复生成版本。
5. ask_user 追问关键资料；不是无限循环或把猜测当事实。
6. request_export 等待用户批准指定版本；批准不代表已写进用户任意指定目录。下载由浏览器保存。
7. 主动停止、提交去重、单对话串行、步骤/执行时长/输出预算、SSE 断线重放。
8. 服务重启后，运行中任务标记为「中断」并保留记录，不自动重复有副作用的工具。等待审批的任务保留确认状态。若密钥已安全保存且仍可用，可继续；若选择仅内存并在等待时重启，需先停止旧轮次、重填并测试密钥后发起新轮次，已生成文件仍可单独确认下载。

绑定项目并明确开启可写权限后，可用结构化项目补丁创建或更新源码和文档；工具会校验旧文件哈希、返回 diff 和 edit_id，并支持在文件未被外部改动时撤销。项目删除仍需通过明确的用户确认流程，当前不由结构化补丁执行。

目前 **没有** 通用浏览器操作、任意桌面 GUI 操作、自动投递职位、专用联网搜索工具、也没有把所有职业能力都迁进新底座。本阶段是可执行底座，不是已经上线的完整求职产品。

## 4. 命令沙箱

默认配置在 agent/.env（没有文件时采用内置默认值）：

~~~dotenv
AGENT_SANDBOX_PROVIDER=auto
~~~

- auto：Windows 选择系统原生后端，其他系统选择 Docker。
- windows-native：明确选择 Windows 原生后端；不支持的平台会关闭命令。
- docker：明确选择本机 Docker Linux 引擎；不会因为 Docker 不可用而换成普通终端。

### Windows 原生后端（当前默认）

复用 DeepSeek Harness 的 MIT 组件 @deepseek-ai/dsh-sandbox-windows-acl，固定版本 0.2.1-rc.2。它使用 Windows 受限令牌、Low 完整性级别、目录 ACL 和 kill-on-close Job；这不是直接以服务权限打开 PowerShell。模型命令在 Windows PowerShell 5.1 中运行，工具描述会提供对应语法与当前对话的绝对资料路径。

每个对话只有 outputs/ 和每条命令的独立临时目录获得写入权限；inputs/ 保持只读。可信服务仅为当前用户拥有、经过真实路径检查的成果和临时目录准备权限，不修改整个项目、用户主目录或磁盘权限。成果目录的 capability ACL 与 Low 标签会保留以复用，临时授权在进程结束后撤销并删除临时目录。命令环境不继承模型密钥、代理、NODE_OPTIONS 或用户 PowerShell 模块路径。每条命令最多 60 秒、标准输出和错误合计最多 128000 字节；停止、超时、输出超限与正常结束都会关闭该命令的子孙进程。

「重新检查环境」会实际执行输入读取、成果写入、专用临时目录写入、输入覆盖拒绝和外部测试文件写入拒绝的探针，确认原文件未变且清理完成后才显示可用。初始化或自检失败时关闭命令，不回退为普通 PowerShell/cmd。

**边界仍然有限：** 当前主要限制文件写入与删除，不完整限制读取、联网或进程可见性，没有 CPU、内存或磁盘硬配额。输入只读不等于其他本机资料不可读；系统提示要求只处理用户导入资料，但提示词不是安全隔离。官方组件还记录了硬链接别名、其他 AppContainer 的 ACL 和持久 Low 标签等限制，不能当作完整容器或公网多租户隔离。安装在 AppContainer 工具改过权限的目录时，也可能无法读取运行文件。

本轮在 Windows 实际完成了 11 项原生专项测试和 Chrome 中的 CSV 统计/成果预览；流程使用本地脚本模型，未调用真实模型。详细结果与限制见 ../docs/agent-foundation/WINDOWS_NATIVE_SANDBOX_20261022.md；日志在 ../logs/windows-native-sandbox-20261022/。

### 可选 Docker 后端

设置 AGENT_SANDBOX_PROVIDER=docker，管理员自行安装并启动本机 Docker Linux 引擎，手工准备 agent/.env 中的镜像，例如：

~~~powershell
docker pull python:3.12-slim
~~~

固定策略：禁网、只读根目录、非 root、删除 Linux capabilities、no-new-privileges、PID/CPU/内存限制、60 秒命令超时、输入只读、输出可写。不会挂载 Docker socket、用户主目录、API Key 或其他项目目录，镜像不会自动下载。生产版本应改为经审查并固定摘要的镜像。Linux 使用普通用户启动服务并复用相同 UID/GID；Windows 容器默认使用 65534:65534。

显式容器验收（实际创建短时容器，不自动安装或拉镜像）：

~~~powershell
.\scripts\verify\verify-agent.ps1 -WithDocker
~~~

本轮电脑没有 Docker，容器实测明确跳过，不能称为通过。容器仍依赖宿主引擎和内核，绑定成果目录也没有磁盘硬配额。用户层文件工具由可信控制服务处理受限相对路径，与任意代码沙箱是两条执行路径。

## 5. 官方内置服务在哪里配置

本机 Agent 使用 `agent/.env`，客户端模板是同目录的 `.env.example`；8120 运营方使用 `.env.relay`，模板是 `.env.relay.example`。真实配置文件已被 Git 忽略。**不要把上游 API Key 或内部模型路由放进前端、`VITE_*` 或发给用户的安装包。**

官方服务的界面名称默认是 **Suinai Flash**，由 `OFFICIAL_MODEL_DISPLAY_NAME` 控制。它只是穗奈提供的服务名称，不代表自研底层模型，也不会替代请求中的真实模型 ID。修改它会更新现有官方连接的展示名，不需要重建账号或对话。用户自带接口仍显示用户选中的模型。

### 先在这台电脑接通

1. 编辑 `agent/.env`，先填写下面四项（把示例值换成你自己的）：

~~~dotenv
RELAY_UPSTREAM_BASE_URL=https://你的供应商或NewAPI网关/v1
RELAY_UPSTREAM_API_KEY=供应商给你的API密钥
RELAY_UPSTREAM_MODEL=供应商实际支持的模型ID
OFFICIAL_MODEL=Suinai Flash
~~~

`RELAY_UPSTREAM_BASE_URL` 填 API 基础地址，不填管理后台或聊天网页地址，也不需要附加 `/chat/completions`。真实上游模型 ID 只填写在 8120 服务器上的 `RELAY_UPSTREAM_MODEL` 和 `RELAY_MODEL_*`，客户端只保存 `Suinai Flash`。

2. 下面几项本机测试可以保持默认：

~~~dotenv
RELAY_HOST=127.0.0.1
RELAY_PORT=8120
RELAY_API_KIND=chat-completions
OFFICIAL_GATEWAY_URL=http://127.0.0.1:8120/v1
OFFICIAL_API_KIND=chat-completions
OFFICIAL_MODEL_DISPLAY_NAME=Suinai Flash
~~~

如果上游只支持 Responses，两处 `API_KIND` 都改为 `responses`。不要只改其中一处。

### 本地能力路由

当前 8120 可以使用同一个上游 Base URL 和 API Key 调用多个模型。`RELAY_UPSTREAM_MODEL` 是默认模型；下面这些配置按职业能力选择模型，未填写的能力自动回退到默认模型：

~~~dotenv
RELAY_MODEL_ACTION_PLAN=gpt-6.1-terra
RELAY_MODEL_RESUME_BUILD=供应商实际支持的文案模型ID
RELAY_MODEL_COMPARE_DECIDE=gpt-6.1-terra
RELAY_DECISION_MODEL=Typesafe-jev
RELAY_DECISION_PATH=/v1/systemone
RELAY_IMAGE_MODEL=供应商实际支持的图片模型ID
~~~

聊天能力通过 8110 发送的内部标识选择模型；用户界面仍显示 Suinai Flash。模型列表用于辅助发现，实际可用性以对应接口的真实请求为准；图片模型可能不在聊天列表中。RELAY_PATH_* 只适用于接受相同 Chat/Responses 请求格式的接口。

Jev 独立提供 POST /v1/systemone，沿用官方访问凭证、浏览器边界、并发限制与每日预算。职业资料更新、岗位对照和简历证据检查由 8110 自动构造结构化问题并调用 `/v1/career/decisions`；聊天模型不会把这个内部路由暴露给用户。直接 `/v1/systemone` 只允许 `model`、`state`、`questions` 和可选的 `stream:false`，不支持 messages、工具或 SSE。真实判断模型只存在 8120；客户端得到的是穗奈的判断结果。

Jev 的文档上下文上限为 32000 Token，包含 state 与 questions；本中转做 JSON 契约和体积限制，不宣称精确计算上游 Token。AGENT_CONTEXT_MAX_TOKENS=32000 是本机聊天 Agent 独立的上下文预算。RELAY_IMAGE_MODEL 由 8120 负责异步提交、后台轮询、过期回收与账号隔离；客户端只看到 Suinai Image 和官方任务状态。异步创建成功仍不等于最终图片已生成。

3. 在项目根目录签发当前安装实例的受限凭证：

~~~powershell
npm --prefix agent run relay:token -- issue my-test-install
~~~

把输出 JSON 中的 **`token`** 值（不是 `hash`）复制到 `.env` 的 `OFFICIAL_ACCESS_TOKEN=` 后。该凭证只显示一次，请勿发到聊天、工单或日志中。它不是供应商的上游 API Key。

4. 单独打开一个终端，在项目根目录运行中转并保持终端开启：

~~~powershell
npm --prefix agent run relay
~~~

再重启现有 Agent 后端（8110），刷新页面 → 模型设置 → 选择 **Suinai Flash** → 连接测试。开发前端可以继续访问 5173。如果当前整个项目由 `npm run dev` 启动，则先在原终端 Ctrl+C，再重新执行 `npm run dev`；不要在旧服务未停止时重复启动。

**仅修改 `.env` 不会让已运行的进程自动重载配置。** 修改 `RELAY_*` 后重启中转；修改 `OFFICIAL_*` 后重启 Agent。构建后使用 `npm start`；开发时使用 `npm run dev`。需要先在当前代码下执行一次 `npm run build`。

### 账号、用量和生产存储

8120 已有账号注册/登录、账号级令牌撤销与轮换、每日限额、用量事件、脱敏日志、账号停用、健康告警队列和异步图片任务回收。`RELAY_BILLING_ENABLED=false` 时只统计用量；打开后按服务端快照价格扣减积分，支付渠道与充值回调仍需另接。

本机联调默认 SQLite；生产可以填写 `RELAY_DATABASE_URL=postgresql://...` 使用 PostgreSQL，并通过 `npm run relay:migrate -- <SQLite源库路径>` 做空库迁移和逐表校验。生产备份使用 `npm run relay:token -- backup <路径>`；PostgreSQL 需要安装 `pg_dump`。

### 对外发布时的分工

- **你控制的运营方服务器：** 保存 `RELAY_UPSTREAM_*`，运行中转（默认 8120）。部署 HTTPS 反向代理和防火墙。真实上游密钥只留在这里。
- **用户安装目录的 `agent/.env`：** 只放 `OFFICIAL_*`。把 `OFFICIAL_GATEWAY_URL` 改成你的 HTTPS 中转地址；每个安装实例使用独立、可撤销的 `OFFICIAL_ACCESS_TOKEN`。不得包含 `RELAY_UPSTREAM_API_KEY`。
- 中转的 SQLite 或 PostgreSQL 只保存官方账号、令牌、用量事件、脱敏日志和任务状态，部署在运营方一侧；不是本机 Agent 的用户、岗位或对话数据库。

在运营方管理凭证：

~~~powershell
npm --prefix agent run relay:token -- list
npm --prefix agent run relay:token -- revoke <凭证的hash>
~~~

中转只接受配置的默认模型和能力路由模型、固定上游以及文本/客户端函数请求，禁止启用上游内建的联网、远程代码、文件库工具或外部文件/图片引用；每账号每能力通道同时只处理一个请求。默认每日 100 次请求、64000 输出 token 预留额度，可用 `RELAY_DAILY_REQUEST_LIMIT`、`RELAY_DAILY_OUTPUT_TOKEN_LIMIT` 调整。请求完成后会按上游 usage 结算；无 usage 的请求不会被虚构计费，失败和中断会释放预留。打开 `RELAY_BILLING_ENABLED` 后才会扣减官方积分，默认只统计。一次 Agent 任务可能发起多次模型请求。

本机集中开发可在 `agent/.env` 中设置 `RELAY_DAILY_OUTPUT_TOKEN_LIMIT=1000000`、`RELAY_DAILY_REQUEST_LIMIT=1000`，再重启 8120 中转。它们只提高本机中转允许的每日总预算，不修改上游余额或单次输出上限，也不代表供应商同意更高的频率。计数按 UTC 日期重置（北京时间每日 08:00），修改限额不清空已有记录。达到限额时返回 `relay_daily_output_limit` 或 `relay_daily_request_limit`；同一凭证并发被阻止时返回 `relay_busy`，与上游余额不足分开显示。

目前已经实现本地联调所需的账号、令牌、用量、日志脱敏、备份、账号级并发锁、上游健康告警、PostgreSQL 迁移和异步图片回收。阿里云 Linux ECS 的公网部署步骤见 [8120 官方中转部署](../deploy/relay/README.md)。仍需补充的是密码找回和邮箱验证、真实支付回调、外部监控系统；填写上游配置并完成连接测试后，才代表本机联调可用。

## 6. 验证与边界

~~~powershell
.\scripts\verify\verify-agent.ps1
~~~

顺序执行两端类型检查、Node/Vitest 测试、生产构建。日志写入项目 logs/agent-foundation-implementation-20261020/。用例使用独立目录，不改旧业务数据库。Windows 会自动包含原生受限命令实测，其他平台明确跳过；Docker 实测仍需 -WithDocker。Windows DPAPI 用假密钥做实际加解密。本轮单独日志在 logs/windows-native-sandbox-20261022/。

- 模型协议测试和全链路 HTTP 测试使用明确标注的脚本夹具，不代表真实 LLM 质量或供应商兼容性通过。
- 本轮自动验收使用模型替身；真实模型是否可用仍需你在本机填写上游配置后测试，注意费用与第三方隐私。
- Windows 原生端已完成真实写入限制验收；Docker 仍未在本机实测。
- Chrome 实测记录/截图另放 browser/；Chrome 扩展未授权本地文件 URL 时，自动选择文件受限，不应冒称整条 UI 上传已验证。
- 旧测试有重型动画运算，本机并发太高曾超时；验证入口使用 --maxWorkers=2，未放宽既有断言或超时门槛。

## 7. 目录职责

~~~text
src/config.ts / auth.ts / secrets.ts   配置、账号和凭据
src/store.ts                          独立 SQLite，当前运行链路的唯一主库
src/provider.ts / model.ts / profiles.ts  模型发现、协议兼容与连接能力实测
src/runtime.ts                        自研 decide/execute/observe 循环
src/tools.ts / files.ts / sandbox.ts   参数、资料区、版本与命令后端选择
src/native-sandbox.ts / native-process.ts  Windows 受限执行、探针、目录权限和清理
src/http.ts / main.ts                  本机 API、事件流与静态前端
src/relay*.ts                         可选的独立官方模型中转
../web/src/agent/                      新工作区、模型设置、事件归并
~~~

参考原始协议：
- https://developers.openai.com/api/docs/guides/function-calling
- https://docs.docker.com/reference/cli/docker/container/run/
- https://nodejs.org/docs/latest-v22.x/api/sqlite.html

Agent 执行循环、工具、审批和状态由本项目实现；Windows 原生进程隔离复用 DeepSeek Harness 的 MIT 组件，不能称为全部自行实现。版本固定为 @deepseek-ai/dsh-sandbox-windows-acl@0.2.1-rc.2，来源 https://github.com/deepseek-ai/deepseek-harness 。依赖与许可以 package-lock 和各包许可证为准；本轮保存了官方实现说明与 MIT 许可至 logs/windows-native-sandbox-20261022/references/。


## 对话工具栏与权限

- 穗奈的透明头像仅显示在助手消息中。模型连接、思考强度、文件导入和权限统一在输入区底部。
- 历史对话支持归档和恢复；归档只改变列表状态，不删除消息、资料与成果。运行中不可归档，归档后需恢复才能继续。
- 默认配置沿用现有受限执行环境。完全访问需在界面明确确认，以当前系统用户权限执行本机终端；不是管理员权限，也不是隔离沙箱。每条命令仍限时 60 秒、有界输出，导出确认不变。切换对话恢复默认配置，授权只随实际运行请求传递。
- 思考强度为自动、轻量、标准、深入。自动不附加参数，其余分别发送 low / medium / high；Chat Completions 使用 reasoning_effort，Responses 使用 reasoning.effort。服务商明确拒绝该参数时，有界回退到默认值并推送提示；服务商接受但忽略参数的情况无法由本机验证。
- 工作状态显示真实模型请求、计划、工具事件和等待时长，不编造或展示内部思维链。不会为了验收自动调用用户的真实模型。

## 统一岗位数据（2026-10-24）

岗位、方向、批次、原始交付及待审资料已迁入同一个 agent.sqlite，不再读取 agent/data 下的 JSON 副本。后续使用根目录 npm run catalogue:import 命令。旧版服务与迁移入口已从当前仓库清理，主库历史归档已清除；当前数据的备份位置和边界见 [数据库统一维护](../docs/agent-foundation/DATABASE_20261024.md)。

## 本机与云端界面规则（2026-10-30）

- `AGENT_DEPLOYMENT_MODE=local/server` 是服务端部署配置；不按域名猜测，也不让普通用户切换运行形态。
- `GET /api/v1/agent/info` 的 `ui` 清单集中控制模型连接、模型选择、本机项目、宿主机权限、系统打开和桌面退出入口。云端不展示这些本机操作，实际限制仍由后端执行。
- 云端账号注册不重复放模型授权勾选。账号尚未授权时，首次调用模型前明确说明并确认，不把隐藏 UI 当作已授权；已有授权继续沿用。官方连接未测试时在首次发送流程内初始化，不跳转模型配置页。
- 云端设备窗口读取 Hub 设备／会话接口，不提供“连接此电脑”或 PC 绑定二维码。
- PDF/DOCX 上传前在有限内存和超时的独立线程提取正文；不调用模型/OCR，不执行文档脚本。原件按原文件保存，`read_file` 直接返回提取正文并支持字符分页，`search_files` 可检索正文。DOCX 侧栏显示提取的正文，不承诺还原 Word 排版；PDF 沿用原件预览。
- 云端当前为账号鉴权和会话文件工具的逻辑隔离，命令工具默认关闭；不是每用户独立容器。不因本次 UI 修改启用 Docker、宿主机命令或第三方 Key。

官方每日积分、剩余额度、用量明细与账号权限命令见 [官方积分与账号权限](../docs/architecture/OFFICIAL_CREDITS.md)。
