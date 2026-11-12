/** 青穗集 · Windows 发行冒烟：隔离数据目录验证启动、单实例、网页退出和资料保留，不调用付费模型。 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const payload = resolve(process.argv[2] || join(root, "dist/windows/0.1.0/portable"));
const logRoot = resolve(process.argv[3] || join(root, "logs/windows-installer-20261030"));
await fs.mkdir(logRoot, { recursive: true });
const state = await fs.mkdtemp(join(logRoot, "独立 数据-"));
await fs.writeFile(join(state, "keep.txt"), "isolated synthetic lifecycle fixture\n");
const launcher = join(payload, "Qingsuiji.exe");
const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening"); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = "http://127.0.0.1:" + port;
const records = [];
let child;
function start() { child = spawn(launcher, ["--headless", "--no-browser", "--data-dir", state, "--port", String(port)], { windowsHide: true, stdio: "ignore" }); return child; }
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error("Launcher exited before ready: " + child.exitCode);
    try { const response = await fetch(origin + "/api/v1/desktop", { signal: AbortSignal.timeout(1000) }); if (response.ok && (await response.json()).managed) return; } catch {}
    await delay(200);
  }
  throw Error("Desktop readiness timeout; inspect " + join(state, "desktop-logs/launcher.log"));
}
async function command(args) { const p = spawn(launcher, args.concat(["--headless", "--data-dir", state]), { windowsHide: true, stdio: "ignore" }); const [code] = await once(p, "exit"); assert.equal(code, 0); }
async function stopped() {
  if (child.exitCode === null) await Promise.race([once(child, "exit"), delay(35000, undefined, { ref: false }).then(() => { throw Error("Shutdown did not complete"); })]);
  assert.equal(child.exitCode, 0);
  let open = false;
  try { open = (await fetch(origin + "/healthz", { signal: AbortSignal.timeout(1000) })).ok; } catch {}
  assert.equal(open, false, "本机端口应已停止监听");
}
try {
  start(); await waitReady(); records.push("Unicode/space data directory and bundled runtime started");
  assert.match(await (await fetch(origin)).text(), /<html/i);
  assert.equal((await fetch(origin + "/api/assets/brand/account/sprout.webp")).status, 200);
  records.push("Production WebUI and backend image assets available without Vite");
  const response = await fetch(origin + "/api/v1/auth/bootstrap", { method: "POST", headers: { Origin: origin } });
  assert.equal(response.status, 200);
  const session = await response.json(); assert.ok(session.token);
  const info = await (await fetch(origin + "/api/v1/agent/info", { headers: { Authorization: "Bearer " + session.token } })).json();
  assert.equal(info.deployment_mode, "local"); assert.equal(info.file_workspace.project_workspaces, true);
  assert.equal(info.official_configured, true);
  assert.equal(info.sandbox.available, true, "随包 Windows 原生后端应可用：" + info.sandbox.message);
  records.push("Bundled native Windows backend loaded and passed its normal readiness check");
  records.push("Local device session and public official gateway configured; no upstream key bundled");
  await command(["--no-browser"]); assert.equal(child.exitCode, null); records.push("Repeated launch reused the running instance");
  const quit = await fetch(origin + "/api/v1/desktop/quit", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Authorization: "Bearer " + session.token }, body: JSON.stringify({ confirmed: true }) });
  assert.equal(quit.status, 200); await stopped(); records.push("WebUI full exit stopped launcher and local listening service");
  assert.match(await fs.readFile(join(state, "desktop-logs/launcher.log"), "utf8"), /QINGSUIJI_STOPPED/);
  const db = new DatabaseSync(join(state, "agent.sqlite"), { readOnly: true });
  const counts = { jobs: Number(db.prepare("SELECT count(*) AS n FROM catalogue_jobs").get().n), users: Number(db.prepare("SELECT count(*) AS n FROM users").get().n), imports: Number(db.prepare("SELECT count(*) AS n FROM catalogue_imports").get().n) }; db.close();
  assert.equal(counts.jobs, JSON.parse(await fs.readFile(join(payload, "release.json"), "utf8")).catalogue_jobs); assert.equal(counts.users, 1); assert.equal(counts.imports, 1);
  records.push("Only public catalogue seeded; one synthetic device account, no developer accounts");
  start(); await waitReady(); await command(["--quit", "--wait"]); await stopped();
  assert.equal(await fs.readFile(join(state, "keep.txt"), "utf8"), "isolated synthetic lifecycle fixture\n");
  const after = new DatabaseSync(join(state, "agent.sqlite"), { readOnly: true });
  assert.equal(Number(after.prepare("SELECT count(*) AS n FROM catalogue_imports").get().n), 1); after.close();
  records.push("Restart and tray-equivalent quit preserved account/database and did not re-import catalogue");
  const occupied = createServer(); occupied.listen(0, "127.0.0.1"); await once(occupied, "listening");
  try {
    const conflict = spawn(launcher, ["--headless", "--no-browser", "--data-dir", state, "--port", String(occupied.address().port)], { windowsHide: true, stdio: "ignore" });
    const [code] = await once(conflict, "exit"); assert.equal(code, 1); assert.equal(occupied.listening, true);
    records.push("Occupied port reported clearly without adopting or stopping another service");
  } finally { await new Promise(resolve => occupied.close(resolve)); }

  const result = { ok: true, paid_model_calls: 0, data_directory: state, checks: records };
  await fs.writeFile(join(logRoot, "desktop-smoke.json"), JSON.stringify(result, null, 2) + "\n"); console.log(JSON.stringify(result, null, 2));
} finally {
  if (child && child.exitCode === null) await command(["--quit", "--wait"]).catch(() => child.kill());
}
