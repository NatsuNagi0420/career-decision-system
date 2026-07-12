# 测试例外

## TEST-PLATFORM-001

- 测试：`AssetControllerTest.symbolicLinkImageIsNotExposedAsPublicAsset`
- 原因：未启用 Windows 开发者模式或当前账号没有创建符号链接的权限时，Java 无法建立测试所需的链接。
- 风险：仅缺少当前机器上的符号链接穿越回归；普通路径穿越和私有文件访问测试仍执行。
- 后续：在允许创建符号链接的 CI/Linux 环境中执行该测试；一旦项目接入 CI，将此项作为必跑门禁。
