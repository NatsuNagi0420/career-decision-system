/** 青穗集 · 新消息入场：历史加载不重播，相同消息的流式分片不重播；切换对话重建基线。 */
import { useEffect, useState } from "react";

export interface MessageEntranceState {
  scope: string | null; ready: boolean; known: ReadonlySet<string>; entering: ReadonlySet<string>;
}
export function advanceMessageEntrance(previous: MessageEntranceState, scope: string | null, ready: boolean, ids: string[], motion: boolean): MessageEntranceState {
  if (scope !== previous.scope || !ready || !previous.ready) {
    if (scope === previous.scope && !ready && !previous.ready && !previous.known.size) return previous;
    return { scope, ready, known: new Set(ids), entering: new Set() };
  }
  const added = ids.filter(id => !previous.known.has(id));
  if (!added.length && (motion || !previous.entering.size)) return previous;
  return { ...previous, known: new Set([...previous.known, ...added]), entering: motion ? new Set([...previous.entering, ...added]) : new Set() };
}
export function useMessageEntrance(scope: string | null, ready: boolean, ids: string[], motion: boolean) {
  const [state, setState] = useState<MessageEntranceState>(() => ({ scope, ready, known: new Set(ids), entering: new Set() }));
  const current = advanceMessageEntrance(state, scope, ready, ids, motion);
  if (current !== state) setState(current);
  useEffect(() => {
    if (!state.entering.size) return;
    const timer = setTimeout(() => setState(value => ({ ...value, entering: new Set() })), 420);
    return () => clearTimeout(timer);
  }, [state]);
  return current.entering;
}
