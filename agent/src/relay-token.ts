/** 青穗集 · 官方访问凭证管理：只在管理员显式签发时展示一次，不展示上游密钥。 */
import "dotenv/config";
import { resolve } from "node:path";
import { relayDatabase, issueRelayToken } from "./relay-app.js";
const db = relayDatabase(resolve(process.env.RELAY_DATA_DIR ?? "./relay-var"));
try {
  const action = process.argv[2] ?? "list";
  if (action === "issue") {
    const label = process.argv[3] ?? "manual-installation";
    const value = issueRelayToken(db, label);
    console.log(
      JSON.stringify(
        {
          label,
          ...value,
          notice:
            "此凭证仅属于指定安装实例，受独立额度限制。请安全传递；撤销时使用 hash。",
        },
        null,
        2,
      ),
    );
  } else if (action === "revoke") {
    const hash = process.argv[3];
    if (!hash || !/^[a-f0-9]{64}$/.test(hash))
      throw new Error("Expected token hash");
    db.prepare("UPDATE access_tokens SET revoked=1 WHERE hash=?").run(hash);
    console.log("凭证已撤销。");
  } else if (action === "list")
    console.log(
      JSON.stringify(
        db
          .prepare("SELECT hash,label,revoked,created_at FROM access_tokens")
          .all(),
        null,
        2,
      ),
    );
  else throw new Error("Unknown action");
} finally {
  db.close();
}
