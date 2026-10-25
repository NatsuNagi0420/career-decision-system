<!-- 青穗集 · Windows 原生沙箱决策、实际边界与验收记录；脚本模型不代表真实 LLM 验收。 -->
# Windows 原生沙箱接入记录

日期：2026-10-22。目标：本地安装后即可通过系统机制执行工具命令，优先使用 Windows 原生限制，保留 Docker 后端。

## 实现与选择

配置位置是 agent/.env，模板见 agent/.env.example。默认 AGENT_SANDBOX_PROVIDER=auto：Windows 使用 windows-native，其他平台使用 docker。可显式选择，两者失败均关闭命令，没有无限制宿主终端的兜底。

Agent 的规划/执行循环、工具契约、账号、状态、审批和成果版本保持本项目实现。Windows 执行组件复用 DeepSeek Harness 的 @deepseek-ai/dsh-sandbox-windows-acl@0.2.1-rc.2（MIT），并在其上实现对话目录、自检、超时、输出预算和界面状态。没有复制整套 DSH 应用。

~~~text
React 工作区 → TypeScript Agent → run_command
                                  ↓
             WindowsNativeSandbox（可信控制端）
                 ├─ 验证目录归属、真实路径和权限
                 ├─ 逐对话成果 SID / 逐命令临时 SID
                 └─ 独立 DSH runner（Job，结束清理整个进程树）
                         ↓
                  Low 完整性受限令牌
                         ↓
                  Windows PowerShell 5.1
                         ├─ inputs：读，拒绝写入
                         ├─ outputs：可写
                         └─ 私有 temp：可写，结束撤销并清理
~~~

命令工具会告知模型 Windows PowerShell 语法和绝对资料路径，避免照搬 Docker 的 Linux 路径。只调用已安装工具，不预设 Python 或文档排版库存在；这些任务仍需后续单独接入。

## 权限和清理

可信服务只为当前用户拥有、无符号链接/目录联接的成果及私有临时目录补齐所有者 WRITE_OWNER，再由官方组件设置 capability allow ACE、目录删除限制和 Low 完整性标签。这不提权，不修改整个项目、用户主目录或磁盘权限。成果目录的授权和标签作为跨命令复用缓存保留；临时目录的授权在命令结束后撤销。

运行环境采用变量白名单，不继承模型 Key、代理、NODE_OPTIONS、NODE_PATH 或用户 PowerShell 模块路径；PowerShell 使用 NoProfile。每条命令默认最多 60 秒，stdout/stderr 总计最多 128000 字节。正常结束、主动停止、超时和输出超限均通过 kill-on-close Job 清理子孙进程，随后撤销临时授权、删除私有临时目录。初始化、真实探针或清理出错会报告失败，不假装执行成功。

界面的「重新检查环境」真实执行：读取自建输入、写入成果、写入私有临时目录、尝试覆盖输入与外部 canary；还核对原文件内容和临时目录清理。成功才报告 isolation_tested=true，该字段只证明列出的写入检查。

## 必须保留的边界说明

- 主要限制 ACL 可寻址的写入/删除。读取、联网和进程可见性没有完整隔离，可能读取宿主用户原本可读的文件。系统提示要求只处理用户导入资料，但不构成安全隔离。
- 没有 CPU、内存、磁盘硬配额，60 秒命令时限不等于资源配额。不能作为不可信公网多租户执行服务。
- 官方文档说明硬链接是同一文件对象的别名，构成写入边界限制。Low 标签会持久保留；其他同用户 Low 完整性进程可能访问 Low 标记的成果目录。
- 其他 AppContainer 工具设置了 package SID ACL 的文件可能无法被该后端读取，不应通过大范围改权限绕过。
- 子进程不继承凭据环境变量，不代表能抵御一切凭据读取；本地文件和系统用户权限仍是边界。模型接口继续遵循原来的显式授权。
- 无完整桌面 GUI/浏览器自动化，也没有因此自动补齐 PDF/DOCX 解析、专业简历排版或职业业务特化。

## 验收证据

运行环境：Windows，Node.js v22.17.0。日志统一放 logs/windows-native-sandbox-20261022/。

| 验证 | 结果 | 证据文件 |
| --- | --- | --- |
| Agent / 测试类型检查、Web 类型检查 | 通过 | 本轮检查终端与构建记录 |
| Windows 原生专项 | 11 通过，0 失败 | native-tests.log |
| Agent 完整测试（包含原生专项） | 66 通过，1 跳过，共 67 | agent-tests.log |
| Web 测试 | 200 通过，34 文件通过 | web-tests.log |
| 两端生产构建 | 通过 | build.log |
| Chrome 独立账号流程 | 读取测试 CSV → 受限 PowerShell → 登记成果 → 预览一致 | browser-flow.png、browser-csv-preview.png、browser-verification.json |
| Docker 容器实测 | 当前无 Docker，跳过 | agent-tests.log |
| 真实模型/真实供应商 | 本轮未调用 | 浏览器使用 fixture-only 本地脚本，未使用正式 API Key |

原生专项实际覆盖输入覆盖/删除拒绝、外部写入拒绝、其他已授权对话写入拒绝、中文输出和非零退出码、凭据变量过滤、取消时子孙进程清理、正常结束后台进程清理、超时/输出超限、目录联接拒绝和提前取消。

浏览器测试在独立 8111 服务、native_ui_test 假账号和独立 browser-data 下运行，正式账号配置未用来请求模型。4 条测试岗位统计为前端 2、后端 1、测试 1，成果是实际磁盘 CSV，不是只展示模型文案。测试环境的模型能力标志由夹具设置，不代表第三方模型已通过测试。

## 依赖与来源

- 官方代码：https://github.com/deepseek-ai/deepseek-harness
- 本轮核实的源码提交：687f282e8625c6b8d11ff58211a90524be2e4317。
- 固定组件版本：@deepseek-ai/dsh-sandbox-windows-acl@0.2.1-rc.2。说明与 MIT 许可副本在本轮 logs 的 references/；以安装包原许可证为准。
- 本机 Node.js 22.17.0 已通过实际使用的 ACL/runner 路径；自动 peer 链中的 undici 8.11.2 要求 Node.js 22.19.0 以上，安装时仍有引擎警告。新环境建议 Node.js 22.19.0 以上；本轮没有升级用户系统 Node，也没有验证未使用的 HTTP 代理模块。

scripts/dev/agent-foundation-preflight.mjs 只检查默认/进程环境指定后端的安装前提，不读取 .env 或凭据，不授予 ACL、不启动隔离任务；它的成功不能替代页面的真实环境自检。全量回归入口 scripts/verify/verify-agent.ps1 在 Windows 自动包含原生实测，Docker 仍需显式 -WithDocker。
