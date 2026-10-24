<!-- 青穗集 · 已退休 Python 服务的追溯边界；默认启动链路不读取这里。 -->
# Legacy

这里保存早期的 Python / FastAPI / LangGraph / MySQL 实现，仅用于历史追溯、迁移核对和旧实验复现。

当前产品默认使用根目录下的 TypeScript Agent：

- `agent/`：当前本机 Agent、SQLite 主库、模型连接和工具执行；
- `web/`：当前 React/Vite 穗奈桌面；
- `assets/web/`：当前页面运行时素材。

`legacy/server-python/` 不属于默认启动链路，也不应被新的功能继续依赖。旧代码中的 `server/` 路径只在历史文档中保留，历史文档不代表当前启动方式。
