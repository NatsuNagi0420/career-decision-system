<!-- 青穗集 · 网页公共素材目录说明：统一后端读取入口，不存放用户资料或凭据。 -->
# 网页素材

网页素材统一保存在本目录的 `web/` 下，由 TypeScript Agent 只读提供，不再复制到前端 `public/`。

| 目录 | 用途 |
| --- | --- |
| `web/brand/` | 头像、品牌、像素图标、穗奈角色图片与动作清单 |
| `web/dialogs/` | 用户提供的弹窗背景，当前为 `warning-window.webp` |
| `web/live2d/` | 本地运行时、模型、纹理、着色器、动作与第三方授权说明 |
| `web/projects/` | 启动动画 JSON、静态回退图及对应许可 |

前端通过 `web/src/assets.ts` 的 `assetUrl("brand/...")` 生成 `/api/assets/brand/...` 地址。CSS 与 HTML 使用相同前缀。开发模式由 Vite 代理到 Agent，生产模式由 Agent 直接提供，两个模式共用同一份素材。

生成脚本也写入这里，`npm run build` 会重建 Live2D 运行时。部署或拷贝项目时，须同时保留 `assets/web/`、`agent/dist/` 和 `web/dist/`，不能只拷贝前端构建目录。

这里是**公开且无需登录**的品牌素材区域，禁止放简历、聊天记录、API 密钥、PSD/ZIP 源文件或其他私人资料。后端限制目录与格式、拒绝越界链接，支持 ETag 与 HEAD；用户上传与成果文件仍使用原有的鉴权接口。字体保留在 `web/public/fonts/`，不在本次图片迁移范围内。
