/** 青穗集 · 原生沙箱回归：Windows 实际权限、跨对话边界、进程树与失败关闭。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, readFile, readdir, access, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { WindowsNativeSandbox } from "../src/native-sandbox.js";
import { nativeEnvironment } from "../src/native-process.js";
import { DockerSandbox, createSandbox } from "../src/sandbox.js";
import { loadConfig } from "../src/config.js";
import { toolDefinitionsFor } from "../src/tools.js";
const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'";

async function waitFor(file: string) {
  for (let attempt = 0; attempt < 250; attempt++) {
    try { await access(file); return; } catch { await delay(40); }
  }
  assert.fail("未在时限内收到受限子进程的启动记录");
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test("平台默认选择、显式配置和模型工具语法一致", () => {
  const config = loadConfig({ AGENT_DATA_DIR: resolve("../logs/windows-native-sandbox-20261022/config-only") });
  const selected = createSandbox(config);
  assert.ok(process.platform === "win32" ? selected instanceof WindowsNativeSandbox : selected instanceof DockerSandbox);
  assert.ok(createSandbox({ ...config, sandboxProvider: "docker" }) instanceof DockerSandbox);
  assert.throws(() => loadConfig({ AGENT_SANDBOX_PROVIDER: "unrestricted" }));
  const description = toolDefinitionsFor(new WindowsNativeSandbox(config.dataDir), "D:/data/workspaces/test")
    .find((item) => item.name === "run_command")!.description;
  assert.match(description, /Windows PowerShell 5.1/);
  assert.match(description, /读取、联网和进程可见性未完整隔离/);
  assert.doesNotMatch(description, /\/workspace\/outputs/);
});

test("原生环境白名单拒绝模型凭据、代理和 Node/PowerShell 注入参数", () => {
  const env = nativeEnvironment({ Path: "C:/Windows", SystemRoot: "C:/Windows", OPENAI_API_KEY: "fixture",
    OFFICIAL_ACCESS_TOKEN: "fixture", RELAY_UPSTREAM_API_KEY: "fixture", NODE_OPTIONS: "--require=fixture",
    NODE_PATH: "fixture", PSModulePath: "fixture", HTTPS_PROXY: "fixture", QSG_OTHER_KEY: "fixture" });
  assert.equal(env.Path, "C:/Windows");
  for (const name of ["OPENAI_API_KEY", "OFFICIAL_ACCESS_TOKEN", "RELAY_UPSTREAM_API_KEY", "NODE_OPTIONS", "NODE_PATH", "HTTPS_PROXY", "QSG_OTHER_KEY"])
    assert.equal(env[name], undefined);
  assert.doesNotMatch(env.PSModulePath!, /fixture/);
});

test("实际 Windows 原生沙箱验收（只使用自建测试资料）", { skip: process.platform !== "win32", timeout: 90000 }, async (t) => {
  const parent = resolve("../logs/windows-native-sandbox-20261022/test-data");
  await mkdir(parent, { recursive: true });
  const data = await mkdtemp(join(parent, "native-"));
  const workspace = join(data, "workspaces", randomUUID());
  const outputs = join(workspace, "outputs"), inputs = join(workspace, "inputs");
  await mkdir(outputs, { recursive: true });
  await mkdir(inputs, { recursive: true });
  const input = join(inputs, "source.txt"), canary = join(data, "outside.txt");
  await writeFile(input, "input-original");
  await writeFile(canary, "outside-original");
  const sandbox = new WindowsNativeSandbox(data);
  const health = await sandbox.health();
  await writeFile(join(data, "health.json"), JSON.stringify(health, null, 2));
  assert.equal(health.available, true, health.message);

  await t.test("真实自检诚实报告写入限制与未隔离边界，临时目录清空", async () => {
    assert.equal(health.provider, "windows-native");
    assert.equal(health.isolation_tested, true);
    assert.equal(health.read_isolated, false);
    assert.equal(health.network_isolated, false);
    assert.equal(health.resource_limits, false);
    assert.deepEqual(await readdir(join(data, "sandbox-tmp")), []);
  });

  await t.test("读取输入、写成果、Unicode 输出和非零退出码", async () => {
    const result = await sandbox.execute("[IO.File]::WriteAllText('成果.txt', [IO.File]::ReadAllText(" + quote(input) + ") + '，完成'); [Console]::WriteLine('穗奈完成'); [IO.File]::WriteAllText((Join-Path $env:TEMP 'private.txt'), 'temp-ok')", workspace, AbortSignal.timeout(15000));
    assert.equal(result.exit_code, 0, result.stderr);
    assert.equal(result.stdout.trim(), "穗奈完成");
    assert.equal(await readFile(join(outputs, "成果.txt"), "utf8"), "input-original，完成");
    assert.equal((await sandbox.execute("exit 7", workspace, AbortSignal.timeout(10000))).exit_code, 7);
    assert.deepEqual(await readdir(join(data, "sandbox-tmp")), []);
  });

  await t.test("覆盖和删除输入、写入工作区外与其他已授权对话均被拒绝", async () => {
    const sibling = join(data, "workspaces", randomUUID());
    await mkdir(join(sibling, "inputs"), { recursive: true });
    await mkdir(join(sibling, "outputs"), { recursive: true });
    assert.equal((await sandbox.execute("[IO.File]::WriteAllText('sibling.txt', 'sibling-original')", sibling, AbortSignal.timeout(10000))).exit_code, 0);
    const siblingFile = join(sibling, "outputs", "sibling.txt");
    const command = "$blocked = @(); foreach ($p in @(" + [input, canary, siblingFile].map(quote).join(", ") + ")) { try { [IO.File]::WriteAllText($p, 'FAIL'); $blocked += $false } catch { $blocked += $true } }; try { [IO.File]::Delete(" + quote(input) + "); $blocked += $false } catch { $blocked += $true }; $blocked | ConvertTo-Json -Compress";
    const result = await sandbox.execute(command, workspace, AbortSignal.timeout(10000));
    assert.equal(result.exit_code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [true, true, true, true]);
    assert.equal(await readFile(input, "utf8"), "input-original");
    assert.equal(await readFile(canary, "utf8"), "outside-original");
    assert.equal(await readFile(siblingFile, "utf8"), "sibling-original");
  });

  await t.test("真实 payload 不继承凭据类变量或 Node 注入变量", async () => {
    const previous = process.env.QSG_TEST_PROVIDER_KEY;
    process.env.QSG_TEST_PROVIDER_KEY = "fixture-only-not-real-key";
    try {
      const result = await sandbox.execute("@{ custom = [bool]$env:QSG_TEST_PROVIDER_KEY; official = [bool]$env:OFFICIAL_ACCESS_TOKEN; upstream = [bool]$env:RELAY_UPSTREAM_API_KEY; nodeOptions = [bool]$env:NODE_OPTIONS } | ConvertTo-Json -Compress", workspace, AbortSignal.timeout(10000));
      assert.equal(result.exit_code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { custom: false, official: false, upstream: false, nodeOptions: false });
    } finally {
      if (previous === undefined) delete process.env.QSG_TEST_PROVIDER_KEY;
      else process.env.QSG_TEST_PROVIDER_KEY = previous;
    }
  });

  await t.test("取消命令终止 PowerShell、Node 子进程和孙进程，撤销临时权限", async () => {
    await writeFile(join(outputs, "worker.cjs"), "const fs=require('node:fs'); fs.writeFileSync('worker.pid',String(process.pid)); setInterval(()=>fs.writeFileSync('heartbeat.txt',String(Date.now())),100);");
    await writeFile(join(outputs, "parent.cjs"), "const fs=require('node:fs'); const cp=require('node:child_process'); const child=cp.spawn(process.execPath,['worker.cjs'],{stdio:'ignore'}); fs.writeFileSync('pids.json',JSON.stringify([process.pid,child.pid])); setInterval(()=>{},1000);");
    const controller = new AbortController();
    const pending = sandbox.execute("& " + quote(process.execPath) + " 'parent.cjs'", workspace, controller.signal);
    const rejected = assert.rejects(pending, { name: "AbortError" });
    try {
      await waitFor(join(outputs, "worker.pid"));
      const pids: number[] = JSON.parse(await readFile(join(outputs, "pids.json"), "utf8"));
      assert.ok(pids.every(alive), "确认子孙进程确实启动");
      controller.abort();
      await rejected;
      await delay(150);
      assert.ok(pids.every((pid) => !alive(pid)), "停止后不能残留子孙进程");
      assert.deepEqual(await readdir(join(data, "sandbox-tmp")), []);
    } finally { controller.abort(); await pending.catch(() => {}); }
  });

  await t.test("正常命令结束时也清理后台子进程", async () => {
    await writeFile(join(outputs, "background.cjs"), "const fs=require('node:fs'); const cp=require('node:child_process'); const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync('background.pid',String(child.pid)); child.unref();");
    const result = await sandbox.execute("& " + quote(process.execPath) + " 'background.cjs'", workspace, AbortSignal.timeout(10000));
    assert.equal(result.exit_code, 0, result.stderr);
    const pid = Number(await readFile(join(outputs, "background.pid"), "utf8"));
    await delay(100);
    assert.equal(alive(pid), false);
  });

  await t.test("命令超时和输出超限都关闭进程并清理临时目录", async () => {
    const timed = new WindowsNativeSandbox(data, { timeoutMs: 1200 });
    assert.equal((await timed.health()).available, true);
    await assert.rejects(timed.execute("Start-Sleep -Seconds 10; [IO.File]::WriteAllText('late.txt','FAIL')", workspace, AbortSignal.timeout(15000)), /执行时限/);
    await assert.rejects(access(join(outputs, "late.txt")));
    const bounded = new WindowsNativeSandbox(data, { outputLimit: 2048 });
    assert.equal((await bounded.health()).available, true);
    await assert.rejects(bounded.execute("[Console]::WriteLine('x' * 20000); Start-Sleep -Seconds 10", workspace, AbortSignal.timeout(15000)), /输出超过上限/);
    assert.deepEqual(await readdir(join(data, "sandbox-tmp")), []);
  });

  await t.test("目录联接或错误工作区在执行前拒绝，不回退宿主命令", async () => {
    const linked = join(data, "workspaces", randomUUID());
    await mkdir(join(linked, "inputs"), { recursive: true });
    const outside = join(data, "junction-target");
    await mkdir(outside);
    await symlink(outside, join(linked, "outputs"), "junction");
    await assert.rejects(sandbox.execute("[IO.File]::WriteAllText('escape.txt','FAIL')", linked, AbortSignal.timeout(10000)), /目录联接/);
    await assert.rejects(access(join(outside, "escape.txt")));
    await assert.rejects(sandbox.execute("exit 0", data, AbortSignal.timeout(10000)), /当前对话/);
    const stopped = new AbortController(); stopped.abort();
    await assert.rejects(sandbox.execute("exit 0", workspace, stopped.signal), { name: "AbortError" });
    assert.deepEqual(await readdir(join(data, "sandbox-tmp")), []);
  });
});
