<!-- 青穗集 · 穗奈桌面前端索引；页面代码、构建工具和第三方运行时分开。 -->
# 穗奈桌面

`web/` 是 React 19 + Vite 前端。浏览器平时访问 5173，开发代理把 `/api` 和 `/healthz` 转到 8110 的 TypeScript Agent。

| 目录 | 用途 |
| --- | --- |
| `src/` | 页面、对话、状态、个人主页、岗位与简历组件 |
| `public/` | 字体等无需鉴权的前端静态资源 |
| `scripts/` | Live2D、启动动效、像素素材和字体构建工具 |
| `vendor/live2d/` | 固定版本的本地 Live2D 运行时 |
| `e2e/` | 浏览器验收脚本和页面状态夹具 |

前端不直接持有 API 密钥、用户数据库或私有成果文件。网页图片和角色素材统一从 `/api/assets/*` 获取，源文件仍放在 `assets/web/` 或品牌文档目录。

```powershell
npm --prefix web run typecheck
npm --prefix web test -- --maxWorkers=1
npm --prefix web run build
```
