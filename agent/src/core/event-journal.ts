/** 青穗集 · 事件日志与实时发布：统一脱敏、落库、回放和会话订阅。 */
import { EventEmitter } from "node:events";
import { Store } from "../store.js";
import type { AgentEvent } from "../types.js";
import { isRecord } from "../errors.js";

export type EventRedactor = (value: unknown) => unknown;
export type AgentEventListener = (event: AgentEvent) => void;

export class EventJournal {
  readonly hub = new EventEmitter();

  constructor(
    private readonly store: Store,
    private readonly redactValue: EventRedactor,
  ) {
    this.hub.setMaxListeners(100);
  }

  append(
    conversationId: string,
    runId: string | null,
    kind: string,
    data: Record<string, unknown>,
    publish = true,
  ) {
    if (kind === "message.added" && isRecord(data.message)) {
      const { response_items: _private, ...message } = data.message;
      data = { ...data, message };
    }
    const sanitized = this.redactValue(data) as Record<string, unknown>;
    const value = this.store.appendEvent(conversationId, runId, kind, sanitized);
    if (publish) this.hub.emit(conversationId, value);
    return value;
  }

  subscribe(conversationId: string, listener: AgentEventListener) {
    this.hub.on(conversationId, listener);
    return () => this.hub.off(conversationId, listener);
  }

  emit(topic: string, ...args: unknown[]) {
    return this.hub.emit(topic, ...args);
  }

  off(topic: string, listener: (...args: any[]) => void) {
    return this.hub.off(topic, listener);
  }

  removeAllListeners() {
    this.hub.removeAllListeners();
  }
}
