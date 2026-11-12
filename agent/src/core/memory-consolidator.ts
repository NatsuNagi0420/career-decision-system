/** 青穗集 · 持久记忆整理队列：租约、去重、断点恢复和有界重试，不依赖浏览器。 */
import { randomUUID } from "node:crypto";
import type { Store } from "../store.js";
import { AppError } from "../errors.js";
import type { User } from "../types.js";
import type { ConversationGuidance } from "../guidance.js";

export interface MemoryJobStatus { queued: number; running: number; failed: number; last_error: string | null }
interface Job { id: string; user_id: number; conversation_id: string; message_id: string; profile_id: string; state: string; attempts: number; lease: string | null }
export class MemoryConsolidator {
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private current?: Promise<void>;
  private activeConversation: string | null = null;
  constructor(readonly store: Store, private guidance: ConversationGuidance,
    private changed: (cid: string) => void, readonly enabled = true) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS memory_jobs(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,message_id TEXT NOT NULL,profile_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,lease TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(conversation_id,message_id));
      CREATE INDEX IF NOT EXISTS memory_jobs_due ON memory_jobs(state,next_at,lease_until);
      CREATE TABLE IF NOT EXISTS memory_worker_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
    store.db.prepare("INSERT OR IGNORE INTO memory_worker_meta VALUES('started_at',?)").run(new Date().toISOString());
  }
  enqueue(userId: number, cid: string, profileId: string, messageId: string) {
    if (!this.enabled || this.stopped) return;
    this.store.conversation(userId, cid);
    const stamp = new Date().toISOString();
    this.store.transaction(() => {
      this.store.db.prepare("UPDATE memory_jobs SET state='cancelled',updated_at=? WHERE conversation_id=? AND message_id!=? AND state IN ('queued','retry')").run(stamp, cid, messageId);
      this.store.db.prepare("INSERT OR IGNORE INTO memory_jobs(id,user_id,conversation_id,message_id,profile_id,next_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)").run(randomUUID(), userId, cid, messageId, profileId, Date.now() + 1200, stamp, stamp);
    });
    this.changed(cid);
  }
  /** 恢复“主回复已落库、尚未来得及入队”的狭窄崩溃窗口，只处理本功能启用后的运行。 */
  recover() {
    if (!this.enabled) return;
    const since = String(this.store.db.prepare("SELECT value FROM memory_worker_meta WHERE key='started_at'").get()!.value);
    const rows = this.store.db.prepare("SELECT user_id,conversation_id,data FROM runs WHERE status IN ('completed','waiting_input') AND json_extract(data,'$.updated_at')>=? ORDER BY rowid DESC LIMIT 200").all(since);
    const seen = new Set<string>();
    for (const row of rows) {
      const cid = String(row.conversation_id); if (seen.has(cid)) continue; seen.add(cid);
      const run = JSON.parse(String(row.data)); if (run.superseded_by) continue;
      const conversation = this.store.conversation(Number(row.user_id), cid);
      const message = this.store.messages(cid).filter(item => item.role === "user").at(-1);
      if (message && !conversation.archived && conversation.guidance?.analyzed_message_id !== message.id)
        this.enqueue(Number(row.user_id), cid, run.profile_id, message.id);
    }
  }
  status(userId: number): MemoryJobStatus {
    const rows = this.store.db.prepare("SELECT state,COUNT(*) AS n FROM memory_jobs WHERE user_id=? GROUP BY state").all(userId);
    const count = (states: string[]) => rows.filter(row => states.includes(String(row.state))).reduce((sum, row) => sum + Number(row.n), 0);
    const error = this.store.db.prepare("SELECT error FROM memory_jobs WHERE user_id=? AND state IN ('failed','retry') AND error IS NOT NULL ORDER BY updated_at DESC LIMIT 1").get(userId);
    return { queued: count(["queued", "retry"]), running: count(["running"]), failed: count(["failed"]), last_error: error ? String(error.error) : null };
  }
  retry(user: User) {
    this.store.db.prepare("UPDATE memory_jobs SET state='queued',attempts=0,next_at=?,error=NULL WHERE user_id=? AND state IN ('failed','retry')").run(Date.now(), user.id);
    return this.status(user.id);
  }
  async tick() {
    if (!this.enabled || this.stopped || this.current) return;
    const lease = randomUUID(), stamp = new Date().toISOString(), time = Date.now();
    this.store.db.prepare("UPDATE memory_jobs SET state='failed',lease=NULL,lease_until=0,error=?,updated_at=? WHERE state='running' AND lease_until<=? AND attempts>=6").run("记忆整理暂未完成，可手动重试。", stamp, time);
    const job = this.store.db.prepare(`UPDATE memory_jobs SET state='running',attempts=attempts+1,lease=?,lease_until=?,updated_at=? WHERE id=(SELECT id FROM memory_jobs WHERE ((state IN ('queued','retry') AND next_at<=?) OR (state='running' AND lease_until<=?)) AND attempts<6 ORDER BY next_at LIMIT 1) RETURNING *`).get(lease, time + 180000, stamp, time, time) as unknown as Job | undefined;
    if (!job) return;
    this.activeConversation = job.conversation_id; this.changed(job.conversation_id);
    const work = async () => {
      try {
        const user = this.store.getUser(job.user_id), conversation = this.store.conversation(job.user_id, job.conversation_id);
        const latest = this.store.messages(job.conversation_id).filter(item => item.role === "user").at(-1);
        if (!user.external_ai_consent || conversation.archived || latest?.id !== job.message_id) {
          this.finish(job, lease, "cancelled", null); return;
        }
        if (this.store.activeRun(job.conversation_id)) {
          this.store.db.prepare("UPDATE memory_jobs SET attempts=attempts-1 WHERE id=? AND lease=?").run(job.id, lease);
          this.finish(job, lease, "retry", null, 2000); return;
        }
        await this.guidance.analyze(user, job.conversation_id, job.profile_id, job.message_id);
        this.finish(job, lease, "done", null);
      } catch (cause) {
        if (this.stopped) { this.store.db.prepare("UPDATE memory_jobs SET attempts=MAX(0,attempts-1) WHERE id=? AND lease=?").run(job.id, lease); this.finish(job, lease, "retry", null, 0); return; }
        const code = cause instanceof AppError ? cause.code : "", status = cause instanceof AppError ? cause.status : 0;
        if (code === "guidance_stale" || status === 404 || status === 403) { this.finish(job, lease, "cancelled", null); return; }
        // 不保存上游正文/密钥；错误只给统一状态，可由用户显式重试。
        const message = status === 401 || status === 409 ? "暂时无法整理，请检查模型连接后重试。" : "记忆整理暂未完成，已保留任务并稍后重试。";
        this.finish(job, lease, job.attempts >= 6 ? "failed" : "retry", message, Math.min(300000, 2000 * 2 ** (job.attempts - 1)));
      } finally { this.activeConversation = null; this.changed(job.conversation_id); }
    };
    this.current = work();
    try { await this.current; } finally { this.current = undefined; }
  }
  private finish(job: Job, lease: string, state: string, error: string | null, delay = 0) {
    this.store.db.prepare("UPDATE memory_jobs SET state=?,error=?,lease=NULL,lease_until=0,next_at=?,updated_at=? WHERE id=? AND lease=?").run(state, error, Date.now() + delay, new Date().toISOString(), job.id, lease);
  }
  start() {
    if (!this.enabled || this.timer || this.stopped) return;
    this.recover();
    const poll = () => { if (this.stopped) return; void this.tick().catch(() => {}).finally(() => { if (!this.stopped) { this.timer = setTimeout(poll, 1000); this.timer.unref(); } }); };
    this.timer = setTimeout(poll, 1300); this.timer.unref();
  }
  async close() {
    this.stopped = true; clearTimeout(this.timer);
    if (this.activeConversation) this.guidance.cancelAnalysis(this.activeConversation);
    await this.current;
  }
}
