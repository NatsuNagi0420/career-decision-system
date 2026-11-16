/** Office 文档适配：结构化批处理进入现有沙箱，文件留在会话资料区。 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join } from "node:path";
import { invariant } from "../errors.js";
import { safeRelative } from "../files.js";
import type { ToolSpec } from "./tool-registry.js";
import type { CoreToolContext } from "./tools.js";

// 只接收排版/内容属性；不接收任意源文件、远端资源、插件或脚本参数。
const properties = z.partialRecord(z.enum([
  "text", "value", "formula", "name", "style", "font", "fontSize", "size", "bold", "italic", "underline",
  "color", "fill", "background", "alignment", "align", "valign", "verticalAlignment", "wrapText",
  "x", "y", "width", "height", "rotation", "opacity", "line", "lineColor", "lineWidth",
  "geometry", "preset", "layout", "title", "subject", "description", "author",
  "rows", "cols", "columns", "rowHeight", "columnWidth", "numberFormat", "format",
  "border", "borderColor", "borderWidth", "margin", "marginTop", "marginBottom", "marginLeft", "marginRight",
  "spacing", "spaceBefore", "spaceAfter", "lineSpacing", "indent", "firstLineIndent", "hangingIndent",
  "pageWidth", "pageHeight", "orientation", "keepNext", "keepLines", "pageBreakBefore",
  "bullet", "numbering", "level", "type", "chartType", "categories", "series", "data",
  "font.size", "font.color", "font.bold", "font.italic", "font.name", "font.ea", "font.latin",
  "listStyle", "lineRule", "highlight", "strike", "shading", "animation", "shape", "radius",
  "paperSize", "pageSize", "headerDistance", "footerDistance", "autofit", "merge", "freeze",
]), z.union([z.string().max(16_000), z.number().finite(), z.boolean()]));
const nodePath = z.string().min(1).max(500).startsWith("/");
const action = z.object({
  command: z.enum(["add", "set", "remove"]),
  path: nodePath.optional(),
  parent: nodePath.optional(),
  type: z.enum(["paragraph", "run", "table", "table-row", "table-cell", "table-column", "row", "cell", "sheet", "slide", "shape", "textbox", "notes", "chart", "header", "footer", "section", "style", "pagebreak", "field"]).optional(),
  props: properties.optional(),
}).strict();
export const officeSchema = z.object({
  operation: z.enum(["help", "create", "edit", "read", "inspect", "query", "validate", "preview"]),
  path: z.string().min(1).max(240).optional(),
  format: z.enum(["docx", "xlsx", "pptx"]).optional(),
  topic: z.enum(["add", "set", "get", "query", "view", "create", "batch"]).optional(),
  element: z.string().regex(/^[a-zA-Z][a-zA-Z0-9-]{0,39}$/).optional(),
  actions: z.array(action).min(1).max(120).optional(),
  mode: z.enum(["text", "outline", "stats"]).optional(),
  target: nodePath.optional(),
  selector: z.string().min(1).max(500).optional(),
}).strict();
type OfficeInput = z.infer<typeof officeSchema>;

export const officeToolSpec: ToolSpec<CoreToolContext> = {
  name: "office_document",
  effect: "command",
  schema: officeSchema,
  description: "通过当前沙箱制作和检查 Word(.docx)、Excel(.xlsx)、PowerPoint(.pptx)。先 operation=help、format=docx/xlsx/pptx、topic=add/set 查看语法，element 可查具体元素；工具仅接受常用内容与排版属性，不接收外部资源。create 在 outputs/ 新建（不覆盖），edit 用 actions 批量 add/set/remove：parent/path 是文档内部节点，props 是属性字典。成功后自动登记真实文件及 artifact 链接。read 读 text/outline/stats，inspect 读 target 节点，query 按 selector 查询，validate 检查结构，preview 生成并登记 HTML 侧栏预览（不是 Office 原生排版或 PDF）。inputs/ 仅可读取；不能绕过当前任务的确认或命令权限。未安装/沙箱不可用时不降级宿主执行。",
  execute: async (args, context) => executeOffice(officeSchema.parse(args), context),
};

export function quoteOfficeArgument(value: string, windows: boolean) {
  invariant(!value.includes("\0"), 400, "参数不能含空字符。");
  return windows ? "'" + value.replaceAll("'", "''") + "'" : "'" + value.replaceAll("'", "'\"'\"'") + "'";
}

async function localExecutable() {
  const configured = process.env.AGENT_OFFICECLI_PATH;
  if (configured) {
    invariant(isAbsolute(configured), 503, "AGENT_OFFICECLI_PATH 必须为可信 OfficeCLI 可执行文件的绝对路径。", "officecli_configuration");
    return configured;
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const installed = join(process.env.LOCALAPPDATA, "OfficeCLI", "officecli.exe");
    try { await access(installed); return installed; } catch { /* 允许已在系统 PATH 安装的官方 CLI。 */ }
  }
  return "officecli";
}

async function executeOffice(input: OfficeInput, context: CoreToolContext) {
  const { sandbox, workspace, run, signal, onOutput } = context;
  signal.throwIfAborted();
  const writing = input.operation === "create" || input.operation === "edit";
  invariant(!input.actions || writing, 400, "actions 只适用于 create/edit。");
  invariant(input.operation !== "edit" || input.actions?.length, 400, "edit 需要至少一项 actions。");
  for (const step of input.actions ?? []) {
    invariant(step.command !== "add" || step.type, 400, "add 需要 type。");
    invariant(step.command === "add" || step.path, 400, "set/remove 需要文档节点 path。");
    invariant(step.command !== "set" || Object.keys(step.props ?? {}).length, 400, "set 需要 props。");
  }
  let relativePath: string | undefined;
  let absolutePath: string | undefined;
  if (input.operation !== "help") {
    invariant(input.path, 400, "此操作需要会话文件 path。");
    relativePath = safeRelative(input.path, writing);
    invariant(/\.(docx|xlsx|pptx)$/i.test(relativePath), 400, "只支持 DOCX、XLSX、PPTX 文档。");
    absolutePath = await workspace.checked(run.conversation_id, relativePath, writing);
  }
  const health = await sandbox.health();
  invariant(health.available, 503, health.message, "sandbox_unavailable");
  const docker = health.provider === "docker";
  const windows = !docker && process.platform === "win32";
  const root = await workspace.root(run.conversation_id);
  const executable = docker ? "officecli" : await localExecutable();
  const quote = (value: string) => quoteOfficeArgument(value, windows);
  const mapped = (relative: string, absolute: string) => docker ? "/workspace/" + relative : absolute;
  const document = relativePath && absolutePath ? mapped(relativePath, absolutePath) : "";
  const commands: string[][] = [];
  let batchFile: string | undefined;
  let previewPath: string | undefined;
  try {
    if (writing) await mkdir(dirname(absolutePath!), { recursive: true });
    switch (input.operation) {
      case "help": commands.push(["help", input.format ?? "docx", ...(input.topic ? [input.topic] : []), ...(input.element ? [input.element] : [])]); break;
      case "create": commands.push(["create", document, "--json"]); break;
      case "read": commands.push(["view", document, input.mode ?? "text", "--max-lines", "80", "--json"]); break;
      case "inspect": commands.push(["get", document, input.target ?? "/", "--json"]); break;
      case "query":
        invariant(input.selector, 400, "query 需要 selector。");
        commands.push(["query", document, input.selector, "--json"]); break;
      case "validate": commands.push(["validate", document, "--json"]); break;
      case "preview": {
        previewPath = "outputs/" + basename(relativePath!).replace(/\.(docx|xlsx|pptx)$/i, ".preview.html");
        const preview = await workspace.checked(run.conversation_id, previewPath, true);
        commands.push(["view", document, "html", "--out", mapped(previewPath, preview)]);
        break;
      }
    }
    if (input.actions?.length) {
      const batchPath = "outputs/.officecli-" + randomUUID() + ".json";
      batchFile = await workspace.checked(run.conversation_id, batchPath, true);
      const payload = JSON.stringify(input.actions.map(step => ({ ...step,
        ...(step.command === "add" ? { parent: step.parent ?? "/" } : {}),
        ...(step.props ? { props: Object.fromEntries(Object.entries(step.props).map(([key, value]) => [key, String(value)])) } : {}),
      })));
      invariant(Buffer.byteLength(payload) <= 512_000, 400, "单次文档批处理不能超过 512 KB，请分段制作。");
      await writeFile(batchFile, payload, { flag: "wx" });
      commands.push(["batch", document, "--input", mapped(batchPath, batchFile), "--stop-on-error", "--json"]);
    }
    // 禁用自动后台驻留，确保每次沙箱退出前真实落盘；不能依赖闲置自动保存。
    const prefix = windows ? "$env:OFFICECLI_NO_AUTO_RESIDENT = '1'" : "export OFFICECLI_NO_AUTO_RESIDENT=1";
    const lines = commands.map(args => {
      const command = (windows ? "& " : "") + [executable, ...args].map(quote).join(" ");
      return windows ? command + "\nif ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }" : command + " || exit $?";
    });
    const result = await sandbox.execute([prefix, ...lines].join("\n"), root, signal, {
      sessionRoot: root, projectRoot: null, workspaceAccess: null, onOutput,
    });
    signal.throwIfAborted();
    if (result.exit_code !== 0) return { value: { success: false, path: relativePath, ...result,
      hint: /not found|not recognized|CommandNotFound|无法将.*识别/i.test(result.stderr)
        ? "OfficeCLI 未安装到当前执行环境。本机运行 npm run office:setup；Docker 需要镜像内预装，不能回退到宿主机。"
        : "操作未成功，未登记成果。根据错误检查节点与属性；create 不会覆盖已有文件。",
    } };
    if (writing || previewPath) {
      const artifact = await workspace.publish(run.conversation_id, run.id, previewPath ?? relativePath!);
      return { value: { success: true, path: relativePath, artifact, link: "artifact:" + artifact.id,
        ...result, ...(previewPath ? { preview_path: previewPath, preview_note: "HTML 近似预览；最终 Office 排版需在 Office 软件检查。" } : {}),
      }, artifact };
    }
    return { value: { success: true, path: relativePath, ...result } };
  } finally {
    if (batchFile) await rm(batchFile, { force: true });
  }
}
