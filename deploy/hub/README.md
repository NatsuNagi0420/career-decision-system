# 青穗集 · Cloud Hub：设备控制与会话同步

用户使用同一个官方账号登录 PC 与小程序。官方账号与模型来源独立：PC 可使用本机自配第三方模型，其 Key、Base URL、项目绝对路径不会进入设备公开目录。

```
小程序 ─ HTTPS ─ Cloud Hub（agent.suinai.me）
                      ↑ PC 主动心跳、认领与进度回传
                   PC Agent（8110）─ 官方中转（api.suinai.me / 8120）─ 上游
                      └──────────── 用户自配模型
               Cloud Hub ─ 可选 Cloud Executor ─ 官方中转
```

## 本机使用

1. PC 使用 `http://127.0.0.1:5173`。首次打开先选择“本机 API Key”，随后创建并记住本机设备会话；也可以直接选择青穗集账号登录。
2. 本机模式下可在“模型与连接设置”添加第三方 API Key；登录官方账号后，本机资料与对话会迁移到官方账号对应的本地身份，官方账号只保存同步所需凭证。
3. 打开“设备与同步”，输入电脑名称，点击“连接此电脑”；电脑端显示 10 分钟有效的二维码。
4. 小程序登录同一账号，打开“电脑与云端”，扫描二维码完成绑定。二维码是一次性短期凭证，不能跨账号或跨服务使用。
5. 绑定后，小程序显示这台电脑登记的全部项目和已同步的电脑会话；可以继续已有会话，也可以按项目新开会话。
6. 手机沿用会话在电脑上的项目、模型和读写设置；手机不能把本机任意路径或完全访问权限带到远端。
7. 小程序选择电脑或云端后发送任务。选电脑时，离线任务进入“等待电脑上线”，不会自动改派到云端。撤销设备后停止认领，运行中的远程任务会在下次电脑心跳停止。

电脑主动访问 `AGENT_CLOUD_URL`；不要求公网 IP、端口映射或反向连接。Windows 的官方账号凭证和设备密钥使用 DPAPI 保存。其他系统目前只在内存保管这些凭证，重启需重新登录和连接，不降级为明文。

## 云端部署

入口 `agent/src/hub.ts`，公共协议和实现位于 `agent/src/cloud-hub/`。本机和云端执行复用 Runtime，不维护另一份 Agent 核心。

- 构建：`npm run build:hub --prefix agent` 和 `npm --prefix web run build`。发布目录包含 `agent/dist/hub`、`agent/package*.json`、`web/dist`，并把项目的公共素材 `assets/web` 复制到发布目录的 `agent/assets/web`（匹配编译后素材模块的相对路径）。Linux 执行 `npm ci --omit=dev`；Nginx 使用本目录的 `nginx-cloud-web.conf` 提供云端前端并代理 `/api/`。
- 配置：复制 `.env.hub.example` 到 `/etc/qingsuiji/agent.env`。权限 0600，属主 `qingsuiji-agent`。
- 服务：本目录的 `qingsuiji-agent.service`。保留已有 `/var/lib/qingsuiji/agent/agent.sqlite`，不要重建用户表。
- HTTPS：网页部署使用本目录 `nginx-cloud-web.conf`；仅提供 API 的部署可复用 `../agent/nginx-agent.conf`。只公开 80/443；8110、8120 均监听回环。
- `HUB_CLOUD_EXECUTOR=false` 时只同步/转发，并拒绝网页直接创建或执行会话；true 时同时开放官方账号的网页对话入口与独立云端任务。两条入口共用 Runtime、账号隔离与记忆库。当前云端禁用命令执行和本机项目访问，支持对话、职业工具与文本文件制作，不需要 Docker。
- 已部署服务保留原 unit，以 `/etc/systemd/system/qingsuiji-agent.service.d/hub.conf` 覆盖入口；新部署可直接使用本目录 unit。
- 每日备份：安装本目录的 `backup.mjs` 与 `qingsuiji-hub-backup.{service,timer}`，输出 `/var/backups/qingsuiji/agent/`，保留最近 7 份；迁移前备份单独保留。
- 官方计费/内部模型路由继续只放官方 relay 端；Hub 不持有上游 Key。

## 记忆同步与版本更新

- `/api/v1/hub/config` 返回 `memory_sync: 1` 后，本机桥接才启用记忆增量协议；旧云版本仍可继续同步会话。
- 记忆交换接口为 `POST /api/v1/hub/worker/:id/memory`，同时校验官方账号、设备凭据和设备的会话同步开关。识海的账号同步关闭时，本机不上传；仅使用本机 API Key 的身份不上传。
- 记忆表、全文索引、后台整理队列与同步版本都保存在原 `agent.sqlite`，通过幂等初始化升级；不会因部署自动回填旧聊天。
- 更新前对原库做 SQLite 一致性备份，并在副本上验证迁移；配置、服务入口和旧代码另行保留。禁止用本机整库覆盖云端用户库。公共岗位数据只从 `catalogue_*` 表导出并校验导入。
- 2026-10-30 起线上 `/opt/qingsuiji/cloud-agent` 指向 `/opt/qingsuiji/releases/cloud-<时间>`；持久数据仍为 `/var/lib/qingsuiji/agent`，部署前备份位于 `/var/backups/qingsuiji/deployments/`。本次记录见 `logs/cloud-sync-20261030/`。

## 同步与恢复规则

- Hub 的镜像、队列、租约、文件独立存入 `hub_*` 表，不向 Runtime 的运行表导入镜像记录。
- 本机 `remote_*` 表保存配对及执行回执；Hub task ID 用作 Runtime 的幂等 request ID。重复提交不会重复调用工具。
- 所有 Hub 数据按官方账号隔离。PC worker 另需设备密钥；云端只保存密钥摘要。
- 绑定后默认同步本账号的可见会话、流式草稿、公开工具事件、画像来源快照与输入/输出文件；用户可在手机暂停会话同步。
- 云端任务与各电脑会话按执行位置分开，PC“设备与同步”可查看云端进度和下载文件。画像按来源保留版本，小程序显示所选执行位置的画像；暂不自动合并不同设备上的矛盾事实。
- 镜像永久删除会保留无内容墓碑，避免被电脑再次上传。手机删除同步副本不删除电脑上的原始项目或聊天。PC 本地删除已同步聊天，会移除云端副本。
- 进度采用快照轮询（约 1–4 秒），不声称跨端逐 token 同步。PC 本地仍使用已有 SSE。
- 执行租约 60 秒，续约后延长；过期为 interrupted，重启不自动重放已开始的工具。电脑重新上线只认领尚未开始的任务。
- 文件单个不超过 4MB，每个账号同步文件总额 64MB。超过 4MB 的本机文件留在电脑，暂不上传；手机导入沿用当前文本资料支持格式（1MB 内）。
- 微信真机需在小程序后台将 `https://agent.suinai.me` 加入 request、downloadFile 合法域名。编译成功不能替代真机登录、配对和下载验收。

## 验证

`agent/test/cloud-hub.test.ts` 验证身份退出、隔离、设备授权、幂等及 HTTP→PC Runtime→文件回传；`cloud-executor.test.ts` 验证云端执行、远程审批、PC 离线不改派及租约中断。

测试和部署记录：`logs/20261029-cloud-hub/`，不写入凭证和配置正文。


