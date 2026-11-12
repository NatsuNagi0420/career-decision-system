/** 青穗集 · Cloud Hub 一致性备份：只处理专用备份目录，不输出资料内容。 */
import { DatabaseSync, backup } from "node:sqlite";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
const root = "/var/backups/qingsuiji/agent";
await mkdir(root, { recursive: true, mode: 0o700 });
const target = join(root, "hub-" + new Date().toISOString().replace(/[:.]/g, "-") + ".sqlite");
const db = new DatabaseSync("/var/lib/qingsuiji/agent/agent.sqlite", { readOnly: true });
try { await backup(db, target); } finally { db.close(); }
const files = (await readdir(root)).filter(name => /^hub-\d{4}-\d{2}-\d{2}T[\dTZ-]+\.sqlite$/.test(name)).sort().reverse();
for (const name of files.slice(7)) {
  const path = resolve(root, name);
  if (dirname(path) !== root) throw new Error("备份路径异常");
  if ((await stat(path)).isFile()) await unlink(path);
}
console.log("Cloud Hub backup completed");
