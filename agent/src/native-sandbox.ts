/** 青穗集 · Windows 原生写入沙箱：DSH 受限令牌、逐对话权限与 Job 子进程清理。 */
import { mkdir, mkdtemp, lstat, realpath, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, relative, isAbsolute, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError, invariant } from "./errors.js";
import { captureNative, powershellArguments, prepareNativeDirectories, windowsPowerShell } from "./native-process.js";
import type { Sandbox, SandboxHealth, SandboxResult } from "./types.js";

type AclModule = typeof import("@deepseek-ai/dsh-sandbox-windows-acl");
type Grant = ReturnType<AclModule["AclWriteGrant"]["create"]>;
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const key = (value: string) => resolve(value).toLowerCase();

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

  commandContext(workspace: string) {
    return [
      "通过 Windows 原生受限令牌运行 Windows PowerShell 5.1；语法使用 PowerShell，不能使用 Linux sh/heredoc。",
      "当前目录 " + quote(join(workspace, "outputs")) + "；可读取的导入资料在 " + quote(join(workspace, "inputs")) + "。",
      "命令只授予本对话 outputs 和独立临时目录的写权限，输入不能覆盖。读取、联网和进程可见性未完整隔离；只处理用户已导入的资料，不自行访问其他本机路径。",
      "可调用系统已安装的命令，不能假设已安装 Python 或额外库；使用 Get-Command 查询。每次最多 60 秒、输出最多 128000 字节，无 CPU/内存硬配额。",
      "使用当前目录文件名生成成果，不要再次添加 outputs/；生成后用 publish_file 的 outputs/相对路径登记。若工具不可用，如实说明，不能改用无限制宿主终端。",
    ].join(" ");
  }

  async health(recheck = false): Promise<SandboxHealth> {
    if (this.checking) return this.checking;
    if (!recheck && this.checked) return this.checked;
    this.checking = this.probe().then((result) => {
      this.checked = result;
      return result;
    }).finally(() => { this.checking = undefined; });
    return this.checking;
  }

  private base(): SandboxHealth {
    return {
      available: false, provider: "windows-native", image: "", shell: "Windows PowerShell 5.1",
      isolation: "write-restricted", isolation_tested: false,
      read_isolated: false, network_isolated: false, resource_limits: false,
      message: "Windows 原生写入限制尚未通过自检。",
    };
  }

  private async directory(directory: string) {
    const info = await lstat(directory);
    invariant(info.isDirectory() && !info.isSymbolicLink() && key(await realpath(directory)) === key(directory),
      403, "原生沙箱目录不能包含符号链接或目录联接。");
  }

  private async tempDirectory(prefix: string) {
    await mkdir(this.tempRoot, { recursive: true });
    await this.directory(this.tempRoot);
    return mkdtemp(join(this.tempRoot, prefix));
  }

  private async removeTemporary(directory: string) {
    const delta = relative(this.tempRoot, resolve(directory));
    invariant(delta.length > 0 && !delta.startsWith("..") && !isAbsolute(delta), 500, "临时目录清理范围不合法。");
    try { await this.directory(directory); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }

  private async runRestricted(command: string, outputs: string, signal: AbortSignal, standing = true): Promise<SandboxResult> {
    signal.throwIfAborted();
    const started = Date.now();
    const temp = await this.tempDirectory("command-");
    let outputGrant: Grant | undefined, tempGrant: Grant | undefined;
    try {
      await this.directory(outputs);
      await prepareNativeDirectories([outputs, temp], signal);
      signal.throwIfAborted();
      const acl = await import("@deepseek-ai/dsh-sandbox-windows-acl");
      const writeSid = acl.workspaceWriteSid(outputs), tempSid = acl.tempWriteSid(temp);
      // 成果目录使用稳定 capability SID；临时目录的权限必须在子进程全部退出后撤销。
      outputGrant = acl.AclWriteGrant.create(writeSid);
      outputGrant.add(outputs, standing);
      tempGrant = acl.AclWriteGrant.create(tempSid);
      tempGrant.add(temp);
      signal.throwIfAborted();
      const runner = fileURLToPath(import.meta.resolve("@deepseek-ai/dsh-sandbox-windows-acl/runner"));
      const result = await captureNative(process.execPath, [
        runner, "--workspace", outputs, "--temp", temp, "--mode", "workspace-write",
        "--write-sid", writeSid, "--temp-write-sid", tempSid, "--",
        windowsPowerShell(), ...powershellArguments(command),
      ], outputs, signal, { limit: this.options.outputLimit });
      invariant(!/(?:^|\n)windows-acl-run:/.test(result.stderr), 503,
        "Windows 受限进程初始化或运行失败；没有降级执行。" + result.stderr.slice(0, 2000));
      return { exit_code: result.code, stdout: result.stdout, stderr: result.stderr, duration_ms: Date.now() - started };
    } finally {
      // runner 的 Job 是 kill-on-close；close 事件之后再撤销权限和删除私有临时目录。
      let cleanupFailed = false;
      for (const grant of [tempGrant, outputGrant]) {
        try { grant?.dispose(); } catch { cleanupFailed = true; }
      }
      try { await this.removeTemporary(temp); } catch { cleanupFailed = true; }
      if (cleanupFailed) {
        this.checked = undefined;
        throw new AppError(503, "原生沙箱临时权限或目录清理未完成，请重新检查执行环境。");
      }
    }
  }

  private async probe(): Promise<SandboxHealth> {
    const base = this.base();
    if (process.platform !== "win32")
      return { ...base, message: "Windows 原生沙箱只支持 Windows；可显式选择 Docker 后端。" };
    let check: string | undefined;
    let outcome = base;
    try {
      check = await this.tempDirectory("check-");
      const outputs = join(check, "outputs"), inputs = join(check, "inputs");
      await mkdir(outputs);
      await mkdir(inputs);
      const input = join(inputs, "source.txt"), outside = join(check, "outside.txt");
      await writeFile(input, "source-original");
      await writeFile(outside, "outside-original");
      const command = [
        "[IO.File]::WriteAllText('probe.txt', 'write-ok')",
        "$read = [IO.File]::ReadAllText(" + quote(input) + ")",
        "$blocked = @()",
        "foreach ($p in @(" + quote(input) + ", " + quote(outside) + ")) { try { [IO.File]::WriteAllText($p, 'FAIL'); $blocked += $false } catch { $blocked += $true } }",
        "[IO.File]::WriteAllText((Join-Path $env:TEMP 'probe-temp.txt'), 'temp-ok')",
        "@{ read = $read; blocked = $blocked } | ConvertTo-Json -Compress",
      ].join("\n");
      const result = await this.runRestricted(command, outputs, AbortSignal.timeout(15000), false);
      const report = JSON.parse(result.stdout.trim()) as { read: string; blocked: boolean[] };
      invariant(result.exit_code === 0 && report.read === "source-original" &&
        report.blocked.length === 2 && report.blocked.every((value) => value === true) &&
        await readFile(input, "utf8") === "source-original" &&
        await readFile(outside, "utf8") === "outside-original" &&
        await readFile(join(outputs, "probe.txt"), "utf8") === "write-ok", 503, "原生目录写入限制自检未通过。");
      outcome = {
        ...base, available: true, isolation_tested: true, checked_at: new Date().toISOString(),
        tested_checks: ["output-write", "input-read", "input-write-denied", "outside-write-denied", "private-temp"],
        message: "Windows 原生写入限制已实测：成果目录和专用临时目录可写，导入资料与测试目录外写入被拒绝。读取与联网未隔离，无 CPU/内存硬配额。",
      };
    } catch (error) {
      outcome = { ...base, message: "Windows 原生沙箱自检失败，命令保持关闭：" +
        (error instanceof AppError ? error.message : "请检查 Windows、NTFS 目录权限和原生组件安装。") };
    } finally {
      if (check) {
        try { await this.removeTemporary(check); }
        catch { outcome = { ...base, message: "Windows 原生自检目录清理失败，命令保持关闭。" }; }
      }
    }
    return outcome;
  }

  async execute(command: string, workspace: string, signal: AbortSignal): Promise<SandboxResult> {
    signal.throwIfAborted();
    invariant(command.length > 0 && command.length <= 16000, 400, "命令长度不合法。");
    invariant(process.platform === "win32", 503, "当前系统不支持 Windows 原生沙箱。");
    invariant(/^[a-f0-9-]{36}$/i.test(basename(workspace)) &&
      key(dirname(workspace)) === key(join(this.dataDir, "workspaces")), 403, "只允许执行当前对话工作目录中的命令。");
    const health = await this.health();
    signal.throwIfAborted();
    invariant(health.available, 503, health.message);
    await this.directory(workspace);
    await this.directory(join(workspace, "inputs"));
    try {
      return await this.runRestricted(command, join(workspace, "outputs"),
        AbortSignal.any([signal, AbortSignal.timeout(this.options.timeoutMs ?? 60000)]));
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      if (error instanceof DOMException && error.name === "TimeoutError")
        throw new AppError(408, "命令超过执行时限，已停止并清理子进程。");
      if (error instanceof AppError) throw error;
      throw new AppError(503, "Windows 原生受限执行失败，请重新检查环境；未降级为普通终端。");
    }
  }
}
