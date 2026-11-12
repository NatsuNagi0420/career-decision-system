/** 青穗集 · 登录注册：使用统一透明素材，真实会话保留、密码校验与显式模型授权。 */
import { useId, useState, type ReactNode } from "react";
import { AutoHeight } from "./AutoHeight";
import { api, tokenStore } from "../api/client";
import { useReducedMotion } from "../character/preferences";
import "./login.css";

const asset = (name: string) => "/api/assets/brand/account/" + name + ".webp";
function Icon({ name, className = "" }: { name: string; className?: string }) {
  return <img className={"account-icon " + className} src={asset(name)} width={28} height={28} alt="" aria-hidden="true" draggable={false} />;
}
function readMotion() {
  try { return localStorage.getItem("career.motion") !== "0" && localStorage.getItem("career.suinai.motion") !== "0"; } catch { return true; }
}

export function Login({ onSuccess, onBack, variant = "career", showModelConsent = true, onLocalMode, localContent, localBusy = false, localError = "" }: { onSuccess: () => void; onBack?: () => void; variant?: "career" | "agent"; showModelConsent?: boolean; onLocalMode?: () => Promise<void>; localContent?: ReactNode; localBusy?: boolean; localError?: string }) {
  const [method, setMethod] = useState<"official" | "api-key">("official");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [consent, setConsent] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [animated, setAnimated] = useState(readMotion);
  const reducedMotion = useReducedMotion();
  const id = useId();
  const register = mode === "register";
  const motionLabel = reducedMotion ? "系统已减少动态" : animated ? "暂停穗奈动画" : "播放穗奈动画";
  const confirmationError = register && confirmation.length > 0 && password !== confirmation;
  function switchMode(next: "login" | "register") {
    if (busy || localBusy || next === mode) return;
    setMode(next); setError(null); setPassword(""); setConfirmation(""); setVisible(false);
  }
  async function submit() {
    if (busy || localBusy) return;
    if (register && password !== confirmation) { setError("两次输入的密码不一致。"); return; }
    setBusy(true); setError(null);
    try {
      const session = register ? await api.register(username.trim(), password, consent) : await api.login(username.trim(), password);
      tokenStore.set(session.token, remember); onSuccess();
    } catch (caught) { setError((caught as Error).message); }
    finally { setBusy(false); }
  }
  return <main className="account-screen" data-mode={mode} data-variant={variant} data-ui-motion={animated && !reducedMotion ? "on" : "off"}>
    <section className="account-window" aria-label="青穗集账号入口">
      <aside className="account-art" aria-label="穗奈欢迎窗口" data-animated={animated && !reducedMotion}>
        <div className="account-brand"><span className="account-brand__mark"><Icon name="sprout" /></span><strong>青穗集<small>CAREER DESKTOP</small></strong></div>
        <Icon name="sparkle" className="account-star account-star--one" />
        <Icon name="sparkle" className="account-star account-star--two" />
        <div className="account-art__grid" aria-hidden="true" />
        <img className="account-character" src={asset("suinai-welcome")} alt="穗奈向你问好，陪你整理求职的下一步" draggable={false} fetchPriority="high" />
        <img className="account-decoration" src={asset("sprout-decoration")} alt="" aria-hidden="true" draggable={false} />
        <div className="account-bubble"><span>穗奈 / SUINAI</span><p>{register ? <>先聊聊你，<br />一起找到方向。</> : <>欢迎回来，<br />一起继续前进吧。</>}</p></div>
        <button className="account-motion" type="button" title={motionLabel} aria-label={motionLabel} aria-pressed={!animated || reducedMotion} disabled={reducedMotion} onClick={() => {
          const next = !animated; setAnimated(next);
          try { localStorage.setItem("career.suinai.motion", next ? "1" : "0"); } catch { /* 动画偏好不影响账号登录。 */ }
        }}><svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true">{animated && !reducedMotion ? <path d="M7 5v10M13 5v10" stroke="currentColor" strokeWidth="2" /> : <path d="m7 4 9 6-9 6V4Z" fill="currentColor" />}</svg></button>
      </aside>
      <section className="account-panel" data-method={method}>
        {onLocalMode && <div className="account-methods" role="group" aria-label="登录方式">
          <button type="button" aria-pressed={method === "official"} disabled={busy || localBusy} onClick={() => setMethod("official")}><Icon name="user" />青穗集账号登录</button>
          <button type="button" aria-pressed={method === "api-key"} disabled={busy || localBusy} onClick={() => { setMethod("api-key"); if (!localContent) void onLocalMode(); }}><Icon name="key" />API-KEY 登录</button>
        </div>}
        <AutoHeight className="account-view" contentClassName="account-view__content" changeKey={method + ":" + mode} motion={animated && !reducedMotion}>
        {method === "api-key" && onLocalMode ? <div className="account-api-content">{localContent ?? <div className="account-api-loading" role="status">{localBusy ? "正在读取本机配置…" : localError ? <><p role="alert">{localError}</p><button type="button" onClick={() => void onLocalMode()}>重试</button></> : "选择一个模型连接开始"}</div>}</div> : <>

        <div className="account-tabs" role="tablist" aria-label="账号操作">
          {(["login", "register"] as const).map(tab => <button key={tab} id={id + "-" + tab} type="button" role="tab" tabIndex={mode === tab ? 0 : -1} aria-selected={mode === tab} aria-controls={id + "-form"} disabled={busy || localBusy} onClick={() => switchMode(tab)} onKeyDown={event => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault(); const next = event.key === "Home" ? "login" : event.key === "End" ? "register" : mode === "login" ? "register" : "login";
              switchMode(next); document.getElementById(id + "-" + next)?.focus();
            }
          }}>{tab === "login" ? "登录" : "注册"}</button>)}
          <span className="account-tabs__end"><Icon name="sparkle" /></span>
        </div>
        <div id={id + "-form"} className="account-content" role="tabpanel" aria-labelledby={id + "-" + mode}>
          <form className="account-form" aria-label={register ? "创建账号" : "登录账号"} onSubmit={event => { event.preventDefault(); void submit(); }}>
            <h1>{register ? "给新的可能留个位置" : "欢迎回来"}</h1>
            <AutoHeight className="account-fields-motion" motion={animated && !reducedMotion}><div className="account-fields">
              <label className="account-field" htmlFor="username"><span>用户名</span><span className="account-input"><Icon name="user" /><input required id="username" name="username" type="text" placeholder="输入你的用户名" minLength={register ? 3 : undefined} maxLength={40} pattern={register ? "(?:[a-zA-Z0-9_]|-)+" : undefined} title={register ? "3–40 位字母、数字、下划线或短横线" : undefined} value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={busy || localBusy} /></span></label>
              <label className="account-field" htmlFor="password"><span>密码</span><span className="account-input"><Icon name="lock" /><input required minLength={register ? 12 : 8} maxLength={128} id="password" name="password" aria-label="密码" type={visible ? "text" : "password"} placeholder={register ? "至少 12 位密码" : "输入你的密码"} value={password} onChange={event => setPassword(event.target.value)} autoComplete={register ? "new-password" : "current-password"} disabled={busy || localBusy} /><button className="account-reveal" type="button" title={visible ? "隐藏密码" : "显示密码"} aria-label={visible ? "隐藏密码" : "显示密码"} aria-pressed={visible} disabled={busy || localBusy} onClick={() => setVisible(value => !value)}><Icon name={visible ? "eye-off" : "eye"} /></button></span></label>
              {register && <label className="account-field account-field--enter" htmlFor="confirm-password"><span>确认密码</span><span className="account-input" data-invalid={confirmationError}><Icon name="lock" /><input required id="confirm-password" name="confirm-password" type={visible ? "text" : "password"} placeholder="再输入一次密码" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="new-password" aria-invalid={confirmationError} aria-describedby={confirmationError ? id + "-mismatch" : undefined} disabled={busy || localBusy} /></span>{confirmationError && <small id={id + "-mismatch"} className="account-field-error">两次输入的密码不一致</small>}</label>}
            </div></AutoHeight>
            <div className="account-options"><label className="account-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy || localBusy} /><span className="account-check__box" aria-hidden="true"><Icon name={remember ? "checkbox-checked" : "checkbox"} /></span><span>记住我</span></label><span className="account-options__privacy" title="凭证保存在当前浏览器，不保存密码" aria-label="凭证保存在当前浏览器，不保存密码"><Icon name="shield" /></span></div>
            <AutoHeight className="account-optional" motion={animated && !reducedMotion}>{register && showModelConsent && <div className="account-consent"><div><label className="account-check"><input id="consent" name="consent" type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy || localBusy} /><span className="account-check__box" aria-hidden="true"><Icon name={consent ? "checkbox-checked" : "checkbox"} /></span><span>允许云端模型协助处理资料</span></label><button className="account-consent__help" type="button" aria-label="查看资料授权说明" title="资料授权说明" aria-expanded={showConsent} aria-controls={id + "-consent"} onClick={() => setShowConsent(value => !value)}>i</button></div><AutoHeight motion={animated && !reducedMotion}>{showConsent && <p id={id + "-consent"}>调用模型时，会发送当前任务所需的对话和资料。不勾选也能创建账号；使用模型前再授权，可在设置中更改。</p>}</AutoHeight></div>}</AutoHeight>
            <AutoHeight className="account-optional" motion={animated && !reducedMotion}>{(error || localError) && <div className="account-error" role="alert">{error || localError}</div>}</AutoHeight>
            <button className="account-submit" type="submit" disabled={busy || localBusy} aria-busy={busy}><span>{busy ? "正在连接…" : register ? "创建账号" : "登录桌面"}</span>{busy ? <span className="account-spinner" aria-hidden="true" /> : <Icon name="arrow-right" />}</button>
            <div className="account-switch"><span>{register ? "已经有账号？" : "还没有账号？"}</span><button disabled={busy || localBusy} type="button" onClick={() => switchMode(register ? "login" : "register")}>{register ? "立即登录" : "创建账号"}</button></div>
          </form>
          <div className="account-footer"><span title="官方账号支持电脑、小程序和云端同步" aria-label="官方账号支持多端同步"><Icon name="cloud-sync" /></span><span className="account-footer__line" /><span title="资料按账号隔离" aria-label="资料按账号隔离"><Icon name="shield" /></span></div>
        </div>
      </>}
        </AutoHeight>
      </section>
    </section>
    {onBack && <button className="account-back" type="button" onClick={onBack}><Icon name="arrow-left" /><span>返回</span></button>}
  </main>;
}
