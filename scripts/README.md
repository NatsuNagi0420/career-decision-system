<!-- 青穗集 · 当前辅助脚本索引；脚本按任务边界分组。 -->
# 开发脚本

这里的脚本只辅助当前 TypeScript Agent + React/Vite 主线，不承载产品运行时代码。

| 目录 | 入口 | 用途 |
| --- | --- | --- |
| `dev/` | `dev-agent.mjs` | 启动 8110 Agent 与 5173 前端 |
| `dev/` | `agent-foundation-preflight.mjs` | 只读检查 Windows 原生工具和 Docker 前提 |
| `dev/` | `preview-guidance.mts` | 使用合成账号和模型替身预览穗奈交互 |
| `catalogue/` | `import-job-catalogue.py` | 清洗岗位交付包并写入唯一 SQLite 主库 |
| `catalogue/` | `job-catalogue-cleaning.py` | 岗位字段校验、去重和异常隔离 |
| `catalogue/` | `test-merge-job-catalogue.py` | 岗位批次合并回归 |
| `catalogue/` | `catalogue-db.mjs` | 岗位导入使用的 TypeScript 数据库桥 |
| `release/` | `build-windows.mjs` | 构建 Windows 本机安装包与便携包，不复制用户库和开发配置 |
| `release/` | `verify-windows.mjs` | 隔离验证安装版启动、单实例、完全退出与资料保留 |
| `verify/` | `verify-agent.ps1` | Windows 下执行 Agent、Web、测试和构建验证 |

常用命令：

```powershell
npm run dev
npm run catalogue:import -- --archive "docs/岗位库扩充/待导入/新批次.zip" --review "docs/岗位库扩充/对应批次清洗规则.json"
python scripts/catalogue/test-merge-job-catalogue.py
.\scripts\verify\verify-agent.ps1
```

脚本的输出写入 `logs/` 或临时目录；密钥、个人资料和运行数据库不应写入版本库。
