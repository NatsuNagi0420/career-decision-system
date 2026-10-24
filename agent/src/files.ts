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
import { basename, extname, join, resolve, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { Store, id, now } from "./store.js";
import { AppError, invariant } from "./errors.js";
import type { Artifact } from "./types.js";
export const MAX_FILE_BYTES = 1024 * 1024;
const pathKey = (value: string) =>
  process.platform === "win32"
    ? value.replace(/\\/g, "/").toLowerCase()
    : value.replace(/\\/g, "/");
const hash = (value: Buffer) =>
  createHash("sha256").update(value).digest("hex");
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
export class Workspace {
  readonly workspaces: string;
  readonly snapshots: string;
  private readonly operations = new Map<string, number>();
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
  async removeConversation(conversationId: string, artifacts: Artifact[]) {
    this.assertIdle(conversationId);
    invariant(/^[a-f0-9-]{36}$/i.test(conversationId), 400, "对话标识不合法。");
    const base = resolve(this.dataDir);
    invariant(pathKey(await realpath(base)) === pathKey(base), 409, "资料根目录发生重定向，已停止删除。");
    const targets = [join(base, "workspaces", conversationId)];
    for (const artifact of artifacts) {
      invariant(artifact.conversation_id === conversationId && /^[a-f0-9-]{36}$/i.test(artifact.id), 409, "文件归属异常，已停止删除。");
      targets.push(join(base, "artifacts", artifact.id), join(base, "local-open", artifact.id));
    }
    const checked: string[] = [];
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
        invariant(parentStat.isDirectory() && !parentStat.isSymbolicLink() && pathKey(await realpath(parent)) === pathKey(parent), 409, "资料目录发生重定向，已停止删除。");
        await inspect(target);
        checked.push(resolve(target));
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    try {
      for (const target of checked) await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
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
      invariant(
        stat.isFile() && stat.size <= MAX_FILE_BYTES,
        400,
        "只允许读取不超过 1 MB 的普通文本文件。",
      );
      const bytes = await handle.readFile();
      invariant(!bytes.includes(0), 400, "这个文件不是可读取的文本。");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("unsupported_text_encoding");
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
      if (depth > 5 || files.length >= 200) return;
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
    invariant(
      name === basename(name) && !name.includes("\\") && name.length <= 120,
      400,
      "文件名不合法。",
    );
    invariant(
      [".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml"].includes(
        extname(name).toLowerCase(),
      ),
      400,
      "目前支持 UTF-8 文本、Markdown、CSV、JSON 和 YAML；PDF、Word 请先转成文本。",
    );
    invariant(
      /^[A-Za-z0-9+/]*={0,2}$/.test(base64),
      400,
      "文件内容编码不合法。",
    );
    const bytes = Buffer.from(base64, "base64");
    invariant(
      bytes.length <= MAX_FILE_BYTES && !bytes.includes(0),
      400,
      "请导入不超过 1 MB 的 UTF-8 文本。",
    );
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      invariant(false, 400, "文件不是 UTF-8 文本，请先转换编码。");
    }
    const files = await this.list(conversationId);
    invariant(
      files.length < 100 &&
        files.reduce((sum, file) => sum + file.bytes, 0) + bytes.length <=
          20 * MAX_FILE_BYTES,
      400,
      "导入资料已达到本对话上限。",
    );
    let path = "inputs/" + name;
    if (files.some((file) => file.path.toLowerCase() === path.toLowerCase()))
      path = "inputs/" + id().slice(0, 8) + "-" + name;
    const target = await this.checked(conversationId, path);
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
    return this.publish(conversationId, null, path, "input");
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
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_FILE_BYTES,
      400,
      "成果必须是资料区内不超过 1 MB 的普通文件。",
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
      stat.isFile() && !stat.isSymbolicLink() && stat.size <= MAX_FILE_BYTES,
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
