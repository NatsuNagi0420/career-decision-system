/** 青穗集 · 测试支架：隔离临时数据库，模型与命令均为明确标注的测试替身。 */
import { mkdtemp } from "node:fs/promises";
import { resolve, join } from "node:path";
import type { TestContext } from "node:test";
import { loadConfig } from "../src/config.js";
import { JobCatalogue } from "../src/job-catalogue.js";
import { catalogueFixture } from "./catalogue-fixture.js";
import { Store, id, now } from "../src/store.js";
import { createApp } from "../src/http.js";
import { AppError } from "../src/errors.js";
import type { Model, ModelReply, ModelRequest, Sandbox } from "../src/types.js";
export const TEST_KEY = "fixture-only-key-not-a-real-credential";
export const reply = (
  text = "测试回复",
  tool_calls: ModelReply["tool_calls"] = [],
): ModelReply => ({
  text,
  tool_calls,
  input_tokens: 10,
  output_tokens: 5,
  finish_reason: tool_calls.length ? "tool_calls" : "stop",
});
export const tool = (name: string, args: unknown) => ({
  id: "call_" + id(),
  name,
  arguments: JSON.stringify(args),
});
export class ScriptedModel implements Model {
  requests: ModelRequest[] = [];
  constructor(
    public respond: (
      request: ModelRequest,
      index: number,
    ) => Promise<ModelReply> | ModelReply = () => reply(),
  ) {}
  async complete(request: ModelRequest) {
    this.requests.push(request);
    return this.respond(request, this.requests.length - 1);
  }
}
export const noSandbox: Sandbox = {
  async health() {
    return {
      available: false,
      provider: "docker",
      image: "fixture-none",
      isolation_tested: false,
      message: "测试环境：无命令沙箱。",
    };
  },
  async execute() {
    throw new AppError(503, "测试环境：命令沙箱不可用，未执行宿主命令。");
  },
};
export async function temporary(label: string) {
  const parent = resolve(
    process.cwd(),
    "../logs/agent-foundation-implementation-20261020/unit-data",
  );
  const { mkdir } = await import("node:fs/promises");
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, label + "-"));
}
export async function fixture(
  t: TestContext,
  options: {
    model?: ScriptedModel;
    sandbox?: Sandbox;
    catalogue?: boolean;
    maxSteps?: number;
    timeout?: number;
  } = {},
) {
  const dir = await temporary("case");
  const config = loadConfig({
    AGENT_DATA_DIR: dir,
    AGENT_MAX_STEPS: String(options.maxSteps ?? 12),
    AGENT_RUN_TIMEOUT_MS: String(options.timeout ?? 180000),
  });
  const model = options.model ?? new ScriptedModel();
  const store = new Store(join(dir, "agent.sqlite"));
  if (options.catalogue) new JobCatalogue(store).repository.import(catalogueFixture(), { expectedVersion: null });
  const ctx = createApp({
    config,
    store,
    modelFactory: () => model,
    sandbox: options.sandbox ?? noSandbox,
  });
  const session = ctx.auth.register(
    "test_user",
    "Test-only-password-2026",
    true,
  );
  const user = session.user;
  const profile = await ctx.profiles.save(user, {
    name: "测试替身（不是真实模型）",
    mode: "custom",
    base_url: "https://example.invalid/v1",
    model: "fixture-only",
    api_key: TEST_KEY,
  });
  // 单元测试只验证调度，能力测试在独立模型协议用例中真实走 HTTP。
  profile.capabilities = {
    chat: true,
    tools: true,
    stream: false,
    tested_at: now(),
    note: "仅测试替身",
  };
  store.saveProfile(profile, null);
  const conversation = store.createConversation(user.id, profile.id);
  t.after(async () => {
    await ctx.app.close();
    store.close();
  });
  return {
    ...ctx,
    dir,
    config,
    model,
    user,
    profile,
    conversation,
    token: session.token,
    headers: { authorization: "Bearer " + session.token, host: "localhost" },
  };
}
