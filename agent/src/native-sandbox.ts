/** 青穗集 · Windows 原生写入沙箱：借用 DSH ACL 受限令牌，把项目根与会话成果区分开。 */
import { mkdir, mkdtemp, lstat, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, invariant } from "./errors.js";
import { captureNative, nativeEnvironment, prepareNativeDirectories, powershellArguments, windowsPowerShell } from "./native-process.js";
import type { Sandbox, SandboxExecutionOptions, SandboxHealth, SandboxResult } from "./types.js";

type AclModule = typeof import("@deepseek-ai/dsh-sandbox-windows-acl");
const key = (value: string) => resolve(value).replaceAll("\\", "/").toLowerCase();
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

export class WindowsNativeSandbox implements Sandbox {
  private checked?: SandboxHealth;
  private checking?: Promise<SandboxHealth>;
  private readonly dataDir: string;
  private readonly tempRoot: string;
  constructor(
    dataDir: string,
    private readonly options: { timeoutMs?: number; outputLimit?: number } = {},
  ) {
    this.dataDir = resolve(dataDir);
    this.tempRoot = join(this.dataDir, "sandbox-tmp");
  }

  commandContext(_workspace: string, options?: SandboxExecutionOptions) {
    const project = options?.projectRoot ? "当前命令目录是绑定的项目根目录；项目权限为 " + (options.workspaceAccess === "workspace-write" ? "可写" : "只读") + "。" : "当前命令目录是会话 outputs 目录。";
    return [
      "通过 Windows 原生 DSH 受限令牌运行 Windows PowerShell 5.1；语法使用 PowerShell，不能使用 Linux sh/heredoc。",
      project,
      "会话成果目录通过环境变量 $env:QSG_OUTPUTS 访问；项目根通过 $env:QSG_PROJECT_ROOT 访问。命令只处理当前对话明确绑定的项目或资料。",
      "项目默认只读；只有用户明确开启项目可写后，项目根才会加入受限写入目录。会话 outputs 始终可以写入，生成后用 publish_file 的 outputs/相对路径登记。",
      "读取、联网和进程可见性未完整隔离；每次最多 60 秒、输出最多 128000 字节，无 CPU/内存硬配额。可调用系统已安装的命令，不能假设已安装 Python 或额外库。",
      "受限环境不可用时必须如实报告，不能改用无限制宿主终端。",
    ].join(" ");
  }

  async health(recheck = false): Promise<SandboxHealth> {
    if (this.checking) return this.checking;
    if (!recheck && this.checked) return this.checked;
    this.checking = this.probe().then(result => { this.checked = result; return result; }).finally(() => { this.checking = undefined; });
    return this.checking;
  }

  private base(): SandboxHealth {
    return {
      available: false,
      provider: "windows-native",
      image: "",
      shell: "Windows PowerShell 5.1",
      isolation: "write-restricted",
      isolation_tested: false,
      read_isolated: false,
      network_isolated: false,
      resource_limits: false,
      message: "Windows 原生写入限制尚未通过自检。",
    };
  }

  private async directory(directory: string) {
    const info = await lstat(directory);
    invariant(info.isDirectory() && !info.isSymbolicLink() && key(await realpath(directory)) === key(directory), 403, "原生沙箱目录不能包含符号链接或目录联接：" + directory, "sandbox_directory");
  }

  private async tempDirectory(prefix: string) {
    await mkdir(this.tempRoot, { recursive: true });
    await this.directory(this.tempRoot);
    return mkdtemp(join(this.tempRoot, prefix));
  }

  private async removeTemporary(directory: string) {
    const delta = relative(this.tempRoot, resolve(directory));
    invariant(delta.length > 0 && !delta.startsWith("..") && !isAbsolute(delta), 500, "临时目录清理范围不合法。", "sandbox_cleanup");
    try { await this.directory(directory); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }

  private async runRestricted(command: string, cwd: string, writableRoots: string[], signal: AbortSignal, options: SandboxExecutionOptions = {}): Promise<SandboxResult> {
    signal.throwIfAborted();
    const started = Date.now();
    const temp = await this.tempDirectory("command-");
    let outputGrant: ReturnType<AclModule["AclWriteGrant"]["create"]> | undefined;
    let tempGrant: ReturnType<AclModule["AclWriteGrant"]["create"]> | undefined;
    const roots = [...new Set(writableRoots.map(value => resolve(value)))];
    try {
      await this.directory(cwd);
      for (const root of roots) await this.directory(root);
      await prepareNativeDirectories([...roots, temp], signal);
      signal.throwIfAborted();
      const acl = await import("@deepseek-ai/dsh-sandbox-windows-acl");
      const runnerWorkspace = options.workspaceAccess === "workspace-write" && options.projectRoot ? resolve(options.projectRoot) : roots[0];
      invariant(runnerWorkspace, 503, "原生沙箱没有可写入的会话成果目录。", "sandbox_directory");
      const writeSid = acl.workspaceWriteSid(runnerWorkspace);
      const tempSid = acl.tempWriteSid(temp);
      outputGrant = acl.AclWriteGrant.create(writeSid);
      for (const root of roots) outputGrant.add(root, true);
      tempGrant = acl.AclWriteGrant.create(tempSid);
      tempGrant.add(temp);
      const runner = fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-sandbox-windows-acl/runner"));
      const result = await captureNative(process.execPath, [
        runner, "--workspace", runnerWorkspace, "--temp", temp, "--mode", "workspace-write",
        "--write-sid", writeSid, "--temp-write-sid", tempSid, "--",
        windowsPowerShell(), ...powershellArguments([
          "$env:QSG_OUTPUTS = " + quote(join(options.sessionRoot ?? cwd, "outputs")),
          "$env:QSG_PROJECT_ROOT = " + quote(options.projectRoot ?? cwd),
          command,
        ].join("\n")),
      ], cwd, signal, { env: { ...nativeEnvironment(), QSG_OUTPUTS: join(options.sessionRoot ?? cwd, "outputs"), QSG_PROJECT_ROOT: options.projectRoot ?? cwd }, limit: this.options.outputLimit, onOutput: options.onOutput });
      const stderr = result.stderr;
      invariant(!/(?:^|\n)windows-acl-run:/.test(stderr), 503, "Windows 受限进程初始化或运行失败；没有降级执行。" + stderr.slice(0, 2000), "sandbox_failed");
      return { exit_code: result.code, stdout: result.stdout, stderr, duration_ms: Date.now() - started };
    } finally {
      let cleanupFailed = false;
      for (const grant of [tempGrant, outputGrant]) try { grant?.dispose(); } catch { cleanupFailed = true; }
      try { await this.removeTemporary(temp); } catch { cleanupFailed = true; }
      if (cleanupFailed) {
        this.checked = undefined;
        throw new AppError(503, "原生沙箱临时权限或目录清理未完成，请重新检查执行环境。", "sandbox_cleanup");
      }
    }
  }

  private async probe(): Promise<SandboxHealth> {
    const base = this.base();
    if (process.platform !== "win32") return { ...base, message: "Windows 原生沙箱只支持 Windows；可显式选择 Docker 后端。" };
    let check: string | undefined;
    let outcome = base;
    try {
      check = await this.tempDirectory("check-");
      const outputs = join(check, "outputs"), inputs = join(check, "inputs");
      await mkdir(outputs); await mkdir(inputs);
      const input = join(inputs, "source.txt"), outside = join(check, "outside.txt");
      await writeFile(input, "source-original"); await writeFile(outside, "outside-original");
      const command = [
        "[IO.File]::WriteAllText('probe.txt', 'write-ok')",
        "$read = [IO.File]::ReadAllText(" + quote(input) + ")",
        "$blocked = @()",
        "foreach ($p in @(" + quote(input) + ", " + quote(outside) + ")) { try { [IO.File]::WriteAllText($p, 'FAIL'); $blocked += $false } catch { $blocked += $true } }",
        "[IO.File]::WriteAllText((Join-Path $env:TEMP 'probe-temp.txt'), 'temp-ok')",
        "@{ read = $read; blocked = $blocked } | ConvertTo-Json -Compress",
      ].join("\n");
      const result = await this.runRestricted(command, outputs, [outputs], AbortSignal.timeout(15000), { sessionRoot: check });
      invariant(result.stdout.trim(), 503, "原生探针没有输出；stderr=" + result.stderr.slice(0, 500), "sandbox_probe");
      const report = JSON.parse(result.stdout.trim()) as { read: string; blocked: boolean[] };
      invariant(result.exit_code === 0 && report.read === "source-original" && report.blocked.length === 2 && report.blocked.every(value => value === true) && await readFile(input, "utf8") === "source-original" && await readFile(outside, "utf8") === "outside-original" && await readFile(join(outputs, "probe.txt"), "utf8") === "write-ok", 503, "原生目录写入限制自检未通过。", "sandbox_probe");
      outcome = { ...base, available: true, isolation_tested: true, checked_at: new Date().toISOString(), tested_checks: ["output-write", "input-read", "input-write-denied", "outside-write-denied", "private-temp"], message: "Windows 原生写入限制已实测：会话成果目录和专用临时目录可写，其他目录写入被拒绝。读取与联网未隔离，无 CPU/内存硬配额。" };
    } catch (error) {
      outcome = { ...base, message: "Windows 原生沙箱自检失败，命令保持关闭：" + (error instanceof AppError ? error.message : error instanceof Error ? error.message : "请检查 Windows、NTFS 目录权限和原生组件安装。") };
    } finally {
      if (check) try { await this.removeTemporary(check); } catch { outcome = { ...base, message: "Windows 原生自检目录清理失败，命令保持关闭。" }; }
    }
    return outcome;
  }

  async execute(command: string, workspace: string, signal: AbortSignal, options: SandboxExecutionOptions = {}): Promise<SandboxResult> {
    signal.throwIfAborted();
    invariant(command.length > 0 && command.length <= 16000, 400, "命令长度不合法。", "command_length");
    invariant(process.platform === "win32", 503, "当前系统不支持 Windows 原生沙箱。", "sandbox_platform");
    const sessionRoot = resolve(options.sessionRoot ?? workspace);
    invariant(/^[a-f0-9-]{36}$/i.test(basename(sessionRoot)) && key(dirname(sessionRoot)) === key(join(this.dataDir, "workspaces")), 403, "只允许执行当前对话工作目录中的命令。", "workspace_session");
    const projectRoot = options.projectRoot ? resolve(options.projectRoot) : null;
    const cwd = projectRoot ?? join(sessionRoot, "outputs");
    const outputs = join(sessionRoot, "outputs");
    const writableRoots = projectRoot && options.workspaceAccess === "workspace-write" ? [projectRoot, outputs] : [outputs];
    const health = await this.health();
    signal.throwIfAborted();
    invariant(health.available, 503, health.message, "sandbox_unavailable");
    await this.directory(sessionRoot); await this.directory(outputs); await this.directory(cwd);
    try {
      return await this.runRestricted(command, cwd, writableRoots, AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs ?? 60000)]), { ...options, sessionRoot, projectRoot });
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new AppError(408, "命令超过执行时限，已停止并清理子进程。", "command_timeout");
      if (error instanceof AppError) throw error;
      throw new AppError(503, "Windows 原生受限执行失败，请重新检查环境；未降级为普通终端。", "sandbox_failed");
    }
  }
}
