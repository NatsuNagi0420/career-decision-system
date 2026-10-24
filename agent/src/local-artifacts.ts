/** 青穗集 · 用户主动打开文件：只处理已鉴权的版本副本，禁开可执行文件，不接受任意系统路径。 */
import { spawn } from "node:child_process";
import { mkdir, lstat, open, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join, dirname, resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import { Workspace, safeRelative } from "./files.js";
import { AppError, invariant } from "./errors.js";
import { windowsPowerShell, powershellArguments, nativeEnvironment } from "./native-process.js";
import type { Artifact } from "./types.js";
export type LocalFileAction = "open" | "reveal";
export type LocalFileLauncher = (path: string, action: LocalFileAction) => Promise<void>;
const OPENABLE = new Set([".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".log", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".docx", ".xlsx", ".pptx", ".zip"]);
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
export function canOpenArtifact(name: string) { return OPENABLE.has(extname(name).toLowerCase()); }
export function localFileAccess(mode: "local" | "server", peer: string, host: string, origin?: string) {
  const local = (name: string) => ["127.0.0.1", "localhost", "[::1]", "::1", "::ffff:127.0.0.1"].includes(name.toLowerCase());
  if (mode !== "local" || !local(peer)) return false;
  try {
    if (!local(new URL("http://" + host).hostname)) return false;
    return !origin || local(new URL(origin).hostname);
  } catch { return false; }
}
export async function materializeArtifact(workspace: Workspace, artifact: Artifact) {
  return workspace.withFiles(artifact.conversation_id, () => materialize(workspace, artifact));
}
async function materialize(workspace: Workspace, artifact: Artifact) {
  invariant(basename(artifact.name) === artifact.name, 400, "文件名不能包含目录。");
  safeRelative("outputs/" + artifact.name, true);
  const bytes = await workspace.artifactBytes(artifact);
  const parent = join(workspace.dataDir, "local-open");
  const directory = join(parent, artifact.id);
  for (const path of [parent, directory]) {
    await mkdir(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
    const stat = await lstat(path);
    invariant(stat.isDirectory() && !stat.isSymbolicLink() && resolve(await realpath(path)).toLowerCase() === resolve(path).toLowerCase(), 403, "本地打开目录不能重定向到其他位置。");
  }
  const target = join(directory, artifact.name);
  try {
    const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stat = await lstat(target);
    invariant(stat.isFile() && !stat.isSymbolicLink() && stat.size === artifact.bytes && digest(await readFile(target)) === artifact.sha256, 409, "本地副本已被修改，未覆盖你的编辑。请下载新副本。");
  }
  return target;
}
export const launchLocalFile: LocalFileLauncher = async (path, action) => {
  const windows = process.platform === "win32";
  const executable = windows ? windowsPowerShell() : process.platform === "darwin" ? "/usr/bin/open" : "xdg-open";
  // 路径通过环境变量传入固定脚本，绝不拼接到命令代码中。
  const script = action === "open"
    ? "Start-Process -FilePath $env:QSG_OPEN_FILE"
    : "Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('/select,' + [char]34 + $env:QSG_OPEN_FILE + [char]34)";
  const args = windows ? powershellArguments(script) : process.platform === "darwin" ? action === "reveal" ? ["-R", path] : [path] : [action === "reveal" ? dirname(path) : path];
  await new Promise<void>((done, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, detached: !windows, stdio: "ignore", env: windows ? { ...nativeEnvironment(), QSG_OPEN_FILE: path } : process.env });
    const timer = windows ? setTimeout(() => { child.kill(); reject(new AppError(503, "调用系统应用超时，请尝试下载后打开。")); }, 10000) : undefined;
    child.once("close", () => clearTimeout(timer));
    child.once("error", () => { clearTimeout(timer); reject(new AppError(503, "无法调用系统应用，请尝试下载后打开。")); });
    if (windows) child.once("exit", code => code === 0 ? done() : reject(new AppError(503, "系统未能打开该文件，请检查默认应用或下载后打开。")));
    else child.once("spawn", () => { child.unref(); done(); });
  });
};
