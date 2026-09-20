import { useState } from "react";
import { api, tokenStore } from "../api/client";
import { Ms } from "./Ms";

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const session =
        mode === "login"
          ? await api.login(username, password)
          : await api.register(username, password, consent);
      tokenStore.set(session.token);
      onSuccess();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth__wrap">
      <div className="auth__art">
        <img src="/brand/su-standing.webp" alt="穗奈" />
        <span>她先去查原句，再回来跟你讨论</span>
      </div>
      <form
        className="auth"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="brand__mark">
          <img className="brand__img" src="/brand/logo-head.webp" alt="" />
          <img className="brand__word" src="/brand/wordmark.webp" alt="青穗集" />
        </div>

        <div>
          <h1>开始一次规划</h1>
          <p className="t-body-md" style={{ color: "var(--md-on-surface-variant)" }}>
            大学生职业决策与行动助手 · 穗奈
          </p>
        </div>

        <input
          id="username"
          name="username"
          type="text"
          placeholder="用户名"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
        />
        <input
          id="password"
          name="password"
          type="password"
          placeholder="密码（至少 8 位）"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        {mode === "register" ? (
          <label className="auth__consent">
            <input
              id="consent"
              name="consent"
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              style={{ marginTop: 4 }}
            />
            <span>
              <b>同意把决策上下文交给云端模型处理</b>
              <br />
              换来的是更完整的分析。不勾选也能用：穗奈会走确定性路径，并在结果上明确标注依据有限。
            </span>
          </label>
        ) : null}

        {error ? (
          <div className="notice">
            <Ms g="error" size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="auth__row">
          <button className="btn btn--primary" type="submit" disabled={busy}>
            <Ms g={mode === "login" ? "login" : "person_add"} size={18} />
            <span>{mode === "login" ? "登录" : "注册并进入"}</span>
          </button>
          <button
            className="btn btn--outline"
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
          </button>
        </div>
      </form>
    </div>
  );
}
