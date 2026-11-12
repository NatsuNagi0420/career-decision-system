/** 青穗集 · 账号记忆增量同步：幂等版本、删除优先、离线续传和并发纠正保留。 */
import { createHash } from "node:crypto";
import { invariant } from "../errors.js";
import type { LongTermMemory } from "./long-term-memory.js";
import { memoryExchange, type MemoryExchange, type MemoryExchangeResult, type MemoryReplica, type MemorySyncEntry } from "./memory-sync-contract.js";
const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fields = (v: MemoryReplica) => JSON.stringify([v.kind,v.text,v.confirmed,v.anchor,v.demoted,v.status]);
type ServerRow = { key: string; version: number; deleted: number; digest: string };
type ClientRow = { key: string; version: number; digest: string };
export class MemorySync {
  readonly store;
  constructor(readonly memory: LongTermMemory) {
    this.store = memory.store;
    this.store.db.exec(`CREATE TABLE IF NOT EXISTS memory_sync_clock(user_id INTEGER PRIMARY KEY REFERENCES users(id),version INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS memory_sync_entries(user_id INTEGER NOT NULL REFERENCES users(id),key TEXT NOT NULL,version INTEGER NOT NULL,deleted INTEGER NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(user_id,key));
      CREATE INDEX IF NOT EXISTS memory_sync_versions ON memory_sync_entries(user_id,version);
      CREATE TABLE IF NOT EXISTS memory_sync_client(user_id INTEGER NOT NULL REFERENCES users(id),peer TEXT NOT NULL,key TEXT NOT NULL,version INTEGER NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(user_id,peer,key));
      CREATE TABLE IF NOT EXISTS memory_sync_cursors(user_id INTEGER NOT NULL REFERENCES users(id),peer TEXT NOT NULL,cursor INTEGER NOT NULL,PRIMARY KEY(user_id,peer));`);
  }
  private version(userId: number) { return Number(this.store.db.prepare("INSERT INTO memory_sync_clock VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1 RETURNING version").get(userId)!.version); }
  /** 只保存当前版本和无正文墓碑；不会另存一份被删除的历史记忆。 */
  private capture(userId: number) {
    const values = this.memory.replicaValues(userId);
    const previous = this.store.db.prepare("SELECT key,version,deleted,digest FROM memory_sync_entries WHERE user_id=?").all(userId) as ServerRow[];
    const old = new Map(previous.map(row => [row.key,row]));
    for (const [key,value] of values) {
      const row = old.get(key);
      if (row?.deleted && value) { this.memory.applyReplica(userId,key,null); values.set(key,null); continue; }
      const fingerprint = digest(value);
      if (row?.digest === fingerprint) continue;
      this.store.db.prepare("INSERT INTO memory_sync_entries VALUES(?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET version=excluded.version,deleted=excluded.deleted,digest=excluded.digest").run(userId,key,this.version(userId),value === null ? 1 : 0,fingerprint);
    }
    for (const row of previous) if (!values.has(row.key) && !row.deleted) this.store.db.prepare("UPDATE memory_sync_entries SET version=?,deleted=1,digest=? WHERE user_id=? AND key=?").run(this.version(userId),digest(null),userId,row.key);
    return values;
  }
  private entry(userId: number, key: string, values: Map<string,MemoryReplica|null>): MemorySyncEntry | undefined {
    const row = this.store.db.prepare("SELECT version,deleted FROM memory_sync_entries WHERE user_id=? AND key=?").get(userId,key);
    return row ? { key, version: Number(row.version), value: row.deleted ? null : values.get(key) ?? null } : undefined;
  }
  exchange(userId: number, raw: unknown): MemoryExchangeResult {
    this.store.getUser(userId);
    const request = memoryExchange.parse(raw);
    invariant(Buffer.byteLength(JSON.stringify(request)) <= 512 * 1024,413,"这批记忆过大，请分批同步。");
    if (this.memory.settings(userId).sync_enabled === false) return { cursor: request.cursor, more: false, paused: true, entries: [], acknowledgements: [] };
    return this.store.transaction(() => {
      let values = this.capture(userId);
      // 指纹与删除先行，离线设备不能重新写回已遗忘的材料。
      for (const change of request.changes.filter(c => c.value === null)) {
        this.memory.applyReplica(userId,change.key,null);
        const previous = this.store.db.prepare("SELECT deleted FROM memory_sync_entries WHERE user_id=? AND key=?").get(userId,change.key);
        if (!previous?.deleted) this.store.db.prepare("INSERT INTO memory_sync_entries VALUES(?,?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET version=excluded.version,deleted=1,digest=excluded.digest").run(userId,change.key,this.version(userId),1,digest(null));
      }
      for (const change of request.changes.filter(c => c.value !== null)) {
        invariant(change.key.startsWith("n:"),400,"记忆指纹不能包含正文。");
        const incoming = change.value!, row = this.store.db.prepare("SELECT version,deleted FROM memory_sync_entries WHERE user_id=? AND key=?").get(userId,change.key);
        if (row?.deleted || request.changes.some(c => c.key === change.key && c.value === null)) continue;
        const current = values.get(change.key);
        if (!current || Number(row?.version ?? 0) === change.base || digest(incoming) === digest(current)) this.memory.applyReplica(userId,change.key,incoming);
        else if (fields(incoming) === fields(current)) {
          const sources = [...new Map([...current.sources,...incoming.sources].map(s => [s.key,s])).values()].sort((a,b) => a.created_at.localeCompare(b.created_at)).slice(-12).sort((a,b) => a.key.localeCompare(b.key));
          this.memory.applyReplica(userId,change.key,{ ...current, sources, mentions: Math.max(current.mentions,incoming.mentions,sources.length), updated_at: [current.updated_at,incoming.updated_at].sort().at(-1)!, last_mentioned_at: [current.last_mentioned_at,incoming.last_mentioned_at].sort().at(-1)!, conflicts: [...new Set([...current.conflicts,...incoming.conflicts])].sort().slice(0,8) });
        } else {
          // 并发纠正生成可核对的另一版本，复用忆迹场原有的冲突确认交互。
          const conflictKey = "n:" + digest("conflict:" + change.key + ":" + fields(incoming));
          if (!this.store.db.prepare("SELECT 1 FROM memory_sync_entries WHERE user_id=? AND key=? AND deleted=1").get(userId,conflictKey)) {
            this.memory.applyReplica(userId,conflictKey,{ ...incoming, conflicts: [...new Set([change.key,...incoming.conflicts])].slice(0,8) });
            this.memory.applyReplica(userId,change.key,{ ...current, conflicts: [...new Set([conflictKey,...current.conflicts])].slice(0,8) });
          }
        }
      }
      this.memory.finishReplicas(userId);
      values = this.capture(userId);
      const rows = this.store.db.prepare("SELECT key,version FROM memory_sync_entries WHERE user_id=? AND version>? ORDER BY version LIMIT 100").all(userId,request.cursor);
      const entries: MemorySyncEntry[] = []; let bytes = 0;
      for (const row of rows) {
        const entry = this.entry(userId,String(row.key),values)!; const size = Buffer.byteLength(JSON.stringify(entry));
        if (entries.length && bytes + size > 1024 * 1024) break;
        entries.push(entry); bytes += size;
      }
      const cursor = entries.at(-1)?.version ?? request.cursor;
      const more = Boolean(this.store.db.prepare("SELECT 1 FROM memory_sync_entries WHERE user_id=? AND version>? LIMIT 1").get(userId,cursor));
      const acknowledgements = [...new Set(request.changes.map(c => c.key))].flatMap(key => { const entry = this.entry(userId,key,values); return entry ? [entry] : []; });
      return { cursor, more, paused: false, entries, acknowledgements };
    });
  }
  pending(userId: number, peer: string): MemoryExchange {
    const values = this.memory.replicaValues(userId), state = this.store.db.prepare("SELECT key,version,digest FROM memory_sync_client WHERE user_id=? AND peer=?").all(userId,peer) as ClientRow[], old = new Map(state.map(row => [row.key,row]));
    const changes: MemoryExchange["changes"] = []; let bytes = 0;
    for (const key of new Set([...values.keys(),...old.keys()])) {
      const value = values.get(key) ?? null, fingerprint = digest(value), previous = old.get(key);
      if (previous?.digest === fingerprint) continue;
      const change = { key, base: previous?.version ?? 0, value }, size = Buffer.byteLength(JSON.stringify(change));
      if (changes.length >= 40 || (changes.length && bytes + size > 256 * 1024)) break;
      changes.push(change); bytes += size;
    }
    const cursor = Number(this.store.db.prepare("SELECT cursor FROM memory_sync_cursors WHERE user_id=? AND peer=?").get(userId,peer)?.cursor ?? 0);
    return { cursor, changes };
  }
  accept(userId: number, peer: string, sent: MemoryExchange, result: MemoryExchangeResult) {
    if (result.paused) return;
    this.store.transaction(() => {
      const current = this.memory.replicaValues(userId), old = new Map((this.store.db.prepare("SELECT key,digest FROM memory_sync_client WHERE user_id=? AND peer=?").all(userId,peer) as {key:string;digest:string}[]).map(row => [row.key,row.digest]));
      const sentValues = new Map(sent.changes.map(c => [c.key,digest(c.value)]));
      const latest = new Map<string,MemorySyncEntry>();
      for (const item of [...result.entries,...result.acknowledgements]) if ((latest.get(item.key)?.version ?? -1) < item.version) latest.set(item.key,item);
      const applied: MemorySyncEntry[] = [];
      for (const item of [...latest.values()].sort((a,b) => Number(a.value !== null) - Number(b.value !== null))) {
        const fingerprint = digest(current.get(item.key) ?? null), expected = sentValues.get(item.key) ?? old.get(item.key);
        // 请求在途时又有本机修改，保留它，下轮以旧版本提交，避免覆盖或丢失。
        if (item.value !== null && expected !== undefined && fingerprint !== expected) continue;
        if (item.value !== null && expected === undefined && current.has(item.key) && fingerprint !== digest(item.value)) continue;
        if (fingerprint !== digest(item.value)) this.memory.applyReplica(userId,item.key,item.value);
        applied.push(item);
      }
      this.memory.finishReplicas(userId);
      const after = this.memory.replicaValues(userId);
      for (const item of applied) this.store.db.prepare("INSERT INTO memory_sync_client VALUES(?,?,?,?,?) ON CONFLICT(user_id,peer,key) DO UPDATE SET version=excluded.version,digest=excluded.digest").run(userId,peer,item.key,item.version,digest(after.get(item.key) ?? null));
      this.store.db.prepare("INSERT INTO memory_sync_cursors VALUES(?,?,?) ON CONFLICT(user_id,peer) DO UPDATE SET cursor=MAX(cursor,excluded.cursor)").run(userId,peer,result.cursor);
    });
  }
}
