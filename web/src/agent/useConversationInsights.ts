/** 青穗集 · 已发送对话的只读整理：去重、取消过时响应、失败不影响主聊天，不上传输入框草稿。 */
import { useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import type { GuidanceView } from "../../../agent/src/guidance-contract";
import type { Snapshot } from "./types";
export function useConversationInsights({ conversationId, snapshot, profileId, sentRunId, enabled, blocked, onUpdate }: {
  conversationId: string | null; snapshot: Snapshot | undefined; profileId: string; sentRunId: string | null; enabled: boolean; blocked: boolean; onUpdate: (cid: string, value: GuidanceView) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const update = useRef(onUpdate), attempted = useRef(new Set<string>()), scope = useRef(conversationId);
  update.current = onUpdate; scope.current = conversationId;
  const lastUser = snapshot?.messages.filter(message => message.role === "user").at(-1)?.id;
  const lastRun = snapshot?.runs.at(-1), status = lastRun?.status;
  const analyzed = snapshot?.guidance?.analyzed_message_id;
  useEffect(() => { setError(""); setAnalyzing(false); setRetry(0); }, [conversationId]);
  useEffect(() => {
    if (!conversationId || !lastUser || !enabled || blocked || !profileId || (!retry && lastRun?.id !== sentRunId) || !["completed", "waiting_input"].includes(status ?? "") || (analyzed === lastUser && !retry)) return;
    const key = conversationId + ":" + lastUser + ":" + retry;
    if (attempted.current.has(key)) return;
    const controller = new AbortController(); let started = false;
    const timeout = window.setTimeout(async () => {
      if (document.visibilityState !== "visible") return;
      attempted.current.add(key); started = true; setAnalyzing(true); setError("");
      try { const value = await agentApi.analyzeConversation(conversationId, profileId, lastUser, controller.signal); if (!controller.signal.aborted && scope.current === conversationId) update.current(conversationId, value); }
      catch (cause) { if (!controller.signal.aborted && scope.current === conversationId) setError((cause as Error).message); }
      finally { if (!controller.signal.aborted && scope.current === conversationId) setAnalyzing(false); }
    }, 1000);
    return () => { clearTimeout(timeout); controller.abort(); if (started) setAnalyzing(false); };
  }, [conversationId, lastUser, enabled, blocked, profileId, sentRunId, lastRun?.id, status, analyzed, retry]);
  return { analyzing, error, refresh: () => { if (!analyzing) setRetry(value => value + 1); } };
}
