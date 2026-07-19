# Android 行动端

Android 端定位为高频、轻量、可随时进入的行动客户端，默认进入“今日”。复杂职业探索、候选比较、完整决策编辑和计划全局调整继续在 Web 完成，不在小屏幕复制桌面工作区。

## 原生功能

- 注册、登录、加密会话恢复与三步轻量引导。
- 今日行动、任务状态、完成/延期/跳过和独立成果快速采集。
- 任务截止提醒、每周复盘提醒与 Android 13+ 通知权限处理。
- 快速周复盘、目标摘要、主备目标、里程碑、进度和信心反馈。
- 持久化 AI 行动教练会话，携带当前目标/计划上下文，支持失败重试和新会话。
- 账号档案、外部 AI 授权、同步状态、Light/Dark/跟随系统、动态颜色、自选种子色、图片取色和 Android 独立背景。

底部一级导航固定为 `今日 / 目标 / AI 导师 / 我的`；中等和展开宽度分别切换 Navigation Rail 与 Permanent Drawer。

## 架构

- `network/`：Retrofit 接口、统一 HTTPS 地址和网络错误。
- `data/`：远程数据源与 Repository，负责 Token 刷新和操作编排。
- `data/local/`：Room 中的最近目标、今日任务、待同步操作和 AI 会话；引导草稿单独加密保存。
- `sync/`：WorkManager 在联网后恢复离线操作。
- `notification/reminder/`：通知权限、偏好、调度策略、渠道和 Worker。
- `ui/design/`：项目 `M3*` 组件、设计 Token 和 Lucide 图标映射。
- `ui/theme/`：Material Color Utilities 配色、Monet、主题偏好、图片取色和背景画布。
- `ui/screens/`：登录、引导与四个业务页面。
- `SessionStore.kt`：Android Keystore 加密的登录会话。

“今日”支持任务完成、延期、跳过、成果填写和快速周复盘；任务状态携带后端版本号，跨端冲突会提示刷新，不会静默覆盖。复杂计划调整仍进入 Web 二次确认。

离线操作会持续分批同步；完成任务后本地进度立即更新，待同步复盘在进程重启后仍会恢复。存在待同步成果、任务或复盘时，退出登录会被阻止并提示先同步，避免清理账号缓存时丢失数据。

## 设计规范

实现遵守 `docs/项目设计规范.md`：根节点统一使用 `CareerTheme`，业务页面只使用项目 `M3*` 组件和语义 Token，不直接使用 Material 控件、Material Icons、硬编码颜色或形状。Android 12+ 可使用系统动态颜色，旧版本使用同源种子色方案；本机背景会移除 EXIF 并复制到应用私有目录，不覆盖 Web 背景。

品牌名称统一为“青穗集”，启动图标使用穗奈标准头像；AI 导师的默认、倾听、思考、讲解、担心、提醒、鼓励和完成头像与 Web 使用相同源图和状态优先级。Android 派生资源由 `android/scripts/prepare_brand_assets.py` 从 `docs/品牌形象/BgSub_*.png` 生成到 `drawable-nodpi`，不把多兆像素源图直接打包进 APK。

## 构建

```powershell
cd D:\Project\career-decision-system\android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:lintRelease
```

Debug 默认后端为：

```text
https://192.168.1.159:8443
```

临时覆盖仍然必须使用 HTTPS：

```powershell
.\gradlew.bat :app:assembleDebug "-Pcareer.backendDebugBaseUrl=https://YOUR_LAN_IP:8443"
```

### 真机性能构建

不要用 Debug APK 判断 Compose 滑动帧率。`performance` 变体使用与 Release
相同的非调试编译路径，同时保留本地开发后端、项目 CA 和 Debug 签名，可直接覆盖安装：

```powershell
.\gradlew.bat :app:assemblePerformance "-Pcareer.backendDebugBaseUrl=https://YOUR_LAN_IP:8443"
adb install -r .\app\build\outputs\apk\performance\app-performance.apk
```

该 APK 可被系统性能工具读取，但不包含 Debug/Compose Inspector 的运行时开销。

## 真机 HTTPS

1. 在根目录运行 `.\scripts\setup-local-https.ps1`。
2. 重新构建并覆盖安装 Debug APK；脚本会把公开根证书同步到 `app/src/debug/res/raw/local_debug_ca.pem`。
3. 确保手机和电脑在同一局域网，并允许防火墙访问 `8443`。
4. 用根目录启动器启动 Agent 和后端，再安装最新 Debug APK。

手机不需要安装系统 CA。只有 Debug APK 信任“系统 CA + 项目内置开发 CA”；Release APK 不包含也不信任该开发 CA。重新生成 mkcert 根 CA 后，旧 Debug APK 必须被新构建覆盖。

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
