# 云端执行核心（可选）

当前线上入口已改为 Cloud Hub；账号、设备、远程任务及可选云端执行的部署见 [Cloud Hub 文档](../hub/README.md)。

本目录保留 HTTPS 代理模板与独立 Cloud Runtime 的配置参考。生产服务使用 `dist/hub/hub.js`，由 `HUB_CLOUD_EXECUTOR` 决定是否启用云端执行器；PC 任务始终由对应电脑执行。
