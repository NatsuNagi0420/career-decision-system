/** 青穗集 · 密钥保管：默认仅内存；Windows 长期保存采用当前用户 DPAPI，不进入提示词或日志。 */
import { spawn } from "node:child_process";
import { AppError } from "./errors.js";
const protectScript =
  "Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Text.Encoding]::UTF8.GetBytes($s); $v=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($v))";
const unprotectScript =
  "Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $v=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($v))";
function dpapi(value: string, decrypt: boolean): Promise<string> {
  if (process.platform !== "win32")
    return Promise.reject(
      new AppError(400, "当前系统未接入安全凭据存储，请选择仅本次运行保存。"),
    );
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(
          decrypt ? unprotectScript : protectScript,
          "utf16le",
        ).toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    let out = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new AppError(500, "系统凭据存储响应超时。"));
    }, 10000);
    child.stdout.on("data", (b) => {
      out += b.toString("utf8");
      if (out.length > 32768) child.kill();
    });
    child.stderr.on("data", () => {});
    child.on("error", () => {
      clearTimeout(timer);
      reject(new AppError(500, "系统凭据存储不可用，请选择仅本次运行保存。"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new AppError(500, "系统凭据存储未完成，未以明文保存。"));
    });
    child.stdin.end(value, "utf8");
  });
}
export class Secrets {
  private values = new Map<string, { userId: number; key: string }>();
  private guards = new Set<string>();
  protect(key: string) {
    if (key) this.guards.add(key);
  }
  private keys() {
    return [
      ...this.guards,
      ...[...this.values.values()].map((value) => value.key),
    ];
  }
  redactValue(value: unknown): unknown {
    if (typeof value === "string") return this.redact(value);
    if (Array.isArray(value))
      return value.map((item) => this.redactValue(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.redactValue(item),
        ]),
      );
    return value;
  }
  redactChunk(text: string, final = false) {
    text = this.redact(text);
    let held = 0;
    for (const key of this.keys())
      for (
        let size = Math.min(key.length - 1, text.length);
        size > held;
        size--
      )
        if (text.endsWith(key.slice(0, size))) {
          held = size;
          break;
        }
    if (final)
      return {
        safe:
          this.redact(text.slice(0, text.length - held)) +
          (held ? "[已隐藏密钥片段]" : ""),
        rest: "",
      };
    return {
      safe: this.redact(text.slice(0, text.length - held)),
      rest: held ? text.slice(-held) : "",
    };
  }
  async save(
    userId: number,
    profileId: string,
    key: string,
    remember: boolean,
  ) {
    const encrypted = remember ? "dpapi:" + (await dpapi(key, false)) : null;
    this.values.set(profileId, { userId, key });
    return encrypted;
  }
  async get(
    userId: number,
    profileId: string,
    encrypted: string | null,
  ): Promise<string | null> {
    const cached = this.values.get(profileId);
    if (cached?.userId === userId) return cached.key;
    if (encrypted?.startsWith("dpapi:")) {
      const key = await dpapi(encrypted.slice(6), true);
      this.values.set(profileId, { userId, key });
      return key;
    }
    return null;
  }
  forget(profileId: string) {
    this.values.delete(profileId);
  }
  clear(userId: number) {
    for (const [key, value] of this.values)
      if (value.userId === userId) this.values.delete(key);
  }
  redact(text: string) {
    let value = text;
    for (const key of this.keys())
      if (key) value = value.split(key).join("[已隐藏密钥]");
    return value.replace(/Bearer\s+[^\s"']+/gi, "Bearer [已隐藏]");
  }
}
