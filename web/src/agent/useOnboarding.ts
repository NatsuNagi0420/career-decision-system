/** 青穗集 · 账号入门进度：服务端持久化，浏览器仅作断网兜底，不调用模型或写入聊天。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import { ONBOARDING_VERSION, ONBOARDING_LAST_STEP, onboardingCacheKey } from "./onboarding";
import type { OnboardingState, OnboardingUpdate } from "../../../agent/src/onboarding-contract";
function readTerminal(key: string) {
  try { const status = localStorage.getItem(key); return status === "completed" || status === "skipped" ? status : null; } catch { return null; }
}
function desktopAvailable() {
  return document.visibilityState === "visible" && !document.querySelector("[data-startup-content][inert]");
}
export function useOnboarding({ userId, mode, ready, blocked, hasDraft }: { userId: number; mode: "local" | "server"; ready: boolean; blocked: boolean; hasDraft: boolean }) {
  const [saved, setSaved] = useState<OnboardingState | null>(null);
  const [active, setActive] = useState<{ step: number; manual: boolean } | null>(null);
  const [available, setAvailable] = useState(false), [error, setError] = useState("");
  const opened = useRef(false), lifetime = useRef<AbortController | null>(null);
  const key = onboardingCacheKey(userId, mode);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller; opened.current = false;
    setSaved(null); setActive(null); setError("");
    void agentApi.onboarding(controller.signal).then(value => {
      if (!controller.signal.aborted) {
        const fallback = readTerminal(key);
        setSaved(fallback && value.status === "pending" ? { ...value, status: fallback } : value);
        // 上次断网时已完成／跳过，这次把兜底状态补写回账号，而不是重新打断用户。
        if (fallback && value.status === "pending") void agentApi.updateOnboarding({ status: fallback, step: value.step }, controller.signal).catch(() => {});
      }
    }).catch(() => { /* 教学状态不可用不阻断应用；仍可从问号手动打开。 */ });
    return () => controller.abort();
  }, [userId, key]);
  useEffect(() => {
    const update = () => setAvailable(desktopAvailable());
    const root = document.querySelector("[data-startup-content]");
    const observer = new MutationObserver(update);
    if (root) observer.observe(root, { attributes: true, attributeFilter: ["inert"] });
    document.addEventListener("visibilitychange", update); update();
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  useEffect(() => {
    if (ready && available && !blocked && !hasDraft && !opened.current && saved?.status === "pending" && saved.version === ONBOARDING_VERSION) {
      opened.current = true;
      setActive({ step: Math.min(ONBOARDING_LAST_STEP, Math.max(0, saved.step)), manual: false });
    }
  }, [ready, available, blocked, hasDraft, saved]);
  const persist = useCallback((value: OnboardingUpdate) => {
    const signal = lifetime.current?.signal;
    if (!signal || signal.aborted) return;
    void agentApi.updateOnboarding(value, signal).catch(() => {
      if (!signal.aborted) setError("引导进度暂未同步，不影响正常使用；可从问号重新查看。");
    });
  }, []);
  const start = useCallback(() => { opened.current = true; setError(""); setActive({ step: 0, manual: true }); }, []);
  const move = useCallback((step: number) => {
    const next = Math.min(ONBOARDING_LAST_STEP, Math.max(0, step));
    setActive(value => value ? { ...value, step: next } : null);
    if (saved?.status === "pending") persist({ status: "pending", step: next });
  }, [saved?.status, persist]);
  const finish = useCallback((status: "completed" | "skipped") => {
    const step = status === "completed" ? ONBOARDING_LAST_STEP : active?.step ?? 0;
    opened.current = true; setActive(null);
    try { localStorage.setItem(key, status); } catch { /* 服务端进度仍能保存。 */ }
    setSaved({ version: ONBOARDING_VERSION, status, step, updated_at: new Date().toISOString() });
    persist({ status, step });
    if (status === "completed") requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("#agent-message")?.focus({ preventScroll: true }));
  }, [active?.step, key, persist]);
  return { active, start, move, finish, error };
}
