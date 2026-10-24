/** 青穗集 · 原生命令进程：最小环境、PowerShell 编码、有界输出和可信目录权限准备。 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { AppError } from "./errors.js";

export function nativeEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const env: NodeJS.ProcessEnv = {};
  for (const name of [
    "PATH", "SYSTEMROOT", "WINDIR", "SYSTEMDRIVE", "PATHEXT", "COMSPEC",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "COMMONPROGRAMFILES",
  ]) {
    const key = Object.keys(source).find((key) => key.toUpperCase() === name);
    if (key) env[key] = source[key];
  }
  // 不继承用户的模块路径、Node 注入参数、代理或模型凭据。
  const systemRoot = env.SystemRoot ?? env.SYSTEMROOT ?? "C:/Windows";
  env.PSModulePath = join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules");
  return env;
}

export function windowsPowerShell() {
  const key = Object.keys(process.env).find((key) => key.toUpperCase() === "SYSTEMROOT");
  return join(key ? process.env[key]! : "C:/Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export function powershellArguments(command: string) {
  const script = [
    "$ProgressPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    "$global:LASTEXITCODE = 0",
    "try {",
    "& {", command, "}",
    "if (-not $?) { exit 1 }",
    "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }",
    "} catch { [Console]::Error.WriteLine($_.ToString()); exit 1 }",
  ].join("\n");
  return ["-NoLogo", "-NoProfile", "-NonInteractive", "-InputFormat", "Text",
    "-OutputFormat", "Text", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")];
}

export async function captureNative(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
  options: { env?: NodeJS.ProcessEnv; limit?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd, env: options.env ?? nativeEnvironment(), shell: false, windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const limit = options.limit ?? 128000;
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    let stdout = "", stderr = "", bytes = 0, overflow = false;
    const stop = () => { child.kill(); };
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
    const collect = (field: "stdout" | "stderr", value: Buffer) => {
      if (overflow) return;
      bytes += value.byteLength;
      if (bytes > limit) { overflow = true; stop(); return; }
      const text = decoders[field].write(value);
      if (field === "stdout") stdout += text;
      else stderr += text;
    };
    child.stdout.on("data", (value: Buffer) => collect("stdout", value));
    child.stderr.on("data", (value: Buffer) => collect("stderr", value));
    child.once("error", () => {
      signal.removeEventListener("abort", stop);
      reject(new AppError(503, "Windows 原生受限进程无法启动；没有降级为普通终端执行。"));
    });
    child.once("close", (code) => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(signal.reason ?? new DOMException("已停止", "AbortError"));
      else if (overflow) reject(new AppError(400, "命令输出超过上限，已停止并清理子进程。"));
      else resolve({ code: code ?? -1, stdout: stdout + decoders.stdout.end(), stderr: stderr + decoders.stderr.end() });
    });
  });
}

// 此脚本只由可信服务对已校验的自有目录执行，不接受模型命令，也不修改父目录权限。
const prepareScript = String.raw`$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($directory in ($env:QSG_NATIVE_DIRS | ConvertFrom-Json)) {
  $item = Get-Item -LiteralPath $directory -Force
  if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Native sandbox directory must be a real directory' }
  $acl = Get-Acl -LiteralPath $directory
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $identity.Value) { throw 'Native sandbox directory must be owned by current user' }
  $present = $false
  foreach ($entry in $acl.Access) {
    if ($entry.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -eq $identity.Value -and $entry.AccessControlType -eq 'Allow' -and ($entry.FileSystemRights -band [Security.AccessControl.FileSystemRights]::TakeOwnership) -and ($entry.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ContainerInherit) -and ($entry.InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ObjectInherit)) { $present = $true; break }
  }
  if (-not $present) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, [Security.AccessControl.FileSystemRights]::TakeOwnership, [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit', [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $directory -AclObject $acl
  }
}`;

export async function prepareNativeDirectories(directories: string[], signal: AbortSignal) {
  const result = await captureNative(windowsPowerShell(), powershellArguments(prepareScript), directories[0], signal, {
    env: { ...nativeEnvironment(), QSG_NATIVE_DIRS: JSON.stringify(directories) }, limit: 16000,
  });
  if (result.code !== 0)
    throw new AppError(503, "无法准备当前用户自有目录的原生沙箱权限；请检查目录归属和 NTFS 权限。没有执行用户命令。");
}
