/** 青穗集 · 本机状态目录：把账号、会话和中转配额放在用户应用数据区，避免污染项目工作区。 */
import { homedir } from "node:os";
import { mkdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

type LocalStateKind = "agent" | "relay";

function baseStateDir(env: NodeJS.ProcessEnv) {
  if (process.platform === "win32")
    return env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  return env.XDG_STATE_HOME?.trim() || join(homedir(), ".local", "state");
}

function pathKey(value: string) {
  return process.platform === "win32" ? value.replaceAll("\\", "/").toLowerCase() : value.replaceAll("\\", "/");
}

export function defaultLocalStateDir(kind: LocalStateKind, env: NodeJS.ProcessEnv = process.env) {
  const candidate = resolve(join(baseStateDir(env), "Qingsuiji", kind));
  if (process.platform !== "win32") return candidate;
  try {
    mkdirSync(candidate, { recursive: true });
    // 某些桌面沙箱会把 AppData\Local 重定向到包缓存；原生 ACL 沙箱必须拒绝这类路径。
    const actual = process.platform === "win32" ? realpathSync.native(candidate) : realpathSync(candidate);
    if (pathKey(actual) !== pathKey(candidate))
      return resolve(join(homedir(), "Qingsuiji", kind));
  } catch {
    return resolve(join(homedir(), "Qingsuiji", kind));
  }
  return candidate;
}

export function configuredLocalStateDir(value: string | undefined, kind: LocalStateKind, env: NodeJS.ProcessEnv = process.env) {
  const configured = value?.trim();
  return resolve(configured || defaultLocalStateDir(kind, env));
}
