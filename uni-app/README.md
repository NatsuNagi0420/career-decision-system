/** 青穗集 · 小程序工程说明：移动端只消费现有 Agent 接口，页面不拥有独立职业推理逻辑。 */
# 青穗集 Uni-app 小程序

这是职业成长 Agent 的微信小程序入口，独立于现有 `web/` 桌面工作台。小程序只负责移动端渲染、交互和状态反馈，职业画像、岗位库、会话与 Agent 运行仍由现有 8110 服务提供。

当前已对齐的真实能力：

- 登录、注册、令牌保存和模型调用授权
- 创建、恢复、切换、重命名、归档、恢复和永久删除对话
- 真实 Agent 任务运行与快照轮询式流式回复
- 导入 TXT、Markdown、CSV、JSON、LOG、YAML 文本资料（单文件不超过 1 MB）
- 从 8110 读取职业画像、岗位样本、岗位方向和行动状态
- 页面入场、卡片错峰、角色浮动、等待呼吸、流式气泡、弹层、输入聚焦、按压和点击反馈

小程序当前不展示没有真实接口支撑的语音入口，也不会在空数据时伪装已经生成岗位推荐、画像或行动路线。

## 开发

```powershell
npm install
npm run dev:mp-weixin
```

将 `dist/dev/mp-weixin` 导入微信开发者工具；如果先看移动端 H5：

```powershell
npm run dev:h5
```

## 检查

```powershell
npm run type-check
npm run build:h5
npm run build:mp-weixin
```

## 后端地址

复制 `.env.example` 为 `.env`，将 `VITE_AGENT_API_ORIGIN` 改成可访问的后端 HTTPS 地址。微信真机不能访问 `127.0.0.1:8110`，正式体验前必须部署公开 HTTPS 服务或配置微信云开发。

模型 API Key 只放在后端，不进入小程序包。
