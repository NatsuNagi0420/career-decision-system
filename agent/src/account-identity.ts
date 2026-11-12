/** 青穗集 · 统一身份适配：PC 使用设备会话，官方账号由中转验证，云端不另存密码。 */
import { randomUUID } from "node:crypto";
import { Auth, tokenHash } from "./auth.js";
import { Store } from "./store.js";
import { Secrets } from "./secrets.js";
import { AppError, invariant, isRecord } from "./errors.js";
import { readLimited } from "./provider.js";
import type { Config } from "./config.js";
import type { User } from "./types.js";

type Account = { id: number; username: string };
type Link = { user_id: number; subject: string; username: string; secret: string | null };
export class AccountIdentity {
  private readonly active = new Map<number, string>();
  private readonly validating = new Map<string, Promise<{ account: Account; usage?: unknown }>>();
  private readonly issuer: string;
  constructor(readonly store: Store, private auth: Auth, private secrets: Secrets, readonly config: Config) {
    this.issuer = config.officialUrl.replace(/\/+$/, "");
    store.db.exec(`CREATE TABLE IF NOT EXISTS account_identities(issuer TEXT NOT NULL,subject TEXT NOT NULL,user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),username TEXT NOT NULL,secret TEXT,PRIMARY KEY(issuer,subject));
      CREATE TABLE IF NOT EXISTS device_identity(singleton INTEGER PRIMARY KEY CHECK(singleton=1),user_id INTEGER NOT NULL REFERENCES users(id));`);
  }
  private async request(path: string, token?: string, body?: unknown) {
    invariant(this.issuer, 503, "官方账号服务尚未配置。", "official_not_configured");
    let response: Response;
    try {
      response = await fetch(this.issuer + "/auth/" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Accept: "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.timeout(10000),
      });
    } catch { throw new AppError(503, "暂时连接不上官方账号服务，请稍后再试。", "official_unavailable"); }
    const text = await readLimited(response, 131072);
    invariant(text.length <= 131072, 502, "官方账号服务响应异常。", "official_auth_response");
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new AppError(502, "官方账号服务响应异常。", "official_auth_response"); }
    if (!response.ok) {
      const detail = response.status === 401 ? "官方账号验证失败，请重新登录。" : response.status === 409 ? "这个账号已被使用。" : response.status === 429 ? "请求较频繁，请稍后再试。" : response.status === 400 ? "请检查账号格式；注册密码至少需要 12 位。" : "官方账号服务暂时不可用。";
      throw new AppError(response.status >= 500 ? 502 : response.status, detail, "official_auth_failed");
    }
    return value;
  }
  private account(value: unknown): Account {
    invariant(isRecord(value) && isRecord(value.account) && Number.isSafeInteger(value.account.id) && Number(value.account.id) > 0 && typeof value.account.username === "string", 502, "官方身份响应异常。", "official_auth_response");
    return { id: Number(value.account.id), username: value.account.username as string };
  }
  private validate(token: string) {
    const digest = tokenHash(token);
    const pending = this.validating.get(digest);
    if (pending) return pending;
    // 只合并正在进行的验证，不缓存验证结果；撤销令牌会在下一次请求生效。
    const job = this.request("me", token).then(value => ({ account: this.account(value), ...(isRecord(value) && value.usage ? { usage: value.usage } : {}) }));
    this.validating.set(digest, job);
    void job.finally(() => this.validating.delete(digest)).catch(() => {});
    return job;
  }
  private link(userId: number) {
    return this.store.db.prepare("SELECT * FROM account_identities WHERE user_id=? AND issuer=?").get(userId, this.issuer) as Link | undefined;
  }
  private present(user: User): User {
    const link = this.link(user.id);
    return { ...user, username: link?.username ?? (this.isDevice(user.id) ? "本机工作区" : user.username), identity: link ? "official" : this.isDevice(user.id) ? "device" : "legacy", ...(link ? { official_account: { id: Number(link.subject), username: link.username } } : {}) };
  }
  private isDevice(userId: number) { return Boolean(this.store.db.prepare("SELECT 1 FROM device_identity WHERE user_id=?").get(userId)); }
  private map(account: Account, candidate?: User): User {
    const subject = String(account.id);
    return this.store.transaction(() => {
      let link = this.store.db.prepare("SELECT * FROM account_identities WHERE issuer=? AND subject=?").get(this.issuer, subject) as Link | undefined;
      if (!link) {
        let userId = candidate && !this.store.db.prepare("SELECT 1 FROM account_identities WHERE user_id=?").get(candidate.id) ? candidate.id : undefined;
        if (!userId) {
          userId = Number(this.store.db.prepare("INSERT INTO users(username,password_hash,consent) VALUES(?,?,0)").run("__official_" + randomUUID(), "!official-account").lastInsertRowid);
          this.store.beginOnboarding(userId);
        }
        this.store.db.prepare("INSERT INTO account_identities(issuer,subject,user_id,username) VALUES(?,?,?,?)").run(this.issuer, subject, userId, account.username);
        link = { user_id: userId, subject, username: account.username, secret: null };
      } else this.store.db.prepare("UPDATE account_identities SET username=? WHERE issuer=? AND subject=?").run(account.username, this.issuer, subject);
      return this.present(this.store.getUser(link.user_id));
    });
  }
  linkedUsers() {
    return this.store.db.prepare("SELECT user_id FROM account_identities WHERE issuer=?").all(this.issuer).map(row => this.present(this.store.getUser(Number(row.user_id))));
  }
  bootstrap() {
    invariant(this.config.deploymentMode === "local", 404, "接口不存在。");
    let row = this.store.db.prepare("SELECT user_id FROM device_identity WHERE singleton=1").get() as { user_id: number } | undefined;
    // 登录过官方账号的资料不会在退出后暴露为匿名工作区。
    if (!row || this.link(row.user_id)) {
      const result = this.store.db.prepare("INSERT INTO users(username,password_hash,consent) VALUES(?,?,0)").run("__device_" + randomUUID(), "!device-only");
      row = { user_id: Number(result.lastInsertRowid) };
      this.store.beginOnboarding(row.user_id);
      this.store.db.prepare("INSERT INTO device_identity VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET user_id=excluded.user_id").run(row.user_id);
    }
    const session = this.auth.session(row.user_id);
    return { ...session, user: this.present(session.user) };
  }
  async user(header?: string): Promise<User> {
    if (this.config.deploymentMode === "local") return this.present(this.auth.user(header));
    invariant(header?.startsWith("Bearer ") && header.length < 8192, 401, "请登录官方账号。", "auth_required");
    const token = header!.slice(7);
    const { account } = await this.validate(token);
    const user = this.map(account);
    this.active.set(user.id, token);
    this.secrets.protect(token);
    return user;
  }
  async login(username: string, password: string, consent = false, register = false, candidate?: User) {
    const value = await this.request(register ? "register" : "login", undefined, { username, password });
    invariant(isRecord(value) && typeof value.token === "string", 502, "官方账号服务未返回登录凭证。", "official_auth_response");
    const account = this.account(value);
    const user = this.map(account, this.config.deploymentMode === "local" ? candidate : undefined);
    if (this.config.deploymentMode === "local" && candidate && candidate.id !== user.id && this.link(candidate.id)) {
      this.active.delete(candidate.id);
      this.secrets.clear(candidate.id);
      this.store.db.prepare("UPDATE account_identities SET secret=NULL WHERE user_id=?").run(candidate.id);
      this.store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(candidate.id);
    }
    this.secrets.protect(value.token);
    this.active.set(user.id, value.token);
    if (consent) this.store.setConsent(user.id, true);
    if (this.config.deploymentMode === "local") {
      const encrypted = await this.secrets.save(user.id, "identity:" + user.id, value.token, process.platform === "win32");
      this.store.db.prepare("UPDATE account_identities SET secret=? WHERE user_id=?").run(encrypted, user.id);
    }
    if (this.config.deploymentMode === "local") this.store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    const session = this.config.deploymentMode === "server" ? { token: value.token, user } : this.auth.session(user.id);
    return { ...session, user: this.present(this.store.getUser(user.id)), account };
  }
  async officialKey(user: User): Promise<string | null | undefined> {
    const link = this.link(user.id);
    if (!link) return this.config.deploymentMode === "server" ? null : undefined;
    const token = this.active.get(user.id) ?? await this.secrets.get(user.id, "identity:" + user.id, link.secret);
    return token ?? null;
  }
  async session(user: User) {
    const key = await this.officialKey(user);
    if (!key) return { connected: false, account: null };
    try { const value = await this.validate(key); return { connected: true, ...value }; }
    catch (error) { if (error instanceof AppError && error.status === 401) return { connected: false, account: null }; throw error; }
  }
  async logout(header?: string) {
    const user = await this.user(header);
    const key = await this.officialKey(user);
    if (key) { try { await this.request("logout", key, {}); } catch { /* 断网时仍清除本机凭据，云端撤销可从账号入口重试。 */ } }
    this.active.delete(user.id);
    this.secrets.forget("identity:" + user.id);
    if (this.config.deploymentMode === "local") {
      this.store.db.prepare("UPDATE account_identities SET secret=NULL WHERE user_id=? AND issuer=?").run(user.id, this.issuer);
      this.store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    }
    return { connected: false, account: null };
  }
}
