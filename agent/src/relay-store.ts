/** 青穗集 · 官方服务存储：SQLite 本地联调、PostgreSQL 生产部署共用事务接口与幂等建表。 */
import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { Pool, type PoolClient } from "pg";
export type RelayRow = Record<string, string | number | bigint | null>;
export interface RelayStore {
  readonly dialect: "sqlite" | "postgres";
  get(sql: string, ...params: SQLInputValue[]): Promise<RelayRow | undefined>;
  all(sql: string, ...params: SQLInputValue[]): Promise<RelayRow[]>;
  run(sql: string, ...params: SQLInputValue[]): Promise<{ changes: number }>;
  exec(sql: string): Promise<void>;
  transaction<T>(work: (store: RelayStore) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
/** SQL 均由服务端编写；只转换字符串字面量之外的参数占位符。 */
export function postgresSql(sql: string) {
  let index = 0;
  let quoted = false;
  let result = "";
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      if (quoted && sql[i + 1] === "'") { result += "''"; i++; continue; }
      quoted = !quoted;
    }
    result += char === "?" && !quoted ? "$" + ++index : char;
  }
  return result;
}
export function sqliteRelayStore(db: DatabaseSync): RelayStore {
  let tail = Promise.resolve();
  const context = new AsyncLocalStorage<boolean>();
  function serial<T>(work: () => T | Promise<T>): Promise<T> {
    if (context.getStore()) return Promise.resolve().then(work);
    const result = tail.then(() => context.run(true, work));
    tail = result.then(() => {}, () => {});
    return result;
  }
  const store: RelayStore = {
    dialect: "sqlite",
    get: (sql, ...params) => serial(() => db.prepare(sql).get(...params) as RelayRow | undefined),
    all: (sql, ...params) => serial(() => db.prepare(sql).all(...params) as RelayRow[]),
    run: (sql, ...params) => serial(() => ({ changes: Number(db.prepare(sql).run(...params).changes) })),
    exec: sql => serial(() => db.exec(sql)),
    transaction: work => serial(async () => {
      db.exec("BEGIN IMMEDIATE");
      try { const result = await work(store); db.exec("COMMIT"); return result; }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    }),
    close: () => serial(() => db.close()),
  };
  return store;
}
export interface PostgresConnection {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}
/** 可注入 PostgreSQL 测试连接；生产使用 pg Pool 并在每次事务内固定同一连接。 */
export function postgresRelayStore(connection: PostgresConnection, transactionConnection?: () => Promise<PoolClient>, close?: () => Promise<void>): RelayStore {
  const context = new AsyncLocalStorage<PostgresConnection>();
  let tail = Promise.resolve();
  function serial<T>(work: () => Promise<T>): Promise<T> {
    if (transactionConnection || context.getStore()) return work();
    const result = tail.then(work);
    tail = result.then(() => {}, () => {});
    return result;
  }
  const query = (sql: string, params: SQLInputValue[] = []) => serial(() => (context.getStore() ?? connection).query(postgresSql(sql), params));
  const store: RelayStore = {
    dialect: "postgres",
    get: async (sql, ...params) => (await query(sql, params)).rows[0] as RelayRow | undefined,
    all: async (sql, ...params) => (await query(sql, params)).rows as RelayRow[],
    run: async (sql, ...params) => ({ changes: Number((await query(sql, params)).rowCount ?? 0) }),
    exec: async sql => { await query(sql); },
    transaction: async work => {
      if (context.getStore()) return work(store);
      return serial(async () => {
      const client = transactionConnection ? await transactionConnection() : connection;
      try {
        await client.query("BEGIN");
        const result = await context.run(client, () => work(store));
        await client.query("COMMIT");
        return result;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { if (transactionConnection) (client as PoolClient).release(); }
      });
    },
    close: close ?? (async () => {}),
  };
  return store;
}
export async function connectRelayPostgres(url: string) {
  const pool = new Pool({ connectionString: url, max: 10, connectionTimeoutMillis: 10000, statement_timeout: 15000, application_name: "suinai-official" });
  pool.on("error", () => { console.error("官方数据库连接中断，等待重新连接。"); });
  const store = postgresRelayStore(pool, () => pool.connect(), () => pool.end());
  try { await initializeRelayStore(store); return store; }
  catch (error) { await pool.end(); throw error; }
}
export const relayTables = [
  "relay_accounts", "relay_account_policies", "relay_point_days", "relay_point_adjustments", "relay_admin_audit", "access_tokens", "daily_usage", "relay_request_log", "relay_upstream_health", "relay_image_tasks",
  "relay_leases", "relay_wallets", "relay_credit_ledger", "relay_usage_events", "relay_alerts", "relay_auth_limits",
] as const;
export async function initializeRelayStore(database: RelayStore) {
  await database.transaction(async store => {
  if (store.dialect === "postgres") await store.get("SELECT pg_advisory_xact_lock(7168210)");
  const id = store.dialect === "postgres" ? "BIGSERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT";
  await store.exec([
    "CREATE TABLE IF NOT EXISTS relay_accounts(id " + id + ",username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_account_policies(account_id BIGINT PRIMARY KEY REFERENCES relay_accounts(id),role TEXT NOT NULL DEFAULT 'member',permissions_json TEXT NOT NULL DEFAULT '[]',daily_points_micros BIGINT,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_point_days(owner_id TEXT NOT NULL,day TEXT NOT NULL,granted_micros BIGINT NOT NULL,spent_micros BIGINT NOT NULL DEFAULT 0,held_micros BIGINT NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(owner_id,day))",
    "CREATE TABLE IF NOT EXISTS relay_point_adjustments(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,day TEXT NOT NULL,amount_micros BIGINT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_admin_audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,target_account_id BIGINT NOT NULL,action TEXT NOT NULL,value_json TEXT NOT NULL,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS access_tokens(hash TEXT PRIMARY KEY,label TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,account_id BIGINT REFERENCES relay_accounts(id),last_used_at TEXT)",
    "CREATE TABLE IF NOT EXISTS daily_usage(token_hash TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL,output_reserved BIGINT NOT NULL,PRIMARY KEY(token_hash,day))",
    "CREATE TABLE IF NOT EXISTS relay_request_log(id " + id + ",created_at TEXT NOT NULL,path TEXT NOT NULL,status INTEGER NOT NULL,token_hash TEXT,capability TEXT,duration_ms INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS relay_request_log_by_day ON relay_request_log(created_at)",
    "CREATE TABLE IF NOT EXISTS relay_upstream_health(id INTEGER PRIMARY KEY CHECK(id=1),consecutive_failures INTEGER NOT NULL DEFAULT 0,last_success_at TEXT,last_failure_at TEXT,last_error_code TEXT,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_image_tasks(id TEXT PRIMARY KEY,upstream_id TEXT NOT NULL,account_id BIGINT REFERENCES relay_accounts(id),owner_token_hash TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT,result_json TEXT,next_poll_at TEXT,operation_id TEXT)",
    "CREATE INDEX IF NOT EXISTS relay_image_tasks_by_account ON relay_image_tasks(account_id,created_at)",
    "CREATE TABLE IF NOT EXISTS relay_coordination(id INTEGER PRIMARY KEY,version BIGINT NOT NULL)",
    "INSERT INTO relay_coordination(id,version) VALUES(1,0) ON CONFLICT(id) DO NOTHING",
    "CREATE TABLE IF NOT EXISTS relay_leases(owner_id TEXT NOT NULL,lane TEXT NOT NULL,lease_id TEXT NOT NULL,expires_at TEXT NOT NULL,PRIMARY KEY(owner_id,lane))",
    "CREATE TABLE IF NOT EXISTS relay_wallets(owner_id TEXT PRIMARY KEY,balance_micros BIGINT NOT NULL DEFAULT 0,held_micros BIGINT NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_credit_ledger(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,amount_micros BIGINT NOT NULL,kind TEXT NOT NULL,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_usage_events(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,token_hash TEXT NOT NULL,capability TEXT NOT NULL,day TEXT NOT NULL,state TEXT NOT NULL,reserved_output BIGINT NOT NULL,reserved_micros BIGINT NOT NULL,input_tokens BIGINT,output_tokens BIGINT,image_count INTEGER NOT NULL DEFAULT 0,cost_micros BIGINT NOT NULL DEFAULT 0,charged_micros BIGINT NOT NULL DEFAULT 0,input_rate BIGINT NOT NULL DEFAULT 1,output_rate BIGINT NOT NULL DEFAULT 4,image_rate BIGINT NOT NULL DEFAULT 1000000,billing_enabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,completed_at TEXT)",
    "CREATE INDEX IF NOT EXISTS relay_usage_by_owner ON relay_usage_events(owner_id,day)",
    "CREATE TABLE IF NOT EXISTS relay_alerts(id TEXT PRIMARY KEY,kind TEXT NOT NULL,created_at TEXT NOT NULL,failures INTEGER NOT NULL,code TEXT,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS relay_auth_limits(key_hash TEXT PRIMARY KEY,started_at BIGINT NOT NULL,attempts INTEGER NOT NULL)",
  ].join(";"));
  // 旧 SQLite 和未来版本均以字段探测迁移，避免吞掉其他 DDL 错误。
  const columns = store.dialect === "sqlite"
    ? (await store.all("PRAGMA table_info(relay_image_tasks)")).map(row => row.name)
    : (await store.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='relay_image_tasks'")).map(row => row.name);
  for (const column of ["result_json", "next_poll_at", "operation_id"]) {
    if (!columns.includes(column)) await store.exec("ALTER TABLE relay_image_tasks ADD COLUMN " + column + " TEXT");
  }
  const usageColumns = store.dialect === "sqlite"
    ? (await store.all("PRAGMA table_info(relay_usage_events)")).map(row => row.name)
    : (await store.all("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='relay_usage_events'")).map(row => row.name);
  for (const [column, definition] of [["input_rate", "BIGINT NOT NULL DEFAULT 1"], ["output_rate", "BIGINT NOT NULL DEFAULT 4"], ["image_rate", "BIGINT NOT NULL DEFAULT 1000000"], ["billing_enabled", "INTEGER NOT NULL DEFAULT 0"]]) {
    if (!usageColumns.includes(column)) await store.exec("ALTER TABLE relay_usage_events ADD COLUMN " + column + " " + definition);
  }
  const pointColumns: Array<[string, string]> = [
    ["points_enabled", "INTEGER NOT NULL DEFAULT 0"], ["points_day", "TEXT"],
    ["points_reserved", "BIGINT NOT NULL DEFAULT 0"], ["points_charged", "BIGINT NOT NULL DEFAULT 0"],
    ["points_calculated", "BIGINT NOT NULL DEFAULT 0"], ["points_input_rate", "BIGINT NOT NULL DEFAULT 0"],
    ["points_cached_rate", "BIGINT NOT NULL DEFAULT 0"], ["points_output_rate", "BIGINT NOT NULL DEFAULT 0"],
    ["points_image_rate", "BIGINT NOT NULL DEFAULT 0"], ["cached_input_tokens", "BIGINT NOT NULL DEFAULT 0"],
    ["points_version", "TEXT"],
  ];
  for (const [column, definition] of pointColumns) {
    if (!usageColumns.includes(column)) await store.exec("ALTER TABLE relay_usage_events ADD COLUMN " + column + " " + definition);
  }
  await store.exec("CREATE UNIQUE INDEX IF NOT EXISTS relay_single_owner ON relay_account_policies(role) WHERE role='owner'");
  await store.exec("CREATE INDEX IF NOT EXISTS relay_usage_history ON relay_usage_events(owner_id,created_at,id)");
  });
}
