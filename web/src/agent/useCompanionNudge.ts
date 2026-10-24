/** 青穗集 · 页面内闲置陪伴：两分钟轻提醒、十分钟冷却、最多两次，隐藏页与输入执行时保持安静。 */
import { useEffect, useRef, useState } from "react";
import { canNudge, idleMessage } from "./companion-state";
import type { GuidanceView } from "../../../agent/src/guidance-contract";
export function useCompanionNudge({ userId, scope, enabled, blocked, hasDraft, guidance }: { userId: number; scope: string; enabled: boolean; blocked: boolean; hasDraft: boolean; guidance?: GuidanceView }) {
  const [nudge, setNudge] = useState<string | null>(null), count = useRef(0), last = useRef(0), activity = useRef(Date.now());
  const current = useRef({ enabled, blocked, hasDraft, guidance }); current.current = { enabled, blocked, hasDraft, guidance };
  useEffect(() => { try { last.current = Number(localStorage.getItem("suinai.lastNudge." + userId)) || 0; } catch {} }, [userId]);
  useEffect(() => { setNudge(null); activity.current = Date.now(); }, [scope]);
  useEffect(() => { if (blocked || hasDraft || !enabled) { activity.current = Date.now(); setNudge(null); } }, [blocked, hasDraft, enabled]);
  useEffect(() => {
    const touch = () => { activity.current = Date.now(); };
    const visibility = () => { touch(); if (document.visibilityState !== "visible") setNudge(null); };
    window.addEventListener("pointerdown", touch, { passive: true }); window.addEventListener("keydown", touch); window.addEventListener("wheel", touch, { passive: true }); document.addEventListener("visibilitychange", visibility);
    const timer = window.setInterval(() => {
      const value = current.current, now = Date.now();
      if (!canNudge({ ...value, now, lastActivity: activity.current, lastNudge: last.current, shown: count.current, visible: document.visibilityState === "visible" && document.hasFocus() })) return;
      last.current = now; count.current++; setNudge(idleMessage(value.guidance));
      try { localStorage.setItem("suinai.lastNudge." + userId, String(now)); } catch {}
    }, 5000);
    return () => { clearInterval(timer); window.removeEventListener("pointerdown", touch); window.removeEventListener("keydown", touch); window.removeEventListener("wheel", touch); document.removeEventListener("visibilitychange", visibility); };
  }, [userId]);
  return { nudge, dismiss: () => { setNudge(null); activity.current = Date.now(); } };
}
