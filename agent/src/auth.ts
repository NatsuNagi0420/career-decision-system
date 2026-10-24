/** 青穗集 · 本地账号与会话：密码 scrypt、只保存令牌摘要，账号与旧版隔离。 */
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { Store } from "./store.js";
import { invariant } from "./errors.js";
import type { User } from "./types.js";
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function hash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
function verify(password: string, value: string) {
  const [salt, digest] = value.split(":");
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export class Auth {
  constructor(private store: Store) {}
  register(username: string, password: string, consent: boolean) {
    invariant(
      !this.store.db
        .prepare("SELECT id FROM users WHERE username=?")
        .get(username),
      409,
      "这个用户名已被使用。",
    );
    const result = this.store.db
      .prepare(
        "INSERT INTO users(username,password_hash,consent) VALUES(?,?,?)",
      )
      .run(username, hash(password), consent ? 1 : 0);
    return this.session(Number(result.lastInsertRowid));
  }
  login(username: string, password: string) {
    const row = this.store.db
      .prepare("SELECT id,password_hash FROM users WHERE username=?")
      .get(username);
    const ok = verify(password, (row?.password_hash as string) ?? "invalid:00");
    invariant(row && ok, 401, "用户名或密码不正确。");
    return this.session(Number(row.id));
  }
  private session(userId: number) {
    const token = randomBytes(32).toString("base64url");
    this.store.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(
        tokenHash(token),
        userId,
        new Date(Date.now() + 7 * 86400000).toISOString(),
      );
    return { token, user: this.store.getUser(userId) };
  }
  user(header: string | undefined): User {
    invariant(header?.startsWith("Bearer "), 401, "请先登录。");
    const row = this.store.db
      .prepare("SELECT user_id,expires_at FROM sessions WHERE hash=?")
      .get(tokenHash(header!.slice(7)));
    invariant(
      row && String(row.expires_at) > new Date().toISOString(),
      401,
      "登录已过期，请重新登录。",
    );
    return this.store.getUser(Number(row.user_id));
  }
  logout(header: string | undefined) {
    if (header?.startsWith("Bearer "))
      this.store.db
        .prepare("DELETE FROM sessions WHERE hash=?")
        .run(tokenHash(header.slice(7)));
  }
}
