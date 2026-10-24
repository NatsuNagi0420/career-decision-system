/** 青穗集 · 成长桌面入口：复用正式穗奈动作，保留真实登录、注册和主动云端授权。 */
import { useState } from "react";
import { api, tokenStore } from "../api/client";
import { useReducedMotion } from "../character/preferences";
import { BrandMark } from "./Brand";
import { SuinaiMotionCharacter } from "./SuinaiMotionCharacter";
import { PixelIcon } from "./PixelIcon";

function readMotion(key: string) {
  try { return localStorage.getItem(key) !== "0"; } catch { return true; }
}

export function Login({ onSuccess, variant = "career" }: { onSuccess: () => void; variant?: "career" | "agent" }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [greeted, setGreeted] = useState(false);
  const [motion] = useState(() => readMotion("career.motion"));
  const [animated, setAnimated] = useState(() => readMotion("career.suinai.motion"));
  const reducedMotion = useReducedMotion();
  const motionLocked = reducedMotion || !motion;
  const motionLabel = reducedMotion ? "系统已减少动态" : !motion ? "全站动画已暂停" : animated ? "暂停穗奈动画" : "播放穗奈动画";
  function toggleMotion() {
    const next = !animated;
    setAnimated(next);
    try { localStorage.setItem("career.suinai.motion", next ? "1" : "0"); } catch { /* 显示偏好保存失败不能阻止登录。 */ }
  }
  async function submit() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const session = mode === "login" ? await api.login(username, password) : await api.register(username, password, consent);
      tokenStore.set(session.token); onSuccess();
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="auth__wrap">
    <div className="login-brand"><BrandMark /><span>{variant === "agent" ? "穗奈的本机任务工作区" : "你的求职成长桌面"}</span></div>
    <section className="login-window" aria-label="青穗集账号入口">
      <div className="desktop-titlebar"><span><PixelIcon kind="wheat" size={18} />青穗集 · {mode === "login" ? "欢迎回来" : "初次见面"}</span><span aria-hidden="true">✦</span></div>
      <div className="login-window__body">
        <aside className="auth__art login-art" aria-label="穗奈欢迎窗口">
          <div className="login-art__label">YOUR CAREER COMPANION</div>
          <div className="login-art__stars" aria-hidden="true">✧<span>＊</span></div>
          <div className="login-art__character">
            <SuinaiMotionCharacter action={greeted ? "A02" : "A01"} view="gesture" playing={animated && motion}
              autoBlink eyeOpen={1} blinkNonce={0} reducedMotion={reducedMotion}
              ariaLabel="穗奈向你问好，陪你整理求职的下一步" onComplete={() => setGreeted(true)} />
          </div>
          <div className="login-art__message"><span>穗奈 / SUINAI</span><p>先聊聊你，<br />一起找方向。</p></div>
          <button className="login-art__motion" type="button" aria-label={motionLabel} aria-pressed={!animated || motionLocked}
            disabled={motionLocked} onClick={toggleMotion}><i aria-hidden="true">{animated && !motionLocked ? "Ⅱ" : "▷"}</i>{motionLocked ? motionLabel : animated ? "暂停动作" : "继续动作"}</button>
        </aside>
        <form className="auth" aria-label={mode === "login" ? "登录账号" : "创建账号"} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <p className="desktop-eyebrow">YOUR CAREER, YOUR PACE.</p>
          <div><h1>{mode === "login" ? (variant === "agent" ? "打开穗奈的工作区" : "打开你的成长桌面") : "给新的可能留个位置"}</h1><p className="auth__intro">{variant === "agent" ? <>对话、资料与真实成果，和穗奈一起，<br />先把眼前的一件事做好。</> : <>整理经历、对照岗位，和穗奈一起，<br />把求职这件事一点点说清楚。</>}</p></div>
          <label className="auth__label" htmlFor="username">用户名<input required id="username" name="username" type="text" placeholder="输入你的用户名" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" disabled={busy} /></label>
          <label className="auth__label" htmlFor="password">密码<input required minLength={8} id="password" name="password" type="password" placeholder="至少 8 位密码" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} disabled={busy} /></label>
          {mode === "register" ? <label className="auth__consent"><input id="consent" name="consent" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={busy} /><span><b>允许使用云端模型协助整理资料</b><br />{variant === "agent" ? "不勾选也能管理本地对话与资料；调用模型前需要授权，可在模型设置中更改。" : "不勾选也能使用基于已确认内容的功能。可在账号设置中更改。"}</span></label> : null}
          {error ? <div className="notice" role="alert">{error}</div> : null}
          <button className="btn btn--primary auth__submit" type="submit" disabled={busy}>{busy ? "正在打开…" : mode === "login" ? "进入我的桌面" : "创建桌面"}<span aria-hidden="true"> →</span></button>
          <button className="auth__switch" disabled={busy} type="button" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>{mode === "login" ? "第一次来？创建账号" : "已经有账号？返回登录"}</button>
          <p className="auth__promise">经历由你确认，再交给穗奈整理。</p>
        </form>
      </div>
    </section>
    <footer className="login-footer"><span>青穗集 / CAREER DESKTOP</span><a href="?preview=suinai-motion">穗奈动作试映室 ↗</a></footer>
  </main>;
}
