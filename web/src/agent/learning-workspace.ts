/** 青穗集 · 学习状态：跨对话读取、串行保存与版本冲突恢复，不替用户确认学习完成。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi, AgentApiError } from "./api";
import type { LearningChange, LearningState } from "../../../agent/src/learning-contract";

export function useLearningWorkspace(userId: number, pulse: string) {
  const [state, setState] = useState<LearningState | null>(null), [error, setError] = useState(""), [saving, setSaving] = useState(false);
  const current = useRef(state), locked = useRef(false), seq = useRef(0), refreshPending = useRef(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (locked.current) { refreshPending.current = true; return; }
    const ticket = ++seq.current;
    try {
      const next = await agentApi.learning(signal);
      if (!signal?.aborted && ticket === seq.current) { current.current = next; setState(next); setError(""); }
    } catch (cause) { if (!signal?.aborted && ticket === seq.current) setError((cause as Error).message); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [userId, pulse, refresh]);
  useEffect(() => { const focus = () => void refresh(); window.addEventListener("focus", focus); return () => window.removeEventListener("focus", focus); }, [refresh]);
  async function change(value: LearningChange) {
    if (locked.current || !current.current) return false;
    locked.current = true; setSaving(true); setError(""); ++seq.current;
    try {
      const next = await agentApi.changeLearning(current.current.revision, value);
      current.current = next; setState(next); return true;
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof AgentApiError && cause.status === 409) refreshPending.current = true;
      return false;
    } finally {
      locked.current = false; setSaving(false);
      if (refreshPending.current) { refreshPending.current = false; void refresh(); }
    }
  }
  return { state, error, saving, refresh, change };
}
export type LearningWorkspaceController = ReturnType<typeof useLearningWorkspace>;
