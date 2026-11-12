/** 青穗集 · Windows 发行构建：白名单打包、官方 Node 校验、公共岗位导出、启动器与安装向导。 */
import { promises as fs, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const flags = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (key === "--skip-build") flags.set(key, true);
  else if (["--node-archive", "--inno", "--catalogue-db", "--output"].includes(key) && process.argv[i + 1]) flags.set(key, process.argv[++i]);
  else throw Error("不支持的参数：" + key);
}
if (process.platform !== "win32" || process.arch !== "x64") throw Error("此构建入口需要 Windows x64；不影响现有 Linux 云端构建。");
const { version } = JSON.parse(await fs.readFile(join(root, "package.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error("Windows 发行版本必须为三段数字。");
const nodeVersion = "22.23.4";
const nodeHash = "cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20";
const output = resolve(flags.get("--output") || join(root, "dist/windows", version));
const payload = join(output, "portable");
const cache = join(root, "dist/.release-cache");
await fs.mkdir(output, { recursive: true });
await fs.mkdir(cache, { recursive: true });
// 不覆盖已有交付；使用明确的新输出目录，避免误删或混入旧版文件。
try { await fs.access(payload); throw Error("输出目录已存在，请选择新的 --output；未删除旧产物。" ); } catch (error) { if (error.code !== "ENOENT") throw error; }
await fs.mkdir(payload, { recursive: true });
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
function run(file, args, options = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(file, args, { cwd: root, windowsHide: true, stdio: "inherit", ...options });
    child.once("error", reject); child.once("exit", code => code === 0 ? accept() : reject(Error(file + " exited " + code)));
  });
}
async function digest(file) { const hash = createHash("sha256"); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest("hex"); }
async function files(directory) {
  const result = [];
  for (const item of await fs.readdir(directory, { withFileTypes: true })) {
    const file = join(directory, item.name);
    if (item.isSymbolicLink()) throw Error("发行目录不接受符号链接：" + relative(payload, file));
    if (item.isDirectory()) result.push(...await files(file)); else result.push(file);
  }
  return result;
}
if (!flags.has("--skip-build")) {
  await run(process.execPath, [npmCli, "--prefix", "agent", "run", "build:desktop"]);
  await run(process.execPath, [npmCli, "--prefix", "web", "run", "build"]);
}
const archive = resolve(flags.get("--node-archive") || join(cache, "node-v" + nodeVersion + "-win-x64.zip"));
if (await digest(archive) !== nodeHash) throw Error("Node 运行环境 SHA256 不符合已核对的官方值。");
const extract = join(cache, "node-v" + nodeVersion);
try { await fs.access(join(extract, "node-v" + nodeVersion + "-win-x64/node.exe")); }
catch { await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:QINGSUIJI_NODE_ARCHIVE -DestinationPath $env:QINGSUIJI_NODE_EXTRACT -Force"], { env: { ...process.env, QINGSUIJI_NODE_ARCHIVE: archive, QINGSUIJI_NODE_EXTRACT: extract } }); }
await fs.mkdir(join(payload, "runtime"), { recursive: true });
for (const name of ["node.exe", "LICENSE"]) await fs.copyFile(join(extract, "node-v" + nodeVersion + "-win-x64", name), join(payload, "runtime", name));
const packageFile = JSON.parse(await fs.readFile(join(root, "agent/package.json"), "utf8"));
const lockText = await fs.readFile(join(root, "agent/package-lock.json"), "utf8");
const lockKey = createHash("sha256").update(lockText).digest("hex").slice(0, 16);
const deps = join(cache, "production-" + lockKey);
await fs.mkdir(deps, { recursive: true });
try { await fs.access(join(deps, "complete")); }
catch {
  await fs.copyFile(join(root, "agent/package.json"), join(deps, "package.json"));
  await fs.writeFile(join(deps, "package-lock.json"), lockText);
  await run(process.execPath, [npmCli, "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: deps });
  await fs.writeFile(join(deps, "complete"), "production dependencies only\n");
}
await fs.mkdir(join(payload, "app/agent/dist"), { recursive: true });
await fs.cp(join(deps, "node_modules"), join(payload, "app/agent/node_modules"), { recursive: true, filter: file => !/(?:^|[/\\])(?:test|tests|__tests__|\.github|\.bin)(?:[/\\]|$)/i.test(relative(deps, file)) });
await fs.writeFile(join(payload, "app/agent/package.json"), JSON.stringify({ name: packageFile.name, version, private: true, type: "module", dependencies: packageFile.dependencies }, null, 2) + "\n");
// 使用编译后的实际 ESM 引用闭包，只分发本机可达代码；不复制整个 dist 或仓库。
const esbuild = await import(pathToFileURL(join(root, "web/node_modules/esbuild/lib/main.js")).href);
const compilation = join(root, "agent/dist/local");
const graph = await esbuild.build({ entryPoints: [join(compilation, "desktop.js")], absWorkingDir: root, bundle: true, platform: "node", format: "esm", packages: "external", write: false, metafile: true, logLevel: "silent" });
let sourceCount = 0;
for (const input of Object.keys(graph.metafile.inputs)) {
  const source = resolve(root, input), tail = relative(compilation, source);
  if (tail.startsWith("..") || tail.includes("relay") || ["hub.js", "cloud.js", "systemone.js"].includes(tail)) throw Error("本机引用了不应发布的模块：" + tail);
  await fs.mkdir(dirname(join(payload, "app/agent/dist", tail)), { recursive: true });
  await fs.copyFile(source, join(payload, "app/agent/dist", tail)); sourceCount++;
}
await fs.cp(join(root, "web/dist"), join(payload, "app/web/dist"), { recursive: true });
await fs.cp(join(root, "assets/web"), join(payload, "app/assets/web"), { recursive: true });
const dbPath = flags.get("--catalogue-db");
if (!dbPath) throw Error("必须明确提供 --catalogue-db；构建器只读导出公共 catalogue 表，不打包用户数据库。");
const db = new DatabaseSync(resolve(dbPath), { readOnly: true });
let catalogue;
try {
  const state = db.prepare("SELECT data FROM catalogue_state WHERE id=1").get();
  if (!state) throw Error("指定库未包含岗位参考库。");
  catalogue = { ...JSON.parse(state.data), directions: db.prepare("SELECT data FROM catalogue_directions ORDER BY position").all().map(row => JSON.parse(row.data)), jobs: db.prepare("SELECT data FROM catalogue_jobs ORDER BY position").all().map(row => JSON.parse(row.data)), batches: db.prepare("SELECT data FROM catalogue_batches ORDER BY rowid").all().map(row => JSON.parse(row.data)) };
} finally { db.close(); }
const { catalogueFileSchema } = await import(pathToFileURL(join(compilation, "job-catalogue-schema.js")).href);
catalogue = catalogueFileSchema.parse(catalogue);
await fs.mkdir(join(payload, "app/resources"), { recursive: true });
await fs.writeFile(join(payload, "app/resources/job-catalogue.json"), JSON.stringify(catalogue));
await fs.copyFile(join(root, "desktop/windows/Qingsuiji.ico"), join(payload, "Qingsuiji.ico"));
const csc = join(process.env.WINDIR || "C:/Windows", "Microsoft.NET/Framework64/v4.0.30319/csc.exe");
await run(csc, ["/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/utf8output", "/out:" + join(payload, "Qingsuiji.exe"), "/win32icon:" + join(payload, "Qingsuiji.ico"), "/win32manifest:" + join(root, "desktop/windows/Launcher.manifest"), "/reference:System.dll", "/reference:System.Core.dll", "/reference:System.Drawing.dll", "/reference:System.Windows.Forms.dll", "/reference:System.Web.Extensions.dll", join(root, "desktop/windows/Launcher.cs")]);
await fs.writeFile(join(payload, "release.json"), JSON.stringify({ product: "Qingsuiji", version, platform: "windows-x64", node: nodeVersion, catalogue_version: catalogue.version, catalogue_jobs: catalogue.jobs.length, built_at: new Date().toISOString() }, null, 2) + "\n");
await fs.writeFile(join(payload, "使用说明.txt"), "青穗集 · Windows 内测版\r\n\r\n双击 Qingsuiji.exe 启动，浏览器会自动打开。\r\n关闭网页后服务仍在后台运行；在任务栏托盘右键青穗集，选择“完全退出”。\r\n登录后网页左侧也有“完全退出”。\r\n更新和卸载默认保留聊天、画像与成果，不删除绑定的原始项目。\r\n官方模型需要联网；也可以在界面配置自己的 API Key。\r\n支持 Windows 10 2004 及以上 / Windows 11 x64；第三方命令工具未随包预装。\r\n");
const items = await files(payload);
const forbidden = items.filter(file => /(^|[/\\])(?:\.env(?:\..*)?|[^/\\]*\.sqlite(?:-wal|-shm)?|id_rsa|id_ed25519|[^/\\]*\.pem)$/i.test(relative(payload, file)) || /(^|[/\\])(?:test|tests|logs|backups|\.git)([/\\])/i.test(relative(payload, file)));
if (forbidden.length) throw Error("发行包含禁止文件：" + forbidden.map(file => relative(payload, file)).join(", "));
const notices = ["青穗集 · 随包第三方许可索引", "Node.js：runtime/LICENSE", "Windows 原生限制使用 MIT 组件 @deepseek-ai/dsh-sandbox-windows-acl；各依赖包内保留原始许可。"];
for (const file of items.filter(file => /[/\\](?:LICENSE(?:\.[^/\\]+)?|COPYING)$/i.test(file))) notices.push(relative(payload, file).split(sep).join("/"));
await fs.writeFile(join(payload, "THIRD_PARTY_NOTICES.txt"), notices.join("\r\n") + "\r\n");
const sums = [];
for (const file of (await files(payload)).sort()) sums.push(await digest(file) + "  " + relative(payload, file).split(sep).join("/"));
await fs.writeFile(join(payload, "SHA256SUMS.txt"), sums.join("\n") + "\n");
const iscc = resolve(flags.get("--inno") || process.env.INNO_SETUP_COMPILER || join(process.env.LOCALAPPDATA, "Programs/Inno Setup 7/ISCC.exe"));
await run(iscc, ["/Q", "/DAppVersion=" + version, "/DPayloadDir=" + payload, "/DOutputDir=" + output, join(root, "desktop/windows/installer.iss")]);
const zip = join(output, "Qingsuiji-" + version + "-windows-x64-portable.zip");
await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Compress-Archive -Path (Join-Path $env:QINGSUIJI_PAYLOAD '*') -DestinationPath $env:QINGSUIJI_ZIP -CompressionLevel Fastest"], { env: { ...process.env, QINGSUIJI_PAYLOAD: payload, QINGSUIJI_ZIP: zip } });
const installer = join(output, "Qingsuiji-" + version + "-windows-x64-setup.exe");
const report = { version, node: nodeVersion, public_catalogue_jobs: catalogue.jobs.length, local_modules: sourceCount, payload_files: sums.length, excludes: ["development .env", "user databases", "chat logs", "cloud relay modules", "test fixtures"], installer: { name: relative(output, installer), sha256: await digest(installer), bytes: (await fs.stat(installer)).size }, portable: { name: relative(output, zip), sha256: await digest(zip), bytes: (await fs.stat(zip)).size }, signed: false };
await fs.writeFile(join(output, "build-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
