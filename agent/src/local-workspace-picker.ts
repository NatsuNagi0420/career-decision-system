/** 青穗集 · 本机工作区选择器：只由用户点击触发，不接受模型命令或任意 shell 片段。 */
import { spawn } from "node:child_process";
import { AppError } from "./errors.js";

export type LocalWorkspacePicker = () => Promise<string | null>;

const FOLDER_DIALOG_SCRIPT = [
  "Add-Type -AssemblyName System.Windows.Forms",
  // 把目录选择器挂到当前前台窗口上；否则 PowerShell 隐藏进程创建的对话框可能落到浏览器后面。C# 只引用 System，避免 Windows PowerShell 5.1 的 Forms 引用差异。
  "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class QingsuijiNative { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr handle); }' -Language CSharp",
  "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
  "$ownerHandle = [QingsuijiNative]::GetForegroundWindow()",
  "$owner = if ($ownerHandle -ne [IntPtr]::Zero) { $window = New-Object System.Windows.Forms.NativeWindow; $window.AssignHandle($ownerHandle); $window } else { $null }",
  "if ($owner) { [QingsuijiNative]::SetForegroundWindow($ownerHandle) | Out-Null }",
  "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
  "$dialog.Description = '选择项目工作区'",
  "$dialog.ShowNewFolderButton = $false",
  "$result = if ($owner) { $dialog.ShowDialog($owner) } else { $dialog.ShowDialog() }",
  "if ($owner) { $owner.ReleaseHandle() }",
  "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::WriteLine($dialog.SelectedPath) }",
].join("; ");

export const pickLocalWorkspace: LocalWorkspacePicker = () => new Promise((resolve, reject) => {
  if (process.platform !== "win32") {
    reject(new AppError(503, "本机目录选择仅支持 Windows 桌面版。", "workspace_picker_unavailable"));
    return;
  }
  const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-Command", FOLDER_DIALOG_SCRIPT], {
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let settled = false;
  const finish = (callback: () => void) => {
    if (settled) return;
    settled = true;
    callback();
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { if (stdout.length < 4096) stdout += String(chunk); });
  child.stderr.on("data", chunk => { if (stderr.length < 4096) stderr += String(chunk); });
  child.once("error", () => finish(() => reject(new AppError(503, "无法打开本机目录选择器。", "workspace_picker_failed"))));
  child.once("close", code => finish(() => {
    if (code !== 0) {
      reject(new AppError(503, "本机目录选择器没有正常完成。" + (stderr.trim() ? " " + stderr.trim().slice(0, 300) : ""), "workspace_picker_failed"));
      return;
    }
    const selected = stdout.trim();
    resolve(selected || null);
  }));
});
