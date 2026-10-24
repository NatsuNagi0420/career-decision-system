/** 青穗集 · 统一主库中的岗位持久化：事务导入、版本冲突保护、原始交付与待审记录，不读取运行时 JSON 副本。 */
import { createHash } from "node:crypto";
import { catalogueFileSchema } from "./job-catalogue-schema.js";
import type { z } from "zod";
import { invariant } from "./errors.js";
import { now, type Store } from "./store.js";

export type CatalogueFile = z.infer<typeof catalogueFileSchema>;
export type CatalogueMaterial = { key: string; batch_id: string; kind: string; content: Uint8Array };
export type CatalogueReviewItem = { id: string; batch_id: string; kind: "lead" | "quarantine"; data: unknown };
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
function fingerprint(data: CatalogueFile) {
  const { exported_at: _date, ...content } = data;
  return sha256(JSON.stringify(content));
}
export class CatalogueRepository {
  constructor(readonly store: Store) {
    store.db.exec([
      "CREATE TABLE IF NOT EXISTS catalogue_state(id INTEGER PRIMARY KEY CHECK(id=1),version TEXT NOT NULL,digest TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)));",
      "CREATE TABLE IF NOT EXISTS catalogue_directions(code TEXT PRIMARY KEY,position INTEGER NOT NULL UNIQUE,data TEXT NOT NULL CHECK(json_valid(data)));",
      "CREATE TABLE IF NOT EXISTS catalogue_batches(id TEXT PRIMARY KEY,archive_sha256 TEXT NOT NULL UNIQUE,data TEXT NOT NULL CHECK(json_valid(data)));",
      "CREATE TABLE IF NOT EXISTS catalogue_jobs(id TEXT PRIMARY KEY,position INTEGER NOT NULL UNIQUE,content_hash TEXT NOT NULL,data_kind TEXT NOT NULL CHECK(data_kind IN ('historical','collected')),batch_id TEXT REFERENCES catalogue_batches(id),data TEXT NOT NULL CHECK(json_valid(data)));",
      "CREATE INDEX IF NOT EXISTS catalogue_jobs_by_batch ON catalogue_jobs(batch_id);",
      "CREATE INDEX IF NOT EXISTS catalogue_jobs_by_kind ON catalogue_jobs(data_kind);",
      "CREATE INDEX IF NOT EXISTS catalogue_jobs_by_hash ON catalogue_jobs(content_hash);",
      "CREATE TABLE IF NOT EXISTS catalogue_materials(key TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES catalogue_batches(id),kind TEXT NOT NULL,sha256 TEXT NOT NULL,content BLOB NOT NULL);",
      "CREATE TABLE IF NOT EXISTS catalogue_review_queue(id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES catalogue_batches(id),kind TEXT NOT NULL CHECK(kind IN ('lead','quarantine')),data TEXT NOT NULL CHECK(json_valid(data)));",
      "CREATE TABLE IF NOT EXISTS catalogue_imports(version TEXT PRIMARY KEY,previous_version TEXT,imported_at TEXT NOT NULL,sample_count INTEGER NOT NULL,digest TEXT NOT NULL);",
    ].join("\n"));
  }
  version(): string | null {
    return (this.store.db.prepare("SELECT version FROM catalogue_state WHERE id=1").get()?.version as string | undefined) ?? null;
  }
  read(): CatalogueFile {
    // 一个 SQL 语句读取一致视图，避免另一进程导入恰好落在多次 SELECT 之间。
    const state = this.store.db.prepare([
      "SELECT data,version,digest,",
      "(SELECT json_group_array(json(data)) FROM (SELECT data FROM catalogue_directions ORDER BY position)) AS directions,",
      "(SELECT json_group_array(json(data)) FROM (SELECT data FROM catalogue_jobs ORDER BY position)) AS jobs,",
      "(SELECT json_group_array(json(data)) FROM (SELECT data FROM catalogue_batches ORDER BY rowid)) AS batches",
      "FROM catalogue_state WHERE id=1",
    ].join(" ")).get();
    invariant(state, 503, "主数据库尚未导入岗位参考库；没有使用演示数据或文件副本替代。", "catalogue_unavailable");
    try {
      const data = catalogueFileSchema.parse({ ...JSON.parse(state.data as string),
        directions: JSON.parse(state.directions as string), jobs: JSON.parse(state.jobs as string), batches: JSON.parse(state.batches as string) });
      invariant(state.version === data.version && fingerprint(data) === state.digest, 503, "岗位库完整性不符。", "catalogue_unavailable");
      return data;
    } catch {
      invariant(false, 503, "主数据库中的岗位资料校验失败，请从备份恢复或重新导入；未静默切换旧副本。", "catalogue_unavailable");
    }
  }
  import(input: unknown, options: { expectedVersion: string | null; materials?: CatalogueMaterial[]; reviewItems?: CatalogueReviewItem[] }) {
    const data = catalogueFileSchema.parse(input), digest = fingerprint(data);
    return this.store.transaction(() => {
      const previous = this.store.db.prepare("SELECT version,digest FROM catalogue_state WHERE id=1").get();
      const same = previous?.version === data.version;
      invariant(!same || previous.digest === digest, 409, "同一岗位版本对应了不同内容，拒绝覆盖。", "catalogue_version_conflict");
      invariant(same || (previous?.version ?? null) === options.expectedVersion, 409, "岗位库已被其他导入更新，请重新读取后合并。", "catalogue_version_conflict");
      if (!same) {
        const ids = new Set(data.jobs.map(job => job.id)), batches = new Set(data.batches.map(batch => batch.id));
        invariant(this.store.db.prepare("SELECT id FROM catalogue_jobs").all().every(row => ids.has(row.id as string)), 409, "导入不能丢弃已有岗位标识；请先合并当前数据库。", "catalogue_missing_existing");
        invariant(this.store.db.prepare("SELECT id FROM catalogue_batches").all().every(row => batches.has(row.id as string)), 409, "导入不能丢弃原始批次。", "catalogue_missing_existing");
        const batchInsert = this.store.db.prepare("INSERT INTO catalogue_batches(id,archive_sha256,data) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data");
        for (const batch of data.batches) {
          const old = this.store.db.prepare("SELECT archive_sha256 FROM catalogue_batches WHERE id=?").get(batch.id);
          invariant(!old || old.archive_sha256 === batch.archive_sha256, 409, "来源批次哈希冲突。");
          batchInsert.run(batch.id, batch.archive_sha256, JSON.stringify(batch));
        }
        this.store.db.exec("DELETE FROM catalogue_jobs; DELETE FROM catalogue_directions;");
        const directionInsert = this.store.db.prepare("INSERT INTO catalogue_directions VALUES(?,?,?)");
        data.directions.forEach((direction, index) => directionInsert.run(direction.code, index, JSON.stringify(direction)));
        const jobInsert = this.store.db.prepare("INSERT INTO catalogue_jobs VALUES(?,?,?,?,?,?)");
        data.jobs.forEach((job, index) => jobInsert.run(job.id, index, job.content_hash, job.data_kind, job.batch_id, JSON.stringify(job)));
        const { jobs: _jobs, directions: _directions, batches: _batches, ...metadata } = data;
        this.store.db.prepare("INSERT INTO catalogue_state VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,digest=excluded.digest,data=excluded.data")
          .run(data.version, digest, JSON.stringify(metadata));
        this.store.db.prepare("INSERT INTO catalogue_imports VALUES(?,?,?,?,?)").run(data.version, previous?.version ?? null, now(), data.jobs.length, digest);
      }
      for (const material of options.materials ?? []) {
        invariant(data.batches.some(batch => batch.id === material.batch_id), 400, "原始材料缺少对应批次。");
        const hash = sha256(material.content), old = this.store.db.prepare("SELECT sha256,batch_id,kind FROM catalogue_materials WHERE key=?").get(material.key);
        invariant(!old || old.sha256 === hash && old.batch_id === material.batch_id && old.kind === material.kind, 409, "原始交付材料已存在且内容不同，拒绝覆盖。");
        if (material.kind === "original_zip") invariant(data.batches.find(batch => batch.id === material.batch_id)?.archive_sha256 === hash, 400, "交付 ZIP 哈希不符。");
        if (!old) this.store.db.prepare("INSERT INTO catalogue_materials VALUES(?,?,?,?,?)").run(material.key, material.batch_id, material.kind, hash, material.content);
      }
      for (const item of options.reviewItems ?? []) {
        invariant(data.batches.some(batch => batch.id === item.batch_id), 400, "待审记录缺少对应批次。");
        const text = JSON.stringify(item.data), old = this.store.db.prepare("SELECT batch_id,kind,data FROM catalogue_review_queue WHERE id=?").get(item.id);
        invariant(!old || old.batch_id === item.batch_id && old.kind === item.kind && old.data === text, 409, "待审记录冲突，拒绝覆盖。");
        if (!old) this.store.db.prepare("INSERT INTO catalogue_review_queue VALUES(?,?,?,?)").run(item.id, item.batch_id, item.kind, text);
      }
      for (const batch of data.batches) {
        const entries = this.store.db.prepare("SELECT kind,COUNT(*) AS n FROM catalogue_review_queue WHERE batch_id=? GROUP BY kind").all(batch.id);
        // 完整交接资料必须对账；普通测试/交换快照可以不附带原始交接包。
        if ((options.materials ?? []).some(material => material.batch_id === batch.id && material.kind === "original_zip")) {
          invariant(Number(entries.find(row => row.kind === "lead")?.n ?? 0) === batch.leads, 400, "线索数与批次不一致。");
          invariant(Number(entries.find(row => row.kind === "quarantine")?.n ?? 0) === batch.quarantined_jobs, 400, "隔离数与批次不一致。");
        }
      }
      return { imported: !same, version: data.version, samples: data.jobs.length, directions: data.directions.length, batches: data.batches.length };
    });
  }
}
