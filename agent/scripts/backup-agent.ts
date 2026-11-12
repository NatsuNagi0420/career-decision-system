/** 青穗集 · 本机 Agent 状态备份：快照 SQLite 与本机成果目录，不备份绑定的用户源码项目。 */
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { access, cp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { configuredLocalStateDir } from "../src/local-state-path.js";

const source = configuredLocalStateDir(process.env.AGENT_DATA_DIR, "agent");
const stamp = new Date().toISOString().replace(/[.:]/g, "-");
const requested = process.argv[2]?.trim();
const target = resolve(requested || join(process.cwd(), "backups", "agent-" + stamp));
const sourceKey = source.replaceAll("\\", "/").toLowerCase();
const targetKey = target.replaceAll("\\", "/").toLowerCase();
const inside = targetKey === sourceKey || targetKey.startsWith(sourceKey + "/");
if (inside) throw new Error("备份目录不能放在 Agent 状态目录内部。");

await access(join(source, "agent.sqlite"));
try {
  await access(target);
  throw new Error("备份目录已经存在，请指定一个新的空目录，避免混合两次备份。");
} catch (error) {
  if (error instanceof Error && error.message.includes("备份目录已经存在")) throw error;
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await mkdir(target, { recursive: true });
const databaseTarget = join(target, "agent.sqlite");
const escaped = databaseTarget.replaceAll("'", "''");
const db = new DatabaseSync(join(source, "agent.sqlite"));
try {
  db.exec("PRAGMA busy_timeout=10000;");
  db.exec("VACUUM INTO '" + escaped + "'");
} finally {
  db.close();
}

const copied: string[] = ["agent.sqlite"];
for (const directory of ["workspaces", "artifacts", "local-open", "project-edits"]) {
  const from = join(source, directory);
  try {
    await access(from);
  } catch {
    continue;
  }
  await cp(from, join(target, directory), { recursive: true, force: false, errorOnExist: false });
  copied.push(directory);
}

const manifest = {
  format: 1,
  created_at: new Date().toISOString(),
  source,
  target,
  database: "agent.sqlite",
  copied,
  note: "SQLite 使用 VACUUM INTO 生成一致快照；成果目录在快照期间按文件复制。恢复前应停止 8110，并保留当前状态目录。绑定的用户源码项目不在备份内。",
};
await writeFile(join(target, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ ok: true, path: target, copied }, null, 2));

