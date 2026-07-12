# Android 行动端

Android 端是第一版的行动客户端，页面为 `今日 / 目标 / AI 导师 / 我的`。复杂候选比较和目标编辑继续在 Web 完成。

## 架构

- `network/`：Retrofit 接口、统一 HTTPS 地址和网络错误。
- `data/`：远程数据源与 Repository，负责 Token 刷新和操作编排。
- `data/local/`：Room 中的最近目标、今日任务和待同步操作。
- `sync/`：WorkManager 在联网后恢复离线操作。
- `ui/`：导航宿主、ViewModel 和四个独立页面。
- `SessionStore.kt`：Android Keystore 加密的登录会话。

“今日”支持任务完成、延期、跳过、成果填写和快速周复盘；任务状态携带后端版本号，跨端冲突会提示刷新，不会静默覆盖。复杂计划调整仍进入 Web 二次确认。

## 构建

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

Debug 默认后端为：

```text
https://192.168.1.159:8443
```

临时覆盖仍然必须使用 HTTPS：

```powershell
.\gradlew.bat :app:assembleDebug "-Pcareer.backendDebugBaseUrl=https://YOUR_LAN_IP:8443"
```

## 真机 HTTPS

1. 在根目录运行 `.\scripts\setup-local-https.ps1`。
2. 将 `.local-https\mkcert-rootCA.pem` 安装为手机的 CA 证书，仅用于本地调试。
3. 确保手机和电脑在同一局域网，并允许防火墙访问 `8443`。
4. 用根目录启动器启动 Agent 和后端，再安装 Debug APK。

未安装本地 CA 时，真机不会信任开发证书，这是预期的 HTTPS 安全行为。

## 真机烟测

只检查安装、启动和登录页：

```powershell
.\scripts\smoke-android.ps1
```

使用已有测试账号完成 HTTPS 登录、四页导航、任务完成、成果填写和同步：

```powershell
.\scripts\smoke-android.ps1 `
  -Username "your_test_user" `
  -Password "your_test_password" `
  -RequireAuthenticatedFlow
```

严格模式会为本次操作生成唯一成果标记，并在手机提交后轮询共享 HTTPS 后端。只有任务状态为 `completed` 且该成果标记真实入库才算跨端同步通过；仅出现手机端成功提示不会通过验收。
