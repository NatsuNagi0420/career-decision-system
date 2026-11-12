/** 青穗集 · 会话整理的手动刷新入口；自动整理由服务端持久队列负责。 */
import { useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import type { GuidanceView } from "../../../agent/src/guidance-contract";
import type { Snapshot } from "./types";
export function useConversationInsights({ conversationId, snapshot, profileId, enabled, blocked, onUpdate }: {
  conversationId: string | null; snapshot: Snapshot | undefined; profileId: string; enabled: boolean; blocked: boolean; onUpdate: (cid: string, value: GuidanceView) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false), [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null), scope = useRef(conversationId);
  scope.current = conversationId;
  useEffect(() => { pending.current?.abort(); pending.current = null; setError(""); setAnalyzing(false); return () => { pending.current?.abort(); }; }, [conversationId]);
  async function refresh() {
    const messageId = snapshot?.messages.filter(m => m.role === "user").at(-1)?.id;
    if (!conversationId || !messageId || !enabled || blocked || !profileId || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setAnalyzing(true); setError("");
    try { const value = await agentApi.analyzeConversation(conversationId, profileId, messageId, controller.signal, true); if (!controller.signal.aborted && scope.current === conversationId) onUpdate(conversationId, value); }
    catch (cause) { if (!controller.signal.aborted && scope.current === conversationId) setError((cause as Error).message); }
    finally { if (pending.current === controller) { pending.current = null; setAnalyzing(false); } }
  }
  return { analyzing, error, refresh };
}
