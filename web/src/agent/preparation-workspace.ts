/** 青穗集 · 求职准备状态订阅：工具完成后刷新，串行保存选择与进度，恢复版本冲突。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, AgentApiError } from "./api";
import type { PreparationState, PreparationChange } from "../../../agent/src/preparation-contract";

export function usePreparationWorkspace(userId: number, pulse: string) {
  const [state, setState] = useState<PreparationState | null>(null), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const current = useRef(state), locked = useRef(false), seq = useRef(0), pending = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (locked.current) { pending.current = true; return; }
    const ticket = ++seq.current;
    try {
      const next = await agentApi.preparation(signal);
      if (!signal?.aborted && ticket === seq.current) { current.current = next; setState(next); setError(""); }
    } catch (cause) { if (!signal?.aborted && ticket === seq.current) setError((cause as Error).message); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [userId, pulse, refresh]);
  useEffect(() => { const focus = () => void refresh(); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, [refresh]);
  async function change(value: PreparationChange) {
    if (locked.current || !current.current) return false;
    locked.current = true; ++seq.current; setSaving(true); setError("");
    try {
      const next = await agentApi.changePreparation(current.current.revision, value);
      current.current = next; setState(next); return true;
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AgentApiError && cause.status === 409) pending.current = true;
      return false;
    } finally { locked.current = false; setSaving(false); if (pending.current) { pending.current = false; void refresh(); } }
  }
  return { state, error, saving, refresh, change };
}
export type PreparationController = ReturnType<typeof usePreparationWorkspace>;
