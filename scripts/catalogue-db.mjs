/** 青穗集 · 岗位导入的数据库桥：仅访问指定主库，JSON 只作临时进程间交换。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Store } from "../agent/dist/store.js";
import { CatalogueRepository } from "../agent/dist/job-catalogue-store.js";
const [action, database, input] = process.argv.slice(2);
if (!database || !["export", "import"].includes(action)) throw new Error("Usage: catalogue-db.mjs export|import <database> [temporary-bundle]");
const store = new Store(resolve(database));
try {
  const repository = new CatalogueRepository(store);
  if (action === "export") console.log(JSON.stringify(repository.version() ? repository.read() : null));
  else {
    if (!input) throw new Error("Missing import bundle");
    const bundle = JSON.parse(readFileSync(input, "utf8"));
    const materials = bundle.materials.map(item => ({ ...item, content: Buffer.from(item.base64, "base64") }));
    console.log(JSON.stringify(repository.import(bundle.catalogue, { expectedVersion: bundle.expected_version, materials, reviewItems: bundle.review_items })));
  }
} finally { store.close(); }
