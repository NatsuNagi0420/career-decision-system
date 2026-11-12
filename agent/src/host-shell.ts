/** 青穗集 · 显式完全访问终端：仅按本轮已确认权限启用，不继承模型密钥或提升系统权限。 */
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { captureNative, nativeEnvironment, powershellArguments, windowsPowerShell } from "./native-process.js";
import type { Sandbox, SandboxExecutionOptions, SandboxHealth, SandboxResult } from "./types.js";
export class HostShell implements Sandbox {
  async health(): Promise<SandboxHealth> {
    return { available: true, provider: "local-full-access", image: "", isolation_tested: false, read_isolated: false, network_isolated: false, resource_limits: false, message: "完全访问：使用当前系统用户的本机终端，不提供文件或网络隔离。" };
  }
  commandContext(_workspace: string, options?: SandboxExecutionOptions) {
    return [
      "当前由用户明确开启完全访问。命令使用当前系统用户权限，不自动提升管理员权限。",
      process.platform === "win32" ? "终端为 Windows PowerShell 5.1，不使用 bash 语法。" : "终端为 /bin/sh。",
      options?.projectRoot ? "工作目录为绑定的本机项目根目录；会话成果目录通过 $env:QSG_OUTPUTS 访问。" : "工作目录为当前会话 outputs 目录。",
      "可以访问当前用户有权限访问的本机路径与网络，但只操作用户当前任务明确需要的资料。权限选择不等于批量读取私人文件的授权；删除、覆盖重要文件、安装软件等高风险操作前先 ask_user 征求明确确认。",
      "每次最多 60 秒，输出最多 128000 字节。不要读取模型配置、密钥、会话数据库或修改应用自身安全设置。",
      "生成的成果请写入当前 outputs 目录，再用 publish_file 登记。导出仍需 request_export 确认。",
    ].join(" ");
  }
  async execute(command: string, workspace: string, signal: AbortSignal, options: SandboxExecutionOptions = {}): Promise<SandboxResult> {
    const started = Date.now();
    const limited = AbortSignal.any([signal, AbortSignal.timeout(60000)]);
    const windows = process.platform === "win32";
    const cwd = options.projectRoot ?? join(options.sessionRoot ?? workspace, "outputs");
    const wrapped = windows
      ? "$env:QSG_OUTPUTS = '" + join(options.sessionRoot ?? workspace, "outputs").replaceAll("'", "''") + "'; $env:QSG_PROJECT_ROOT = '" + (options.projectRoot ?? workspace).replaceAll("'", "''") + "';\n" + command
      : command;
    const result = await captureNative(windows ? windowsPowerShell() : "/bin/sh", windows ? powershellArguments(wrapped) : ["-c", "QSG_OUTPUTS='" + join(options.sessionRoot ?? workspace, "outputs") + "' QSG_PROJECT_ROOT='" + (options.projectRoot ?? workspace) + "' " + command], cwd, limited, {
      env: { ...nativeEnvironment(), HOME: homedir(), USERPROFILE: homedir(), TEMP: tmpdir(), TMP: tmpdir() },
      onOutput: options.onOutput,
    });
    return { exit_code: result.code, stdout: result.stdout, stderr: result.stderr, duration_ms: Date.now() - started };
  }
}
