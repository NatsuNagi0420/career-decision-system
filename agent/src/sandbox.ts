/** 青穗集 · 命令沙箱选择与 Docker 后端：Windows 默认原生受限执行，失败不降级为普通终端。 */
import { WindowsNativeSandbox } from "./native-sandbox.js";
import type { Config } from "./config.js";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { StringDecoder } from "node:string_decoder";
import { AppError, invariant } from "./errors.js";
import type { Sandbox, SandboxExecutionOptions, SandboxHealth, SandboxResult } from "./types.js";
export function dockerEnvironment() {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "Path",
    "SystemRoot",
    "WINDIR",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "TEMP",
    "TMP",
    "HOME",
    "PROGRAMFILES",
  ])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}
async function capture(
  executable: string,
  args: string[],
  signal: AbortSignal,
  limit = 128000,
  onOutput?: (stream: "stdout" | "stderr", text: string) => void,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("已停止", "AbortError"));
      return;
    }
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      env: dockerEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      bytes = 0,
      overflow = false;
    const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
    const stop = () => child.kill();
    signal.addEventListener("abort", stop, { once: true });
    const collect = (field: "stdout" | "stderr", value: Buffer) => {
      bytes += value.byteLength;
      if (bytes > limit) {
        overflow = true;
        child.kill();
        return;
      }
      const text = decoders[field].write(value);
      if (field === "stdout") stdout += text;
      else stderr += text;
      if (text) onOutput?.(field, text);
    };
    child.stdout.on("data", (value) => collect("stdout", value));
    child.stderr.on("data", (value) => collect("stderr", value));
    child.on("error", () => {
      signal.removeEventListener("abort", stop);
      reject(new AppError(503, "Docker 命令不可用。未在本机直接执行。"));
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(new DOMException("已停止", "AbortError"));
      else if (overflow)
        reject(new AppError(400, "命令输出超过安全上限，已停止。"));
      else {
        const stdoutTail = decoders.stdout.end();
        const stderrTail = decoders.stderr.end();
        if (stdoutTail) onOutput?.("stdout", stdoutTail);
        if (stderrTail) onOutput?.("stderr", stderrTail);
        resolve({ code: code ?? -1, stdout: stdout + stdoutTail, stderr: stderr + stderrTail });
      }
    });
  });
}
export function dockerUser() {
  return process.platform !== "win32" && process.getuid?.()
    ? String(process.getuid()) +
        ":" +
        String(process.getgid?.() ?? process.getuid())
    : "65534:65534";
}
export function dockerRunArguments(
  name: string,
  image: string,
  workspace: string,
  command: string,
  options: SandboxExecutionOptions = {},
) {
  invariant(!workspace.includes(","), 400, "资料目录含逗号，无法安全挂载。");
  const project = options.projectRoot ? resolve(options.projectRoot) : null;
  if (project) invariant(!project.includes(","), 400, "项目目录含逗号，无法安全挂载。", "workspace_path");
  const args = [
    "run",
    "--name",
    name,
    "--rm",
    "--pull=never",
    "--network",
    "none",
    "--read-only",
    "--cap-drop=ALL",
    "--security-opt",
    "no-new-privileges",
    "--pids-limit",
    "64",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "1",
    "--user",
    dockerUser(),
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    "--mount",
    "type=bind,src=" +
      join(workspace, "inputs") +
      ",dst=/workspace/inputs,readonly",
    "--mount",
    "type=bind,src=" + join(workspace, "outputs") + ",dst=/workspace/outputs",
    "--workdir",
    project ? "/workspace/project" : "/workspace/outputs",
    "--env",
    "PYTHONDONTWRITEBYTECODE=1",
    "--env",
    "PYTHONUNBUFFERED=1",
    "--env",
    "HOME=/tmp",
    "--env",
    "QSG_OUTPUTS=/workspace/outputs",
    "--env",
    "QSG_PROJECT_ROOT=" + (project ? "/workspace/project" : "/workspace/outputs"),
    image,
    "sh",
    "-lc",
    command,
  ];
  if (project) {
    const mountIndex = args.indexOf("--workdir");
    const projectMount = ["--mount", "type=bind,src=" + project + ",dst=/workspace/project," + (options.workspaceAccess === "workspace-write" ? "rw" : "readonly")];
    args.splice(mountIndex, 0, ...projectMount);
  }
  return args;
}
export class DockerSandbox implements Sandbox {
  constructor(
    private executable: string,
    private image: string,
  ) {}
  commandContext(_workspace: string, options?: SandboxExecutionOptions) {
    return "仅在本机 Docker Linux 容器运行 sh 命令，Python 可用，禁网、只读根目录和资源限制已启用。" + (options?.projectRoot ? "当前目录 /workspace/project，项目权限为 " + (options.workspaceAccess === "workspace-write" ? "可写" : "只读") + "；成果写入 /workspace/outputs。" : "当前目录 /workspace/outputs。") + "输入 /workspace/inputs 只读。生成后用 publish_file 的 outputs/相对路径登记。不可用时不能降级为普通宿主终端。";
  }
  async health(): Promise<SandboxHealth> {
    const base = {
      provider: "docker" as const,
      image: this.image,
      shell: "Linux sh",
      isolation: "container" as const,
      read_isolated: true,
      network_isolated: true,
      resource_limits: true,
      isolation_tested: false,
    };
    try {
      invariant(
        process.platform === "win32" || process.getuid?.() !== 0,
        503,
        "Linux 下请以非 root 本机用户启动服务，确保资料权限与容器用户匹配。",
      );
      const signal = AbortSignal.timeout(5000);
      const server = await capture(
        this.executable,
        ["info", "--format", "{{.OSType}}"],
        signal,
      );
      if (server.code !== 0 || server.stdout.trim() !== "linux")
        return {
          ...base,
          available: false,
          message: "Docker Linux 引擎未启动或不可用。命令工具保持关闭。",
        };
      const context = await capture(
        this.executable,
        ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        signal,
      );
      if (context.code !== 0 || !/^\s*(npipe:|unix:)/.test(context.stdout))
        return {
          ...base,
          available: false,
          message: "只支持本机 Docker 上下文，不向远端发送工作目录。",
        };
      const image = await capture(
        this.executable,
        ["image", "inspect", this.image, "--format", "{{.Id}}"],
        signal,
      );
      if (image.code !== 0)
        return {
          ...base,
          available: false,
          message: "沙箱镜像尚未准备。请由管理员拉取配置的镜像后重新检查。",
        };
      return {
        ...base,
        available: true,
        message:
          "本机 Docker 与固定镜像可用；已启用禁网、只读根目录和资源限制。实际隔离测试需单独运行。",
      };
    } catch {
      return {
        ...base,
        available: false,
        message:
          "未检测到可用 Docker 沙箱。文件工具可用，任意命令不会在本机终端执行。",
      };
    }
  }
  async execute(
    command: string,
    workspace: string,
    signal: AbortSignal,
    options: SandboxExecutionOptions = {},
  ): Promise<SandboxResult> {
    invariant(
      command.length > 0 && command.length <= 16000,
      400,
      "命令长度不合法。",
    );
    const health = await this.health();
    invariant(health.available, 503, health.message);
    const name = "suinai-" + randomUUID();
    const started = Date.now();
    try {
      const result = await capture(
        this.executable,
        dockerRunArguments(name, this.image, workspace, command, options),
        AbortSignal.any([signal, AbortSignal.timeout(60000)]),
        128000,
        options.onOutput,
      );
      return {
        exit_code: result.code,
        stdout: result.stdout,
        stderr: result.stderr,
        duration_ms: Date.now() - started,
      };
    } finally {
      await capture(
        this.executable,
        ["rm", "--force", name],
        AbortSignal.timeout(5000),
        8192,
      ).catch(() => {});
    }
  }
}

/** auto 在 Windows 选原生后端，其他平台选 Docker；选定后端失败时不切换到无限制执行。 */
export function createSandbox(config: Config): Sandbox {
  if (config.deploymentMode === "server" && !config.serverCommands) return {
    async health() { return { available: false, provider: "docker", image: "disabled", isolation_tested: false, message: "云端尚未启用命令沙箱；对话、文件和职业工具仍可使用。" }; },
    async execute() { throw new AppError(403, "云端命令执行尚未启用。", "cloud_commands_disabled"); },
  };
  invariant(config.deploymentMode !== "server" || config.sandboxProvider !== "windows-native", 500, "云端命令必须使用 Docker 隔离。");
  const provider = config.sandboxProvider === "auto"
    ? (process.platform === "win32" ? "windows-native" : "docker") : config.sandboxProvider;
  return provider === "windows-native" ? new WindowsNativeSandbox(config.dataDir)
    : new DockerSandbox(config.dockerCommand, config.dockerImage);
}
