/** 青穗集 · 简历对话状态：主对话与按需预览共用一份草稿，异步刷新不覆盖正在提交的确认。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import type { ResumeChange, ResumeState } from "../../../agent/src/resume-contract";
export type ApplyResumeChange = (change: ResumeChange) => Promise<ResumeState | null>;
export function useResumeWorkspace(userId: number, pulse: string, active: boolean, conversationId?: string | null) {
  const [state, setState] = useState<ResumeState | null>(null), [saving, setSaving] = useState(false), [error, setError] = useState("");
  const current = useRef(state), lock = useRef(false), seq = useRef(0), alive = useRef(true), refreshLater = useRef(false);
  current.current = state;
  useEffect(() => { alive.current = true; return () => { alive.current = false; ++seq.current; }; }, [userId]);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (lock.current) { refreshLater.current = true; return; }
    const request = ++seq.current;
    try { const next = await agentApi.resume(signal); if (alive.current && !signal?.aborted && seq.current === request) { current.current = next; setState(next); setError(""); } }
    catch (cause) { if (alive.current && !signal?.aborted && seq.current === request) setError((cause as Error).message); }
  }, []);
  useEffect(() => { if (!active) return; const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [userId, pulse, active, refresh]);
  const apply: ApplyResumeChange = async change => {
    if (!current.current || lock.current) return null;
    lock.current = true; setSaving(true); setError(""); ++seq.current;
    try { const next = await agentApi.changeResume(current.current.revision, change, conversationId); if (alive.current) { current.current = next; setState(next); } return next; }
    catch (cause) { if (alive.current) setError((cause as Error).message); return null; }
    finally { lock.current = false; if (alive.current) { setSaving(false); if (refreshLater.current) { refreshLater.current = false; void refresh(); } } }
  };
  return { state, saving, error, apply, refresh };
}
export type ResumeWorkspaceView = ReturnType<typeof useResumeWorkspace>;
