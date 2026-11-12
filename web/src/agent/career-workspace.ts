/** 青穗集 · 统一职业资料状态：聊天、档案与工作台共用一次读取和串行版本更新。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, AgentApiError } from "./api";
import type { CareerState, CareerChange } from "./career";
export type CareerFactHandler = (id: string, action: "confirm" | "dismiss") => Promise<boolean>;
export type CareerChangeHandler = (change: CareerChange, message: string) => Promise<boolean>;
export function useCareerWorkspace(userId: number, pulse: string, conversationId?: string | null) {
  const [state, setState] = useState<CareerState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const lock = useRef(false), requestId = useRef(0), stateRef = useRef(state), refreshAfterSave = useRef(false);
  stateRef.current = state;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (lock.current) { refreshAfterSave.current = true; return; }
    const seq = ++requestId.current;
    try {
      const next = await agentApi.career(signal, conversationId);
      if (!signal?.aborted && seq === requestId.current) { stateRef.current = next; setState(next); setError(""); }
    } catch (cause) { if (!signal?.aborted && seq === requestId.current) setError((cause as Error).message); }
    finally { if (!signal?.aborted && seq === requestId.current) setLoading(false); }
  }, [conversationId]);
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [userId, pulse, refresh]);
  useEffect(() => {
    const focus = () => { if (!lock.current) void refresh(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [refresh]);
  useEffect(() => { setNotice(""); }, [conversationId]);
  const change: CareerChangeHandler = async (input, message) => {
    if (lock.current || !stateRef.current) return false;
    lock.current = true; setSaving(true); setError(""); setNotice("");
    ++requestId.current;
    try {
      const next = await agentApi.changeCareer(stateRef.current.revision, input);
      ++requestId.current; stateRef.current = next; setState(next); setNotice(message); return true;
    } catch (cause) { setError((cause as Error).message); refreshAfterSave.current = cause instanceof AgentApiError && cause.status === 409; return false; }
    finally { lock.current = false; setSaving(false); if (refreshAfterSave.current) { refreshAfterSave.current = false; void refresh(); } }
  };

  const resolveFact: CareerFactHandler = async (id, action) => {
    if (lock.current) return false;
    lock.current = true; setSaving(true); setError(""); setNotice(""); ++requestId.current;
    try {
      const next = await agentApi.resolveCareerFact(id, action);
      ++requestId.current; stateRef.current = next; setState(next);
      setNotice(action === "confirm" ? "已记入档案。" : "已放下这条线索。"); return true;
    } catch (cause) { setError((cause as Error).message); refreshAfterSave.current = true; return false; }
    finally { lock.current = false; setSaving(false); if (refreshAfterSave.current) { refreshAfterSave.current = false; void refresh(); } }
  };
  return { state, error, notice, saving, loading, refresh, change, resolveFact, dismissNotice: () => setNotice("") };
}
export type CareerWorkspaceController = ReturnType<typeof useCareerWorkspace>;
