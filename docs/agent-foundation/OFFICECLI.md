# Office 文档工具

OfficeCLI 已接入通用工具注册表，工具名为 `office_document`。本机同时保留独立 CLI，可由开发者直接制作比赛材料。视频工程不依赖此工具。

## 本机安装

在项目根目录执行：

```powershell
npm run office:setup
```

安装入口固定为 OfficeCLI **1.0.161**，优先官方镜像、GitHub 回退；下载必须与脚本中固定的 SHA256 一致。不会执行远程安装脚本，也不会向其他 Agent 目录写入 skills。

Windows 默认位置：`%LOCALAPPDATA%\OfficeCLI\officecli.exe`。安装器追加用户 PATH，新终端可执行 `officecli --version`。Agent 会直接识别这个位置，不依赖旧终端继承的 PATH。也可通过可信服务配置 `AGENT_OFFICECLI_PATH` 指定绝对路径。

Linux 安装入口支持 glibc 系统 x64/arm64，默认 `~/.local/bin/officecli`；此入口未安装系统库，也不自动构建 Docker 镜像。Alpine 请使用上游单独的 Alpine 发行版。本次只完成 Windows 实机验证。

## 在穗奈中使用

将真实材料导入对话，然后发送例如：

> 根据这些已经核实的比赛材料，制作一份 Word 项目说明书、一张 Excel 准备计划表和一份 PPT 答辩稿。缺少的事实留空或问我，不编造数据。生成文件，并附上可预览的版本。

工具支持：

- 创建 DOCX / XLSX / PPTX；为已有文档批量添加、修改、删除节点。
- 常用文字、表格、幻灯片和图形排版；参数使用对应格式的 OfficeCLI schema，先 `help` 查询。
- 正文/提纲/统计读取、节点查看、查询、OpenXML 结构校验。
- 生成 HTML 预览，在现有文件侧栏中打开；原文件通过现有成果链接下载或在本机打开。

结构化入口有意只开放常用内容与排版属性，不接受外部文件地址、插件或任意脚本。完整 OfficeCLI 高级能力可由本机操作者直接使用；不能把上游支持的所有能力视为此工具已经适配。

### 参数示例

```json
{
  "operation": "create",
  "path": "outputs/项目说明书.docx",
  "actions": [
    {
      "command": "add",
      "parent": "/body",
      "type": "paragraph",
      "props": {"text": "项目说明书", "style": "Heading1", "font": "微软雅黑"}
    }
  ]
}
```

`create` 拒绝覆盖已有文件；已有文件用 `edit`。每次最多 120 项操作、512 KB 批处理数据，失败不发布为成功成果。未指定 add.parent 时使用文档根节点 `/`；Word 正文段落应明确指定 `/body`。批处理使用上游默认的原子回滚并在首项失败时停止；新建文件与之后的批处理是两步，批处理失败可能留下未登记的空文件，应读取错误再修复，不盲目重试 create。

其他调用：

```json
{"operation":"help","format":"docx","topic":"add","element":"paragraph"}
{"operation":"read","path":"outputs/项目说明书.docx","mode":"outline"}
{"operation":"validate","path":"outputs/项目说明书.docx"}
{"operation":"preview","path":"outputs/项目说明书.docx"}
```

## 直接制作比赛文件

新 PowerShell 终端：

```powershell
officecli --version
$env:OFFICECLI_NO_AUTO_RESIDENT = '1'
officecli create '项目说明书.docx'
officecli add '项目说明书.docx' /body --type paragraph --prop 'text=项目说明书' --prop 'style=Heading1'
officecli view '项目说明书.docx' html --out '项目说明书.preview.html'
officecli validate '项目说明书.docx'
```

此版本的 HTML 命令是 `view <file> html --out <file>`。不要套用旧版的 `officecli html ... --output ...`。独立 CLI 默认可能启动后台驻留，若使用驻留模式，外部程序读取前需 `save` / `close`；Agent 入口禁用自动驻留，避免沙箱退出杀死尚未保存的后台进程。

## 执行与交付边界

- 工具沿用本轮选择的沙箱；不可用时不会降级到宿主终端。默认 Windows 使用已有写入受限沙箱，读取与联网未完整隔离。
- 输出仅限当前会话的 `outputs/`，`inputs/` 只读；不会直接修改绑定项目。参数通过 JSON 批处理文件传入，不拼接为 shell 代码。
- 成功的创建、编辑、预览均生成不可变成果版本与真实 artifact 链接。当前项目的成果上限仍为 **1 MB/文件**、每会话版本累计 **64 MB**；超限不会登记成果。
- HTML 是近似预览，结构校验也不等于版面验收。最终答辩稿应在 Word / Excel / PowerPoint 或 WPS 检查字体、分页和溢出。未验证 PDF 导出、原生 Office 渲染或截图插件。
- 简历任务和局部改写仍走已有事实核对及预览交付流程；不借此工具绕过确认。职业、学习和自由对话可使用文档工具，训练作答任务不可使用。
- 云端禁用命令时，该工具既不出现在模型列表中，执行入口也拒绝调用。未来启用 Docker 时必须在镜像内预装 Linux OfficeCLI；本机安装不能使云端自动可用。
- 本次没有将 OfficeCLI 二进制加入 Windows 安装包，也未发布云端版本。

## 验证

```powershell
npm run office:verify
```

使用隔离测试账号、独立 SQLite 和 Windows 原生沙箱，真实生成中文 Word、Excel、PPT，读取正文、检查结构、登记成果、导出 HTML。不会调用 LLM 或访问真实用户数据库。可查看 `logs/officecli/latest/` 的文件及 `verification.json`。

注册表、参数注入、输出流、错误退出码、沙箱失败关闭和云端/简历策略回归：`agent/test/office-cli.test.ts`。

上游来源：[OfficeCLI 仓库](https://github.com/iOfficeAI/OfficeCLI)、[固定发行版 v1.0.161](https://github.com/iOfficeAI/OfficeCLI/releases/tag/v1.0.161)。
