<!-- 青穗集 · 阿里云 Linux ECS 上部署 8120 官方中转的操作手册。 -->
# 8120 官方中转部署

这份手册针对当前项目的真实架构：云服务器只运行 8120，Windows 客户端仍运行 8110 和前端。8120 保存上游 API Key、官方模型路由、官方账号和用量数据；8110 保留在用户电脑上，负责本地文件、项目工作区、Windows 沙箱和工具执行。

## 先确认链路

```text
Windows 客户端
5173（开发前端）
        │
        ▼
8110（本机 Agent：文件、沙箱、会话）
        │  服务端 HTTPS 请求
        ▼
api.example.com:443（Nginx + HTTPS）
        │
        ▼
127.0.0.1:8120（官方中转）
        │  上游 HTTPS + 官方 Key
        ▼
你的 OpenAI 兼容网关
```

域名建议使用独立子域名，例如 `api.example.com`。浏览器不要直接把请求发到 8120：当前中转会拒绝带浏览器 `Origin` 的直接请求，这是为了避免官方凭证被网页脚本滥用。客户端通过本机 8110 服务端连接云端中转，正好符合当前代码设计。

云服务器不需要安装 5173、8110、Windows 沙箱或网页素材，也不需要开放 8120、5432 到公网。

## 需要准备的东西

- 一台有公网 IPv4 的阿里云 ECS，推荐 Ubuntu 22.04/24.04 或 Debian 12。
- 你的域名和一个 API 子域名，例如 `api.example.com`。
- 一个固定公网 IP。
- 上游 OpenAI 兼容网关的 Base URL、API Key 和实际模型 ID。
- 可以通过 SSH 登录并使用 `sudo` 的账号。

香港地域通常不涉及中国大陆网站备案这一层限制，但域名解析、证书签发和云安全组仍然要配置好。

## 1. 配置域名和阿里云安全组

在 DNS 控制台新增一条 A 记录：

```text
主机记录：api
记录类型：A
记录值：ECS 公网 IPv4
```

在 ECS 安全组只放行：

| 端口 | 来源 | 用途 |
| --- | --- | --- |
| 22 | 你的固定 IP 或可信办公出口 | SSH |
| 80 | `0.0.0.0/0` | 首次签发证书、HTTP 跳转 |
| 443 | `0.0.0.0/0` | 正式 HTTPS |

不要放行 8120 和 5432。8120 只允许 Nginx 访问，数据库若以后改用 PostgreSQL 也只允许本机或私有网络访问。

如果系统启用了 UFW，可以再执行：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

## 2. 安装运行环境

下面命令适用于 Ubuntu/Debian。Node.js 要求至少 22.17.0，当前项目建议使用 22.19.0 或更新的 Node 22：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git nginx certbot python3-certbot-nginx openssl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

Node 版本应显示 `v22.19.0` 或更新版本。不要使用系统自带的过旧 Node.js。

创建只用于运行中转的系统账号和状态目录：

```bash
sudo useradd --system --home /opt/qingsuiji --shell /usr/sbin/nologin qingsuiji || true
sudo install -d -o qingsuiji -g qingsuiji -m 0750 /var/lib/qingsuiji/relay
sudo install -d -o qingsuiji -g qingsuiji -m 0700 /var/backups/qingsuiji/relay
sudo install -d -o root -g root -m 0755 /opt/qingsuiji
```

## 3. 上传当前代码并构建 8120

代码可以从 GitHub 拉取，也可以用 SCP 上传。下面以 Git 为例，把 `<仓库地址>` 换成你的仓库地址：

```bash
sudo git clone <仓库地址> /opt/qingsuiji/app
sudo chown -R root:root /opt/qingsuiji/app
cd /opt/qingsuiji/app
npm --prefix agent ci
npm --prefix agent run build:relay
```

构建完成后，以下文件应存在：

```text
/opt/qingsuiji/app/agent/dist/relay/relay.js
/opt/qingsuiji/app/agent/dist/relay/relay-token.js
```

这里使用的是独立的 relay 编译入口，构建不会启动本机 Agent，也不会打包 5173。

## 4. 写入服务器密钥和模型路由

复制模板到被 Git 忽略的配置文件，并设置权限：

```bash
sudo install -o qingsuiji -g qingsuiji -m 0600 \
  /opt/qingsuiji/app/deploy/relay/.env.production.example \
  /opt/qingsuiji/app/agent/.env.relay
sudoedit /opt/qingsuiji/app/agent/.env.relay
```

至少填写这些值：

```dotenv
RELAY_HOST=127.0.0.1
RELAY_PORT=8120
RELAY_DATA_DIR=/var/lib/qingsuiji/relay
RELAY_ADMIN_TOKEN=一串新的随机管理员凭证
RELAY_UPSTREAM_BASE_URL=https://你的上游网关/v1
RELAY_UPSTREAM_API_KEY=你的上游APIKey
RELAY_UPSTREAM_MODEL=gpt-6.1-terra
RELAY_MODEL_RESUME_BUILD=gemini-3.8-flash
RELAY_DECISION_MODEL=Typesafe-jev
RELAY_DECISION_PATH=/v1/systemone
RELAY_PUBLIC_MODEL=Suinai Flash
RELAY_IMAGE_MODEL=
RELAY_DATABASE_URL=
```

`RELAY_UPSTREAM_BASE_URL` 是 API 基础地址，不填管理后台、聊天网页或完整的 `/chat/completions` 地址。以当前网关为例，形态应是 `https://maolaoapi.com/v1`。`RELAY_DECISION_PATH=/v1/systemone` 保留完整路径，因为你的 Jev 接口不是标准聊天路径。

生图目前不启用，保持 `RELAY_IMAGE_MODEL=` 空即可。等上游异步图片接口单独验收通过后，再填写实际图片模型；不要因为图片路由未配置而阻塞文本和职业判断服务。

生成管理员凭证可以使用：

```bash
openssl rand -hex 32
```

管理员凭证只用于 `/admin/*` 管理接口，不能和上游 API Key、用户官方账号密码或客户端访问令牌混用。

## 5. 用 systemd 启动 8120

安装仓库里已经准备好的服务文件：

```bash
sudo install -m 0644 \
  /opt/qingsuiji/app/deploy/relay/qingsuiji-relay.service \
  /etc/systemd/system/qingsuiji-relay.service
sudo systemctl daemon-reload
sudo systemctl enable --now qingsuiji-relay
sudo systemctl status qingsuiji-relay --no-pager
```

先在服务器内部检查，确认 8120 只在回环地址监听：

```bash
curl --fail --silent http://127.0.0.1:8120/healthz
sudo ss -lntp | grep -E ':8120|:80|:443'
```

持续查看日志：

```bash
sudo journalctl -u qingsuiji-relay -f
```

正常情况下，服务启动日志不会打印上游 API Key、请求正文或模型返回正文。

## 6. 配置 Nginx 和 HTTPS

先安装 HTTP 反向代理配置：

```bash
sudo install -m 0644 \
  /opt/qingsuiji/app/deploy/relay/nginx-http.conf \
  /etc/nginx/sites-available/qingsuiji-relay
sudo sed -i 's/api\.example\.com/api.你的域名/g' /etc/nginx/sites-available/qingsuiji-relay
sudo ln -sfn /etc/nginx/sites-available/qingsuiji-relay /etc/nginx/sites-enabled/qingsuiji-relay
sudo nginx -t
sudo systemctl reload nginx
```

将命令中的 `api.你的域名` 换成实际子域名。确认 DNS 已经解析到 ECS 后，申请证书：

```bash
sudo certbot --nginx -d api.你的域名
sudo certbot renew --dry-run
```

Certbot 会把 HTTP 站点升级为 HTTPS。正式地址应是：

```text
https://api.你的域名/v1
```

Nginx 配置已经关闭代理缓冲并保留长连接，适合当前的流式文本输出。图片接口的请求体上限也和 8120 的 8 MB 限制保持一致。

## 7. 验收公网中转

仓库提供了一个不回显凭证的基础验收脚本：

```bash
chmod +x /opt/qingsuiji/app/deploy/relay/verify-relay.sh
/opt/qingsuiji/app/deploy/relay/verify-relay.sh https://api.你的域名
```

它会检查：

- HTTPS `/healthz` 能访问。
- 未携带凭证访问 `/v1/account/usage` 返回 401。
- 8120 不应该通过公网端口直接访问，端口暴露由安全组和本机监听共同保证。

首次联调时，可以在服务器上签发一个临时安装凭证。它只显示一次，适合本机连接测试，不建议把同一个凭证发给所有用户：

```bash
sudo -u qingsuiji bash -lc \
  'cd /opt/qingsuiji/app/agent && /usr/local/bin/node dist/relay/relay-token.js issue local-smoke-test'
```

返回 JSON 中的 `token` 是凭证，`hash` 是后续撤销和轮换时使用的摘要。不要把 `token` 提交到 Git、截图或日志。

生产用户应通过穗奈的官方账号注册/登录流程获得账号令牌；临时安装凭证只用于验收。当前中转已经按账号隔离会话、用量和令牌撤销状态。

## 8. 把本机 8110 接到云端

在 Windows 项目的 `agent/.env` 中填写：

```dotenv
OFFICIAL_GATEWAY_URL=https://api.你的域名/v1
OFFICIAL_MODEL=Suinai Flash
OFFICIAL_MODEL_DISPLAY_NAME=Suinai Flash
OFFICIAL_API_KIND=chat-completions
```

本机测试阶段，如果使用第 7 步签发的临时令牌，再填写：

```dotenv
OFFICIAL_ACCESS_TOKEN=刚才一次性显示的qsg令牌
```

更推荐在页面中完成官方账号注册/登录，让 8110 把账号令牌保存在本机密钥存储里。不要把服务器上的 `RELAY_UPSTREAM_API_KEY` 填入 Windows 的 `.env`，也不要放入 `VITE_*` 配置。

修改 `.env` 后重启 8110；开发环境从项目根目录重新运行：

```powershell
npm run dev
```

浏览器仍然打开 `http://127.0.0.1:5173/`。5173 只访问本机 8110，真正的链路是 `5173 → 8110 → HTTPS 域名 → Nginx → 8120`。

## 9. 备份和更新

8120 默认使用单机 SQLite，适合当前单实例内测和小规模使用。备份脚本会生成 0600 的 SQLite 快照并删除 14 天以前的本地备份：

```bash
sudo install -o root -g root -m 0750 \
  /opt/qingsuiji/app/deploy/relay/backup-relay.sh \
  /usr/local/sbin/qingsuiji-relay-backup
sudo /usr/local/sbin/qingsuiji-relay-backup
```

建议再把 `/var/backups/qingsuiji/relay/` 同步到阿里云 OSS 或另一台机器；只留在同一台 ECS 上无法抵御磁盘损坏和整机故障。备份前不需要停服务，relay CLI 使用 SQLite 的 `VACUUM INTO` 生成一致快照。

单实例更新流程：

```bash
cd /opt/qingsuiji/app
sudo git pull --ff-only
sudo npm --prefix agent ci
sudo npm --prefix agent run build:relay
sudo systemctl restart qingsuiji-relay
sudo journalctl -u qingsuiji-relay -n 80 --no-pager
```

更新前先做一次备份。若新版本启动失败，恢复上一版本代码后重新构建并重启，不要删除 `/var/lib/qingsuiji/relay`。

## 10. 什么时候切 PostgreSQL

现在不必为了部署 8120 额外安装 PostgreSQL。单台 ECS、单个 relay 进程使用 SQLite 更简单，已有 WAL、事务、账号级租约、用量和备份实现。

当你需要多台 8120、滚动发布或更高并发时，再使用阿里云 RDS PostgreSQL 或同一私网内的 PostgreSQL，填写：

```dotenv
RELAY_DATABASE_URL=postgresql://用户名:密码@私网地址:5432/数据库名?sslmode=require
```

迁移前先停写入、备份 SQLite，再用项目提供的 `relay:migrate` 做逐表校验。不要把 PostgreSQL 端口开放到公网。

## 常见故障

### `healthz` 正常，但本机连接返回 502

先看本机 8110 的日志，再看云端：

```bash
sudo journalctl -u qingsuiji-relay -n 120 --no-pager
```

重点检查 `RELAY_UPSTREAM_BASE_URL`、上游 Key、真实模型 ID 和上游是否允许该来源。上游 Key 只在云端 `.env.relay` 中检查，不能复制到前端。

### 返回 `relay_browser_forbidden`

说明浏览器直接请求了 8120。前端应访问本机 `8110`，由 8110 服务端转发到云端；不要把官方域名直接写进浏览器端的 API 客户端。

### 返回 `401`

这是官方凭证缺失、过期或已撤销。重新通过官方账号登录，或者在本机验收阶段重新签发临时令牌。不要反复重启服务来解决凭证问题。

### 返回 `429`

可能是官方每日请求/输出限额、账号并发租约或上游实际限流。查看 `/admin/metrics` 和 `/admin/usage` 时必须携带管理员凭证；不要直接提高限额掩盖上游限流。

### Nginx 返回 502

确认 8120 正在运行并且只监听 `127.0.0.1:8120`：

```bash
sudo systemctl status qingsuiji-relay --no-pager
curl http://127.0.0.1:8120/healthz
sudo nginx -t
```

### 流式输出卡住

确认 Nginx 配置中的 `proxy_buffering off`、`proxy_request_buffering off` 和 `proxy_read_timeout 180s` 没被覆盖；同时检查上游模型是否长时间没有返回任何数据。

## 每日积分与账号权限

每日 2300 积分、北京时间零点刷新、服务端计价和管理员命令见 [官方积分与账号权限](../../docs/architecture/OFFICIAL_CREDITS.md)。管理程序是 `dist/relay/relay-admin.js`，只在官方服务器执行，不随 PC 客户端配置管理凭证。
