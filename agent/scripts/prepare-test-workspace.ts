/** 青穗集 · 开发测试号入口：正常注册与登录、本机预置资料、真实连接探测；凭证仅存本机状态目录。 */
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { loadConfig } from "../src/config.js";
import { Store } from "../src/store.js";
import { invariant } from "../src/errors.js";
import { prepareTestWorkspace, testUsername } from "./fixtures/test-workspace.js";
import type { Profile, User } from "../src/types.js";

const credentialsInput = z.object({
  username: z.string().regex(testUsername), password: z.string().min(12),
  issuer: z.string().url(), seedKey: z.string().min(32), registered: z.boolean(),
}).strict();
const config = loadConfig();
invariant(config.deploymentMode === "local", 403, "请在本机开发环境运行测试号准备命令。");
const origin = "http://127.0.0.1:" + config.port;
const issuer = config.officialUrl.replace(/\/+$/, "");
invariant(issuer, 400, "请先配置官方账号服务。");
let token: string | undefined;
async function request<T>(path: string, body?: unknown, timeout = 30000): Promise<T> {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST", redirect: "error",
    headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { authorization: "Bearer " + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeout),
  });
  const value: unknown = await response.json();
  invariant(response.ok, response.status, "本机请求未成功：" + path + "（" + response.status + "）。请检查服务与官方连接。");
  return value as T;
}
const authConfig = await request<{ mode: string; identity: string }>("/api/v1/auth/config");
invariant(authConfig.mode === "local" && authConfig.identity === "official", 400, "当前服务不是使用官方账号的本机开发服务。");
await mkdir(config.dataDir, { recursive: true });
const credentialPath = join(config.dataDir, "development-test-account.json");
let credentials: z.infer<typeof credentialsInput>;
try { credentials = credentialsInput.parse(JSON.parse(await readFile(credentialPath, "utf8"))); }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  credentials = { username: "suinai_test_" + randomBytes(4).toString("hex"), password: "Test-" + randomBytes(15).toString("base64url"), issuer, seedKey: randomUUID(), registered: false };
  await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + "\n", { flag: "wx", mode: 0o600 });
}
invariant(credentials.issuer === issuer, 409, "现有测试号属于另一套官方账号服务，未改动任何账号。");
const body = { username: credentials.username, password: credentials.password, external_ai_consent: true };
let session: { token: string; user: User; account: { id: number; username: string } };
if (credentials.registered) session = await request("/api/v1/auth/login", body);
else {
  // 上次注册成功但写本机标记前中断时，仅用同一份随机凭证恢复，不接管其他账号。
  try { session = await request("/api/v1/auth/login", body); }
  catch (error) {
    if (!(error instanceof Error) || !("status" in error) || ![401, 404].includes(Number(error.status))) throw error;
    session = await request("/api/v1/auth/register", body);
  }
  credentials.registered = true;
  await writeFile(credentialPath, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600 });
}
invariant(session.account.username === credentials.username && session.user.official_account?.id === session.account.id, 403, "登录返回的账号不匹配。");
token = session.token;
const profiles = await request<Profile[]>("/api/v1/agent/models");
const profile = profiles.find(value => value.mode === "official");
invariant(profile, 503, "未找到官方模型配置。");
const store = new Store(join(config.dataDir, "agent.sqlite"));
let seeded: ReturnType<typeof prepareTestWorkspace>;
try {
  seeded = prepareTestWorkspace(store, config, { userId: session.user.id, profileId: profile.id, username: credentials.username, subject: String(session.account.id), seedKey: credentials.seedKey });
} finally { store.close(); }
console.log(JSON.stringify({ username: credentials.username, credentials_file: credentialPath, ...seeded }, null, 2));
if (!profile.capabilities.chat || !profile.capabilities.tools || !profile.capabilities.tested_at) {
  console.log("正在真实测试官方模型连接……");
  const result = await request<Profile>("/api/v1/agent/models/" + profile.id + "/test", {}, config.modelTimeoutMs * 4);
  console.log(JSON.stringify({ connection: result.capabilities }, null, 2));
  invariant(result.capabilities.chat && result.capabilities.tools, 503, "测试资料已保存，但官方模型连接未完全通过，请检查 AI 连接后重试。");
}
const [career, learning, resume, conversations] = await Promise.all([
  request<{ jobs: unknown[]; skills: unknown[] }>("/api/v1/agent/career"),
  request<{ paths: { nodes: { status: string }[] }[] }>("/api/v1/agent/career/learning"),
  request<{ body: unknown; confirmed_at: string | null }>("/api/v1/agent/resume"),
  request<unknown[]>("/api/v1/agent/conversations"),
]);
invariant(career.jobs.length && learning.paths.length && resume.body && resume.confirmed_at && conversations.length >= 3, 500, "资料校验未通过，请保留现有测试号后重试。");
console.log(JSON.stringify({ verified: true, jobs: career.jobs.length, skills: career.skills.length, learning: learning.paths[0].nodes.map(node => node.status), resume_ready: true, conversations: conversations.length }, null, 2));
