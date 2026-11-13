/** 青穗集 · 受限资料区与不可变成果版本：只接收用户导入，不读取任意本机路径。 */
import { constants } from "node:fs";
import {
  mkdir,
  lstat,
  readdir,
  readFile,
  writeFile,
  rename,
  open,
  realpath,
  rm,
} from "node:fs/promises";
import { basename, extname, join, resolve, relative, sep, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import { Store, id, now } from "./store.js";
import { AppError, invariant } from "./errors.js";
import { describePreview } from "./artifact-preview.js";
import { extractDocumentText, isTextDocument } from "./document-text.js";
import type { Artifact, ProjectEdit, WorkspaceAccess, WorkspaceContext } from "./types.js";
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_BINARY_FILE_BYTES = 4 * MAX_FILE_BYTES;
export const SUPPORTED_INPUT_EXTENSIONS = [
  ".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".java", ".py", ".go", ".rs", ".cs",
  ".c", ".h", ".cpp", ".hpp", ".kt", ".kts", ".dart", ".php", ".rb", ".swift", ".proto", ".csproj",
  ".vue", ".svelte", ".html", ".css", ".scss", ".sass", ".less", ".sql", ".sh", ".ps1",
  ".xml", ".gradle", ".properties", ".toml", ".ini", ".conf", ".graphql", ".gql",
  ".pdf", ".docx",
  ".png", ".jpg", ".jpeg", ".gif", ".webp",
] as const;
const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const SAFE_EXTENSIONLESS_NAMES = new Set(["readme", "license", "dockerfile", ".gitignore", ".dockerignore"]);
const SECRET_NAME = /(^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|.*\.(?:pem|key|p12|pfx|jks|keystore))$/i;
export function inputMime(name: string): string | null {
  return IMAGE_MIME[extname(name).toLowerCase()] ?? null;
}
export function isSensitiveInputPath(name: string): boolean {
  return SECRET_NAME.test(name.replace(/\\/g, "/"));
}
export function isSupportedInputPath(name: string): boolean {
  const leaf = basename(name).toLowerCase();
  return !isSensitiveInputPath(name) &&
    (SUPPORTED_INPUT_EXTENSIONS.includes(extname(leaf).toLowerCase() as (typeof SUPPORTED_INPUT_EXTENSIONS)[number]) ||
      SAFE_EXTENSIONLESS_NAMES.has(leaf));
}
const pathKey = (value: string) =>
  process.platform === "win32"
    ? value.replace(/\\/g, "/").toLowerCase()
    : value.replace(/\\/g, "/");
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
const PROJECT_SKIP_DIRECTORIES = new Set([".git", ".hg", ".svn", "node_modules", "dist", "build", "coverage", ".next", ".nuxt", ".venv", "venv", "target"]);
const PROJECT_SCAN_MAX_DEPTH = 20;
const PROJECT_SCAN_MAX_FILES = 12_000;
const PROJECT_SCAN_MAX_ENTRIES = 60_000;
const PROJECT_INSPECT_MAX_FILES = 24;
const PROJECT_INSPECT_FILE_CHARS = 4_000;
const PROJECT_INSPECT_TOTAL_CHARS = 36_000;
const PROJECT_MANIFEST_NAMES = new Set([
  "package.json", "pnpm-workspace.yaml", "yarn.lock", "package-lock.json",
  "pyproject.toml", "requirements.txt", "go.mod", "cargo.toml", "pom.xml",
  "build.gradle", "build.gradle.kts", "composer.json", "gemfile", "mix.exs",
  "docker-compose.yml", "docker-compose.yaml", "makefile", "readme", "readme.md",
  "readme.mdx", "license", "tsconfig.json", "vite.config.ts", "next.config.js",
  "next.config.mjs", "nuxt.config.ts",
]);
const PROJECT_ENTRY_NAMES = new Set([
  "main.ts", "main.tsx", "main.js", "main.jsx", "index.ts", "index.tsx", "index.js",
  "index.jsx", "app.ts", "app.tsx", "app.js", "app.jsx", "server.ts", "server.js",
  "cli.ts", "cli.js", "manage.py", "__main__.py",
]);

export interface ProjectScan {
  files: Array<{ path: string; bytes: number }>;
  scanned_files: number;
  scanned_directories: number;
  skipped_directories: number;
  skipped_files: number;
  max_depth: number;
  truncated: boolean;
  /** 本次结果是否来自进程内的短期索引缓存。 */
  cache_hit?: boolean;
  /** 建立或复用索引所耗时间，供执行记录展示进度感。 */
  duration_ms?: number;
}

type ProjectCandidate = { path: string; bytes: number; score: number; reason: string };
export interface ProjectPatchOperation {
  path: string;
  operation: "create" | "update";
  content: string;
  expected_sha256: string | null;
}
function compactLineDiff(before: string, after: string) {
  const left = before.split(/\r?\n/);
  const right = after.split(/\r?\n/);
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let leftEnd = left.length - 1;
  let rightEnd = right.length - 1;
  while (leftEnd >= start && rightEnd >= start && left[leftEnd] === right[rightEnd]) { leftEnd--; rightEnd--; }
  const removed = left.slice(start, leftEnd + 1).map(line => "-" + line);
  const added = right.slice(start, rightEnd + 1).map(line => "+" + line);
  const text = [...removed, ...added].join("\n");
  return text.length > 12000 ? text.slice(0, 12000) + "\n…（diff 已截断）" : text;
}
export function safeRelative(value: string, writable = false): string {
  invariant(
    typeof value === "string" && value.length > 0 && value.length <= 240,
    400,
    "文件路径不合法。",
  );
  const path = value.replace(/\\/g, "/");
  invariant(
    !path.startsWith("/") && !/[\u0000-\u001f:]/.test(path),
    400,
    "只允许资料区内的相对路径。",
  );
  const parts = path.split("/");
  invariant(
    parts.every(
      (part) =>
        part &&
        part !== "." &&
        part !== ".." &&
        !/[. ]$/.test(part) &&
        !/[<>"|?*]/.test(part) &&
        !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part),
    ),
    400,
    "文件路径含有不允许的目录或名称。",
  );
  invariant(
    parts[0] === "inputs" || parts[0] === "outputs",
    400,
    "只允许访问 inputs 或 outputs 目录。",
  );
  if (writable)
    invariant(
      parts[0] === "outputs" && parts.length > 1,
      403,
      "只能在 outputs 中创建或修改成果，不能覆盖导入资料。",
    );
  return parts.join("/");
}
/** 项目工作区使用独立命名空间，只接受项目根下的相对路径。 */
export function safeProjectRelative(value: string): string {
  invariant(typeof value === "string" && value.length > 0 && value.length <= 240, 400, "项目文件路径不合法。", "workspace_path");
  const path = value.replace(/\\/g, "/");
  invariant(!path.startsWith("/") && !/[\u0000-\u001f:]/.test(path), 400, "只允许项目工作区内的相对路径。", "workspace_path");
  const parts = path.split("/");
  invariant(parts.every(part => part && part !== "." && part !== ".." && !/[. ]$/.test(part) && !/[<>"|?*]/.test(part) && !/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(part)), 400, "项目文件路径含有不允许的目录或名称。", "workspace_path");
  return parts.join("/");
}
export class Workspace {
  readonly workspaces: string;
  readonly snapshots: string;
  private readonly operations = new Map<string, number>();
  private readonly projectScanCache = new Map<string, { expiresAt: number; scan: ProjectScan }>();
  constructor(
    private store: Store,
    readonly dataDir: string,
  ) {
    this.workspaces = join(dataDir, "workspaces");
    this.snapshots = join(dataDir, "artifacts");
  }
  async withFiles<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
    this.store.assertAvailable(conversationId);
    this.operations.set(conversationId, (this.operations.get(conversationId) ?? 0) + 1);
    try { return await task(); }
    finally {
      const remaining = (this.operations.get(conversationId) ?? 1) - 1;
      if (remaining) this.operations.set(conversationId, remaining);
      else this.operations.delete(conversationId);
    }
  }
  assertIdle(conversationId: string) {
    invariant(!this.operations.has(conversationId), 409, "这段对话还有文件正在处理，请稍后再删除。");
  }
  async removeConversation(conversationId: string, artifacts: Artifact[], edits: ProjectEdit[] = []) {
    this.assertIdle(conversationId);
    invariant(/^[a-f0-9-]{36}$/i.test(conversationId), 400, "对话标识不合法。");
    const base = resolve(this.dataDir);
    invariant(pathKey(await realpath(base)) === pathKey(base), 409, "资料根目录发生重定向，已停止删除。");
    const targets = [join(base, "workspaces", conversationId)];
    for (const artifact of artifacts) {
      invariant(artifact.conversation_id === conversationId && /^[a-f0-9-]{36}$/i.test(artifact.id), 409, "文件归属异常，已停止删除。");
      targets.push(join(base, "artifacts", artifact.id), join(base, "local-open", artifact.id));
    }
    for (const edit of edits) {
      invariant(edit.conversation_id === conversationId && /^[a-f0-9-]{36}$/i.test(edit.id), 409, "项目修改记录归属异常，已停止删除。");
      targets.push(join(base, "project-edits", edit.id));
    }
    const checked: { path: string; parent: string; canonicalParent: string }[] = [];
    const inspect = async (target: string): Promise<void> => {
      const stat = await lstat(target);
      invariant(!stat.isSymbolicLink(), 409, "资料中存在符号链接或目录联接，已停止删除。请先移除链接后重试。");
      invariant(pathKey(await realpath(target)) === pathKey(resolve(target)), 409, "资料位置发生重定向，已停止删除。");
      if (stat.isDirectory()) for (const entry of await readdir(target)) await inspect(join(target, entry));
    };
    // 递归删除前逐项核实绝对目标、父目录与整个目录树；不跟随链接，不接受任意本机路径。
    for (const target of targets) {
      const rel = relative(base, resolve(target));
      invariant(rel && !rel.startsWith(".." + sep) && rel !== ".." && !resolve(target).startsWith(base + sep + ".."), 403, "删除位置超出资料目录。");
      try {
        const parent = resolve(target, "..");
        const parentStat = await lstat(parent);
        invariant(parentStat.isDirectory() && !parentStat.isSymbolicLink(), 409, "资料目录中存在链接或目录联接，已停止删除。");
        // Windows 打包应用会虚拟化 AppData：非链接的管理目录也可能拥有不同的实际路径。
        // 仅信任已核实的直接管理目录，以其实际位置为边界，再核实整个子树。
        const canonicalParent = await realpath(parent);
        const canonicalTarget = join(canonicalParent, basename(target));
        invariant(pathKey(await realpath(target)) === pathKey(canonicalTarget), 409, "资料位置发生重定向，已停止删除。");
        await inspect(canonicalTarget);
        checked.push({ path: canonicalTarget, parent, canonicalParent });
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    try {
      for (const target of checked) {
        const parentStat = await lstat(target.parent);
        invariant(!parentStat.isSymbolicLink() && pathKey(await realpath(target.parent)) === pathKey(target.canonicalParent), 409, "资料位置已变化，已停止删除。");
        await rm(target.path, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      }
    } catch {
      throw new AppError(409, "文件清理尚未完成，对话条目暂时保留。部分文件可能已清理；请关闭占用文件的应用后重新删除。");
    }
  }
  async root(conversationId: string) {
    this.store.assertAvailable(conversationId);
    invariant(/^[a-f0-9-]{36}$/i.test(conversationId), 400, "对话标识不合法。");
    const root = join(this.workspaces, conversationId);
    await mkdir(join(root, "inputs"), { recursive: true });
    await mkdir(join(root, "outputs"), { recursive: true });
    return root;
  }
  /** 验证用户选择的真实目录；目录联接、符号链接和 Agent 自身数据目录全部拒绝。 */
  async inspectExternalRoot(rootPath: string) {
    invariant(typeof rootPath === "string" && rootPath.length > 0 && rootPath.length <= 1000, 400, "项目工作区路径不合法。", "workspace_path");
    const resolvedRoot = resolve(rootPath);
    const dataRoot = resolve(this.dataDir);
    await mkdir(dataRoot, { recursive: true });
    const dataCanonical = await realpath(dataRoot);
    let info: Awaited<ReturnType<typeof lstat>>;
    try { info = await lstat(resolvedRoot); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AppError(400, "项目文件夹不存在，可能已经被移动或删除。", "workspace_missing");
      throw error;
    }
    invariant(info.isDirectory() && !info.isSymbolicLink(), 400, "请选择一个真实的项目文件夹。", "workspace_directory");
    const canonicalPath = await realpath(resolvedRoot);
    invariant(pathKey(canonicalPath) === pathKey(resolvedRoot), 400, "项目文件夹不能是符号链接或目录联接。", "workspace_redirect");
    const isWithin = (root: string, target: string) => {
      const delta = relative(root, target);
      return delta === "" || (!isAbsolute(delta) && delta !== ".." && !delta.startsWith(".." + sep));
    };
    const insideData = isWithin(dataCanonical, canonicalPath);
    const dataInsideProject = isWithin(canonicalPath, dataCanonical);
    invariant(!insideData && !dataInsideProject, 403, "不能把 Agent 自身数据目录或其上级目录注册为项目工作区。", "workspace_internal");
    await readdir(canonicalPath);
    return { name: basename(canonicalPath) || canonicalPath, root_path: resolvedRoot, canonical_path: canonicalPath };
  }
  async projectContext(conversationId: string): Promise<WorkspaceContext> {
    const conversation = this.store.conversationById(conversationId);
    const sessionRoot = await this.root(conversationId);
    if (!conversation.workspace_id)
      return { sessionRoot, projectRoot: null, projectId: null, projectName: null, projectAccess: null, commandRoot: sessionRoot };
    const registration = this.store.localWorkspace(conversation.user_id, conversation.workspace_id);
    let inspected: Awaited<ReturnType<Workspace["inspectExternalRoot"]>>;
    try { inspected = await this.inspectExternalRoot(registration.root_path); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error instanceof AppError && error.code === "workspace_missing")) throw new AppError(409, "项目工作区已经被移动或删除，请重新选择该文件夹。", "workspace_moved");
      throw error;
    }
    invariant(pathKey(inspected.canonical_path) === pathKey(registration.canonical_path), 409, "项目工作区的位置已经变化，请重新选择该文件夹。", "workspace_moved");
    const access: WorkspaceAccess = conversation.workspace_access ?? "read-only";
    return { sessionRoot, projectRoot: inspected.canonical_path, projectId: registration.id, projectName: registration.name, projectAccess: access, commandRoot: inspected.canonical_path };
  }
  async projectRoot(conversationId: string) {
    const context = await this.projectContext(conversationId);
    invariant(context.projectRoot, 409, "当前对话还没有绑定本机项目工作区。", "workspace_unbound");
    return context.projectRoot;
  }
  /**
   * 递归建立项目索引。索引只包含工作区内的普通文件元数据，不读取文件正文；
   * 忽略目录、密钥文件、符号链接和超出保护上限的内容。
   */
  async scanProject(conversationId: string, force = false): Promise<ProjectScan> {
    const root = await this.projectRoot(conversationId);
    const cacheKey = pathKey(root);
    const cached = this.projectScanCache.get(cacheKey);
    if (!force && cached && cached.expiresAt > Date.now()) {
      return { ...cached.scan, cache_hit: true, duration_ms: 0 };
    }
    const started = Date.now();
    const files: Array<{ path: string; bytes: number }> = [];
    let scannedDirectories = 0;
    let skippedDirectories = 0;
    let skippedFiles = 0;
    let visitedEntries = 0;
    let maxDepth = 0;
    let truncated = false;
    const visit = async (dir: string, depth: number): Promise<void> => {
      if (depth > PROJECT_SCAN_MAX_DEPTH) {
        truncated = true;
        return;
      }
      if (visitedEntries >= PROJECT_SCAN_MAX_ENTRIES || files.length >= PROJECT_SCAN_MAX_FILES) {
        truncated = true;
        return;
      }
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        skippedDirectories++;
        return;
      }
      scannedDirectories++;
      maxDepth = Math.max(maxDepth, depth);
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (visitedEntries >= PROJECT_SCAN_MAX_ENTRIES || files.length >= PROJECT_SCAN_MAX_FILES) {
          truncated = true;
          return;
        }
        visitedEntries++;
        const lowerName = entry.name.toLowerCase();
        if (PROJECT_SKIP_DIRECTORIES.has(lowerName) && entry.isDirectory()) {
          skippedDirectories++;
          continue;
        }
        const next = join(dir, entry.name);
        let info;
        try {
          info = await lstat(next);
        } catch {
          skippedFiles++;
          continue;
        }
        if (info.isSymbolicLink()) {
          skippedFiles++;
          continue;
        }
        if (info.isDirectory()) {
          if (PROJECT_SKIP_DIRECTORIES.has(lowerName)) skippedDirectories++;
          else await visit(next, depth + 1);
          continue;
        }
        if (!info.isFile()) {
          skippedFiles++;
          continue;
        }
        const path = relative(root, next).replace(/\\/g, "/");
        if (isSupportedInputPath(path)) files.push({ path, bytes: info.size });
        else skippedFiles++;
      }
    };
    await visit(root, 0);
    const scan: ProjectScan = {
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
      scanned_files: files.length,
      scanned_directories: scannedDirectories,
      skipped_directories: skippedDirectories,
      skipped_files: skippedFiles,
      max_depth: maxDepth,
      truncated,
      cache_hit: false,
      duration_ms: Date.now() - started,
    };
    // 同一轮会连续调用 inspect/list/search；短期缓存避免重复遍历大型项目。
    // TTL 很短，外部编辑不会被长期隐藏；结构化项目修改会主动清除缓存。
    this.projectScanCache.set(cacheKey, { expiresAt: Date.now() + 5000, scan });
    return scan;
  }

  /** 保留旧调用接口；需要完整扫描状态时使用 scanProject。 */
  async listProject(conversationId: string) {
    return (await this.scanProject(conversationId)).files;
  }

  /** 分页列出项目文件，避免大项目的首批结果被模型误认为完整清单。 */
  async listProjectPage(conversationId: string, prefix = "", cursor = 0, limit = 160) {
    const scan = await this.scanProject(conversationId);
    const normalizedPrefix = prefix ? safeProjectRelative(prefix) : "";
    const prefixKey = normalizedPrefix ? normalizedPrefix.toLowerCase().replace(/\\/g, "/") + "/" : "";
    const files = prefixKey
      ? scan.files.filter(file => file.path.toLowerCase().startsWith(prefixKey))
      : scan.files;
    const page = files.slice(cursor, cursor + limit);
    const nextCursor = cursor + page.length;
    return {
      prefix: normalizedPrefix,
      cursor,
      limit,
      files: page,
      total_files: files.length,
      has_more: nextCursor < files.length || scan.truncated,
      next_cursor: nextCursor < files.length ? nextCursor : null,
      scan: {
        scanned_files: scan.scanned_files,
        scanned_directories: scan.scanned_directories,
        skipped_directories: scan.skipped_directories,
        skipped_files: scan.skipped_files,
        max_depth: scan.max_depth,
        truncated: scan.truncated,
      },
    };
  }

  /**
   * 为“总结项目/写项目经历”提供一次可控的递归检查：返回目录统计、关键文件路径和有限正文摘录，
   * 让模型不必先从一个被截断的根目录清单里猜测项目结构。
   */
  async inspectProject(conversationId: string, focus = "") {
    const scan = await this.scanProject(conversationId);
    const textFiles = scan.files.filter(file => !inputMime(file.path) && file.bytes <= MAX_FILE_BYTES);
    const focusTerms = focus.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term => term.length >= 2);
    const extensionCounts = new Map<string, number>();
    const topLevelCounts = new Map<string, number>();
    for (const file of scan.files) {
      const extension = extname(file.path).toLowerCase() || "[无扩展名]";
      extensionCounts.set(extension, (extensionCounts.get(extension) ?? 0) + 1);
      const topLevel = file.path.split("/")[0] || ".";
      topLevelCounts.set(topLevel, (topLevelCounts.get(topLevel) ?? 0) + 1);
    }
    const candidates: ProjectCandidate[] = textFiles.map(file => {
      const normalized = file.path.toLowerCase();
      const leaf = basename(normalized);
      const depth = file.path.split("/").length - 1;
      let score = Math.max(0, 120 - depth * 4);
      const reasons: string[] = [];
      if (PROJECT_MANIFEST_NAMES.has(leaf)) { score += 900; reasons.push("项目清单"); }
      if (PROJECT_ENTRY_NAMES.has(leaf)) { score += 500; reasons.push("入口文件"); }
      if (leaf.startsWith("readme")) { score += 820; reasons.push("项目说明"); }
      if (/\/(?:src|app|lib|server|backend|frontend|packages?)\//.test("/" + normalized + "/")) {
        score += 160;
        reasons.push("核心源码目录");
      }
      if (/\/(?:docs?|design|architecture)\//.test("/" + normalized + "/")) {
        score += 120;
        reasons.push("项目文档");
      }
      for (const term of focusTerms) {
        if (normalized.includes(term)) { score += 180; reasons.push("命中任务关键词"); break; }
      }
      return { path: file.path, bytes: file.bytes, score, reason: reasons.join("、") || "源码样本" };
    }).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    const selected: ProjectCandidate[] = [];
    const selectedByTopLevel = new Map<string, number>();
    for (const candidate of candidates) {
      if (selected.length >= PROJECT_INSPECT_MAX_FILES) break;
      const topLevel = candidate.path.split("/")[0] || ".";
      const count = selectedByTopLevel.get(topLevel) ?? 0;
      if (count >= 6 && selected.length < PROJECT_INSPECT_MAX_FILES - 4) continue;
      selected.push(candidate);
      selectedByTopLevel.set(topLevel, count + 1);
    }
    let remainingCharacters = PROJECT_INSPECT_TOTAL_CHARS;
    const keyFiles: Array<{ path: string; bytes: number; reason: string; text: string }> = [];
    for (const candidate of selected) {
      if (remainingCharacters <= 0) break;
      try {
        const loaded = await this.readProject(conversationId, candidate.path, 0, Math.min(PROJECT_INSPECT_FILE_CHARS, remainingCharacters));
        const text = loaded.text.slice(0, remainingCharacters);
        if (!text.trim()) continue;
        keyFiles.push({ path: candidate.path, bytes: candidate.bytes, reason: candidate.reason, text });
        remainingCharacters -= text.length;
      } catch {
        // 某个文件在扫描后被删除或变得不可读时，保留其他项目证据。
      }
    }
    return {
      scan: {
        scanned_files: scan.scanned_files,
        scanned_directories: scan.scanned_directories,
        skipped_directories: scan.skipped_directories,
        skipped_files: scan.skipped_files,
        max_depth: scan.max_depth,
        truncated: scan.truncated,
      },
      focus,
      top_level_directories: [...topLevelCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 80)
        .map(([path, files]) => ({ path, files })),
      file_types: Object.fromEntries([...extensionCounts.entries()].sort((a, b) => b[1] - a[1])),
      key_files: keyFiles,
      note: scan.truncated
        ? "索引触及保护上限，scan.truncated=true；不要据此声称已覆盖全部文件，应按目录继续使用 list_project_files 分页读取。"
        : "索引已递归完成；key_files 是按项目说明、清单、入口和核心源码目录挑选的证据摘录，不代表未列出的文件不存在。",
    };
  }
  /** 加载项目工作区内分层的 AGENTS.md；内容只作为项目协作规则，不改变平台安全边界。 */
  async projectInstructions(conversationId: string) {
    const root = await this.projectRoot(conversationId);
    const found: Array<{ path: string; text: string; depth: number }> = [];
    const maxFiles = 24;
    const maxTotalCharacters = 48000;
    let totalCharacters = 0;
    const visit = async (directory: string, depth: number): Promise<void> => {
      if (depth > 12 || found.length >= maxFiles || totalCharacters >= maxTotalCharacters) return;
      const entries = (await readdir(directory, { withFileTypes: true }))
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (found.length >= maxFiles || totalCharacters >= maxTotalCharacters) break;
        const lowerName = entry.name.toLowerCase();
        if (lowerName !== "agents.md") {
          if (entry.isDirectory() && !PROJECT_SKIP_DIRECTORIES.has(lowerName)) {
            const next = join(directory, entry.name);
            const info = await lstat(next);
            if (!info.isSymbolicLink()) await visit(next, depth + 1);
          }
          continue;
        }
        if (!entry.isFile()) continue;
        const next = join(directory, entry.name);
        const info = await lstat(next);
        if (info.isSymbolicLink() || info.size > 64 * 1024) continue;
        const path = relative(root, next).replace(/\\/g, "/");
        try {
          const loaded = await this.readProject(conversationId, path, 0, 16000);
          const remaining = maxTotalCharacters - totalCharacters;
          const text = loaded.text.slice(0, remaining);
          if (!text.trim()) continue;
          found.push({ path, text, depth });
          totalCharacters += text.length;
        } catch {
          // 指令文件不可读时不阻断正常项目读取。
        }
      }
    };
    await visit(root, 0);
    return found
      .sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path))
      .map(({ path, text }) => ({ path, text }));
  }
  private async checkedProject(conversationId: string, value: string) {
    const normalized = safeProjectRelative(value);
    const root = await this.projectRoot(conversationId);
    const target = resolve(root, ...normalized.split("/"));
    const delta = relative(root, target);
    invariant(delta !== ".." && !delta.startsWith(".." + sep) && !isAbsolute(delta), 403, "路径超出项目工作区。", "workspace_path");
    let current = root;
    for (const part of normalized.split("/")) {
      current = join(current, part);
      const info = await lstat(current);
      invariant(!info.isSymbolicLink(), 403, "不允许通过链接或目录联接访问项目文件。", "workspace_link");
    }
    invariant(pathKey(await realpath(root)) === pathKey(root), 403, "项目工作区位置发生重定向。", "workspace_redirect");
    return { target, path: normalized };
  }
  private async checkedProjectTarget(conversationId: string, value: string) {
    const normalized = safeProjectRelative(value);
    const root = await this.projectRoot(conversationId);
    const target = resolve(root, ...normalized.split("/"));
    const delta = relative(root, target);
    invariant(delta !== ".." && !delta.startsWith(".." + sep) && !isAbsolute(delta), 403, "路径超出项目工作区。", "workspace_path");
    const parts = normalized.split("/");
    let current = root;
    let exists = true;
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      try {
        const info = await lstat(current);
        invariant(!info.isSymbolicLink(), 403, "不允许通过链接或目录联接访问项目文件。", "workspace_link");
        if (index < parts.length - 1) invariant(info.isDirectory(), 400, "项目文件路径中的目录无效。", "workspace_path");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        exists = false;
        break;
      }
    }
    invariant(pathKey(await realpath(root)) === pathKey(root), 403, "项目工作区位置发生重定向。", "workspace_redirect");
    if (exists) {
      const info = await lstat(target);
      invariant(!info.isDirectory(), 400, "项目修改目标必须是文件。", "workspace_file");
    }
    return { target, path: normalized, exists };
  }
  private async projectFileForEdit(conversationId: string, path: string) {
    const checked = await this.checkedProjectTarget(conversationId, path);
    if (!checked.exists) return { ...checked, bytes: null as Buffer | null, text: "", sha256: null as string | null };
    const handle = await open(checked.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      invariant(info.isFile() && info.size <= MAX_FILE_BYTES, 400, "只允许修改不超过 1 MB 的普通文本项目文件。", "project_file_size");
      const bytes = await handle.readFile();
      invariant(!bytes.includes(0), 400, "这个项目文件不是可修改的 UTF-8 文本。", "project_binary");
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new AppError(400, "这个项目文件不是 UTF-8 文本。", "project_encoding"); }
      return { ...checked, bytes, text, sha256: hash(bytes) };
    } finally { await handle.close(); }
  }
  async readProject(conversationId: string, path: string, offset = 0, limit = 16000) {
    const checked = await this.checkedProject(conversationId, path);
    invariant(isSupportedInputPath(checked.path), 400, "这个项目文件可能包含密钥或暂不支持读取。", "unsupported_project_file");
    const handle = await open(checked.target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      invariant(info.isFile() && info.size <= MAX_FILE_BYTES, 400, "只允许读取不超过 1 MB 的普通文本项目文件。", "project_file_size");
      const bytes = await handle.readFile();
      invariant(!bytes.includes(0), 400, "这个项目文件不是可读取的 UTF-8 文本。", "project_binary");
      let text: string;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
      catch { throw new AppError(400, "这个项目文件不是 UTF-8 文本。", "project_encoding"); }
      return { path: checked.path, sha256: hash(bytes), text: text.slice(offset, offset + limit), total_characters: text.length, next_offset: Math.min(text.length, offset + limit), truncated: offset + limit < text.length };
    } finally { await handle.close(); }
  }
  async applyProjectPatch(conversationId: string, runId: string | null, reason: string, operations: ProjectPatchOperation[]) {
    return this.withFiles(conversationId, async () => {
      const context = await this.projectContext(conversationId);
      const conversation = this.store.conversationById(conversationId);
      invariant(context.projectRoot && context.projectAccess === "workspace-write", 403, "项目当前是只读模式，请先明确开启‘允许修改’。", "workspace_write_required");
      invariant(reason.trim().length > 0 && reason.length <= 1000, 400, "修改原因不合法。", "project_edit_reason");
      invariant(operations.length > 0 && operations.length <= 20, 400, "一次最多修改 20 个项目文件。", "project_edit_count");
      const seen = new Set<string>();
      const prepared: Array<{ operation: ProjectPatchOperation; checked: Awaited<ReturnType<Workspace["checkedProjectTarget"]>>; before: Awaited<ReturnType<Workspace["projectFileForEdit"]>>; after: Buffer; afterSha: string }> = [];
      let totalBytes = 0;
      for (const operation of operations) {
        const normalized = safeProjectRelative(operation.path);
        invariant(isSupportedInputPath(normalized), 400, "项目修改只允许普通源码、文档和配置文本，不能修改密钥或未知二进制文件。", "unsupported_project_file");
        const key = pathKey(normalized);
        invariant(!seen.has(key), 400, "同一批修改不能重复包含同一个文件。", "project_edit_duplicate");
        seen.add(key);
        const before = await this.projectFileForEdit(conversationId, normalized);
        if (operation.operation === "create") {
          invariant(operation.expected_sha256 === null && !before.exists, 409, "创建目标已经存在，或缺少空文件版本校验。", "project_edit_conflict");
        } else {
          invariant(operation.expected_sha256 && before.exists && before.sha256 === operation.expected_sha256, 409, "项目文件在读取后发生了变化，请重新读取并基于最新版本修改。", "project_edit_conflict");
        }
        const after = Buffer.from(operation.content, "utf8");
        invariant(after.length <= MAX_FILE_BYTES && !after.includes(0), 400, "项目修改文件必须是 1 MB 以内的 UTF-8 文本。", "project_file_size");
        totalBytes += after.length;
        invariant(totalBytes <= 8 * MAX_FILE_BYTES, 400, "一次项目修改不能超过 8 MB。", "project_edit_size");
        prepared.push({ operation: { ...operation, path: normalized }, checked: await this.checkedProjectTarget(conversationId, normalized), before, after, afterSha: hash(after) });
      }
      const edit: ProjectEdit = {
        id: id(),
        conversation_id: conversationId,
        user_id: conversation.user_id,
        run_id: runId,
        reason: reason.trim(),
        status: "applied",
        files: [],
        created_at: now(),
      };
      const backupRoot = join(this.dataDir, "project-edits", edit.id);
      const applied: typeof prepared = [];
      try {
        await mkdir(backupRoot, { recursive: true });
        for (let index = 0; index < prepared.length; index++) {
          const item = prepared[index];
          let backupPath: string | null = null;
          if (item.before.bytes) {
            backupPath = "project-edits/" + edit.id + "/before-" + index + ".txt";
            await writeFile(join(this.dataDir, backupPath), item.before.bytes, { flag: "wx", mode: 0o600 });
          }
          edit.files.push({ path: item.operation.path, operation: item.operation.operation, before_sha256: item.before.sha256, after_sha256: item.afterSha, before_bytes: item.before.bytes?.length ?? 0, after_bytes: item.after.length, backup_path: backupPath });
        }
        for (const item of prepared) {
          const current = await this.projectFileForEdit(conversationId, item.operation.path);
          invariant(current.sha256 === item.before.sha256, 409, "项目文件在应用前发生了变化，已取消整批修改。", "project_edit_conflict");
          await mkdir(resolve(item.checked.target, ".."), { recursive: true });
          await writeFile(item.checked.target, item.after, { flag: "w", mode: 0o600 });
          applied.push(item);
        }
        this.store.addProjectEdit(edit);
        this.projectScanCache.delete(pathKey(context.projectRoot));
        return { edit, changes: edit.files.map((file, index) => ({ ...file, diff: compactLineDiff(prepared[index].before.text, prepared[index].operation.content) })) };
      } catch (error) {
        for (const item of [...applied].reverse()) {
          try {
            if (item.before.bytes) await writeFile(item.checked.target, item.before.bytes, { flag: "w", mode: 0o600 });
            else await rm(item.checked.target, { force: true });
          } catch {}
        }
        await rm(backupRoot, { recursive: true, force: true }).catch(() => {});
        throw error;
      }
    });
  }
  async undoProjectEdit(conversationId: string, editId: string) {
    return this.withFiles(conversationId, async () => {
      const conversation = this.store.conversationById(conversationId);
      const edit = this.store.projectEdit(conversation.user_id, editId);
      invariant(edit.conversation_id === conversationId && edit.status === "applied", 409, "这次项目修改已经撤销，或不属于当前对话。", "project_edit_state");
      const context = await this.projectContext(conversationId);
      invariant(context.projectRoot && context.projectAccess === "workspace-write", 403, "撤销项目修改需要先开启项目可写权限。", "workspace_write_required");
      const currentFiles = await Promise.all(edit.files.map(file => this.projectFileForEdit(conversationId, file.path)));
      for (let index = 0; index < edit.files.length; index++) invariant(currentFiles[index].sha256 === edit.files[index].after_sha256, 409, "项目文件已经被其他操作改动，已停止撤销，请先核对当前文件。", "project_edit_conflict");
      for (let index = 0; index < edit.files.length; index++) {
        const file = edit.files[index];
        const target = (await this.checkedProjectTarget(conversationId, file.path)).target;
        if (!file.before_sha256) await rm(target, { force: true });
        else {
          invariant(file.backup_path, 409, "缺少项目修改备份，无法安全撤销。", "project_edit_backup");
          const backup = resolve(this.dataDir, file.backup_path);
          const delta = relative(resolve(this.dataDir, "project-edits"), backup);
          invariant(delta && !delta.startsWith(".." + sep) && !isAbsolute(delta), 409, "项目修改备份位置不合法。", "project_edit_backup");
          const bytes = await readFile(backup);
          invariant(hash(bytes) === file.before_sha256, 409, "项目修改备份已变化，无法安全撤销。", "project_edit_backup");
          await writeFile(target, bytes, { flag: "w", mode: 0o600 });
        }
      }
      edit.status = "undone";
      edit.undone_at = now();
      this.store.saveProjectEdit(edit);
      return { edit, restored: edit.files.map(file => file.path) };
    });
  }
  async searchProject(conversationId: string, query: string) {
    invariant(query.length > 0 && query.length <= 200, 400, "搜索关键词不合法。", "workspace_query");
    const matches: Array<{ path: string; excerpt: string }> = [];
    for (const file of (await this.listProject(conversationId)).slice(0, 400)) {
      if (file.bytes > 128000) continue;
      try {
        const result = await this.readProject(conversationId, file.path, 0, 128000);
        const index = result.text.indexOf(query);
        if (index >= 0) matches.push({ path: file.path, excerpt: result.text.slice(Math.max(0, index - 120), index + 360) });
      } catch {}
      if (matches.length >= 50) break;
    }
    return matches;
  }
  async checked(conversationId: string, value: string, writable = false) {
    const normalized = safeRelative(value, writable);
    const root = await this.root(conversationId);
    const target = resolve(root, ...normalized.split("/"));
    invariant(
      relative(root, target) !== ".." &&
        !relative(root, target).startsWith(".." + sep),
      403,
      "路径超出资料区。",
    );
    let current = root;
    for (const part of normalized.split("/")) {
      current = join(current, part);
      try {
        const stat = await lstat(current);
        invariant(
          !stat.isSymbolicLink(),
          403,
          "不允许通过链接或目录联接访问文件。",
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const actualRoot = await realpath(root);
    invariant(
      actualRoot.toLowerCase() === resolve(root).toLowerCase(),
      403,
      "资料区目录不能重定向到其他位置。",
    );
    return target;
  }
  async read(conversationId: string, path: string, offset = 0, limit = 16000) {
    path = safeRelative(path);
    const target = await this.checked(conversationId, path);
    const handle = await open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const stat = await handle.stat();
      const document = isTextDocument(path);
      invariant(
        stat.isFile() && stat.size <= (document ? MAX_BINARY_FILE_BYTES : MAX_FILE_BYTES),
        400,
        document ? "文档不能超过 4 MB。" : "只允许读取不超过 1 MB 的普通文本文件。",
      );
      const bytes = await handle.readFile();
      let text: string;
      if (document) text = (await extractDocumentText(path, bytes)).text;
      else {
        invariant(!bytes.includes(0), 400, "这个文件不是可读取的文本。");
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
        catch { throw new AppError(415, "只支持 UTF-8 文本文件。", "unsupported_text_encoding"); }
      }
      return {
        path,
        text: text.slice(offset, offset + limit),
        total_characters: text.length,
        next_offset: Math.min(text.length, offset + limit),
        truncated: offset + limit < text.length,
      };
    } finally {
      await handle.close();
    }
  }
  async list(conversationId: string) {
    const root = await this.root(conversationId);
    const files: Array<{ path: string; bytes: number }> = [];
    const visit = async (dir: string, prefix: string, depth: number) => {
      if (depth > 8 || files.length >= 500) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (files.length >= 200) break;
        const next = join(dir, entry.name);
        const stat = await lstat(next);
        if (stat.isSymbolicLink()) continue;
        const rel = prefix + entry.name;
        if (stat.isDirectory()) await visit(next, rel + "/", depth + 1);
        else if (stat.isFile()) files.push({ path: rel, bytes: stat.size });
      }
    };
    await visit(join(root, "inputs"), "inputs/", 0);
    await visit(join(root, "outputs"), "outputs/", 0);
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
  async write(
    conversationId: string,
    runId: string | null,
    path: string,
    text: string,
  ) {
    return this.withFiles(conversationId, () => this.writeContent(conversationId, runId, path, text));
  }
  private async writeContent(conversationId: string, runId: string | null, path: string, text: string) {
    path = safeRelative(path, true);
    const target = await this.checked(conversationId, path, true);
    const data = Buffer.from(text, "utf8");
    invariant(data.length <= MAX_FILE_BYTES, 400, "单份成果不能超过 1 MB。");
    invariant(!data.includes(0), 400, "只允许写入文本内容。");
    const existing = await this.list(conversationId);
    invariant(
      this.store
        .artifacts(conversationId)
        .reduce((sum, file) => sum + file.bytes, 0) +
        data.length <=
        64 * MAX_FILE_BYTES,
      400,
      "这段对话的版本存储达到上限，请开始新的对话。",
    );
    invariant(
      existing
        .filter((file) => pathKey(file.path) !== pathKey(path))
        .reduce((sum, file) => sum + file.bytes, 0) +
        data.length <=
        20 * MAX_FILE_BYTES,
      400,
      "这段对话的资料已达到 20 MB 上限。",
    );
    await mkdir(resolve(target, ".."), { recursive: true });
    await this.checked(conversationId, path, true);
    const temporary = target + ".tmp-" + id();
    await writeFile(temporary, data, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    return this.publish(conversationId, runId, path);
  }
  async import(conversationId: string, name: string, base64: string) {
    return this.withFiles(conversationId, () => this.importContent(conversationId, name, base64));
  }
  private async importContent(conversationId: string, name: string, base64: string) {
    const relativeName = name.replace(/\\/g, "/").replace(/^\/+/, "");
    const path = safeRelative(relativeName.toLowerCase().startsWith("inputs/") ? relativeName : "inputs/" + relativeName);
    const inputName = path.slice("inputs/".length);
    invariant(isSupportedInputPath(inputName), 400, "暂不支持这种文件类型，或文件可能包含密钥。支持文字版 PDF、DOCX、文本、源码和图片；旧版 DOC 请先另存为 DOCX。", "unsupported_file");
    invariant(
      /^[A-Za-z0-9+/]*={0,2}$/.test(base64),
      400,
      "文件内容编码不合法。",
    );
    const bytes = Buffer.from(base64, "base64");
    const mime = inputMime(path);
    const document = isTextDocument(path);
    invariant(
      bytes.length <= (mime || document ? MAX_BINARY_FILE_BYTES : MAX_FILE_BYTES),
      400,
      mime || document ? "图片或文档不能超过 4 MB。" : "文本不能超过 1 MB。",
    );
    // 在持久化前完成正文校验；扫描件、损坏或加密文件不留下伪成功的附件。
    if (document) await extractDocumentText(path, bytes);
    else if (mime) {
      const preview = describePreview(path, bytes);
      invariant(
        preview.preview_kind === "image" && preview.mime === mime,
        415,
        "图片内容与格式不匹配，请重新导出为 PNG、JPEG、GIF 或 WebP。",
        "image_format",
      );
    } else {
      invariant(!bytes.includes(0), 400, "只允许导入 UTF-8 文本文件。");
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        invariant(false, 400, "文件不是 UTF-8 文本，请先转换编码。");
      }
    }
    const files = await this.list(conversationId);
    invariant(
      files.length < 500 &&
        files.reduce((sum, file) => sum + file.bytes, 0) + bytes.length <=
          20 * MAX_FILE_BYTES,
      400,
      "导入资料已达到本对话上限。",
    );
    let storedPath = path;
    if (files.some((file) => pathKey(file.path) === pathKey(storedPath))) {
      const slash = storedPath.lastIndexOf("/");
      storedPath = storedPath.slice(0, slash + 1) + id().slice(0, 8) + "-" + storedPath.slice(slash + 1);
    }
    const target = await this.checked(conversationId, storedPath);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    return this.publish(conversationId, null, storedPath, "input");
  }
  async publish(
    conversationId: string,
    runId: string | null,
    path: string,
    kind: Artifact["kind"] = "output",
  ) {
    return this.withFiles(conversationId, () => this.publishContent(conversationId, runId, path, kind));
  }
  private async publishContent(conversationId: string, runId: string | null, path: string, kind: Artifact["kind"]) {
    path = safeRelative(path, kind === "output");
    const target = await this.checked(conversationId, path);
    const stat = await lstat(target);
    invariant(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= (kind === "input" ? MAX_BINARY_FILE_BYTES : MAX_FILE_BYTES),
      400,
      kind === "input" ? "导入文件不能超过 4 MB。" : "成果必须是资料区内不超过 1 MB 的普通文件。",
    );
    const bytes = await readFile(target);
    const history = this.store.artifacts(conversationId);
    invariant(
      history.reduce((sum, file) => sum + file.bytes, 0) + bytes.length <=
        64 * MAX_FILE_BYTES,
      400,
      "这段对话的版本存储达到上限，请开始新的对话。",
    );
    const sha256 = hash(bytes);
    const previous = history.find(
      (item) => pathKey(item.path) === pathKey(path),
    );
    path = previous?.path ?? path;
    if (previous?.sha256 === sha256) return previous;
    const artifact: Artifact = {
      id: id(),
      conversation_id: conversationId,
      run_id: runId,
      path,
      name: basename(path),
      bytes: bytes.length,
      sha256,
      version: (previous?.version ?? 0) + 1,
      kind,
      created_at: now(),
    };
    await mkdir(this.snapshots, { recursive: true });
    await writeFile(join(this.snapshots, artifact.id), bytes, {
      flag: "wx",
      mode: 0o600,
    });
    this.store.addArtifact(artifact);
    return artifact;
  }
  async artifactBytes(artifact: Artifact) {
    invariant(/^[a-f0-9-]{36}$/i.test(artifact.id), 400, "文件标识不合法。");
    const target = join(this.snapshots, artifact.id);
    const stat = await lstat(target);
    invariant(
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_BINARY_FILE_BYTES,
      409,
      "文件版本已不可读取。",
    );
    const bytes = await readFile(target);
    invariant(
      hash(bytes) === artifact.sha256,
      409,
      "文件版本已发生变化，已阻止导出。",
    );
    return bytes;
  }
}
