/** 青穗集 · 会话切换缓存：按账号驻留最近历史，合并预读请求，并保护新事件与阅读位置。 */
import { initialView, type ViewState } from "./state";
import type { Conversation, Snapshot } from "./types";

export interface ConversationScroll { top: number; atBottom: boolean; }
interface Entry { view: ViewState; loadedAt: number; scroll?: ConversationScroll; }
interface Pending { controller: AbortController; promise: Promise<ViewState>; }

export class ConversationCache {
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();

  constructor(
    private fetchSnapshot: (id: string, signal: AbortSignal) => Promise<Snapshot>,
    private capacity = 8,
    private maxAge = 10_000,
    private now = Date.now,
  ) {}

  get(id: string): ViewState | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry.view;
  }

  remember(view: ViewState): ViewState {
    const id = view.snapshot.conversation.id, previous = this.entries.get(id);
    // 较晚完成的 HTTP 快照不能覆盖已经收到的 SSE 事件。
    if (previous && previous.view.snapshot.last_seq > view.snapshot.last_seq) return previous.view;
    const conversation = previous?.view.snapshot.conversation;
    if (conversation && conversation.updated_at > view.snapshot.conversation.updated_at)
      view = { ...view, snapshot: { ...view.snapshot, conversation } };
    this.entries.delete(id);
    this.entries.set(id, { ...previous, view, loadedAt: previous?.loadedAt ?? -Infinity });
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return view;
  }

  updateConversation(conversation: Conversation) {
    const entry = this.entries.get(conversation.id);
    if (entry) entry.view = { ...entry.view, snapshot: { ...entry.view.snapshot, conversation } };
  }

  saveScroll(id: string, scroll: ConversationScroll) {
    const entry = this.entries.get(id);
    if (entry) entry.scroll = scroll;
  }

  scroll(id: string) { return this.entries.get(id)?.scroll; }

  load(id: string, force = false): Promise<ViewState> {
    const pending = this.pending.get(id);
    if (pending) return pending.promise;
    const entry = this.entries.get(id);
    if (!force && entry && this.now() - entry.loadedAt < this.maxAge)
      return Promise.resolve(this.get(id)!);
    const controller = new AbortController();
    const request: Pending = { controller, promise: null! };
    request.promise = Promise.resolve().then(() => this.fetchSnapshot(id, controller.signal)).then(snapshot => {
      // 即使底层请求没有及时响应 abort，也不能让已删除/已登出的历史重新进入缓存。
      if (controller.signal.aborted || this.pending.get(id) !== request)
        throw new DOMException("会话读取已取消", "AbortError");
      const view = this.remember(initialView(snapshot));
      this.entries.get(id)!.loadedAt = this.now();
      return view;
    }).finally(() => { if (this.pending.get(id) === request) this.pending.delete(id); });
    this.pending.set(id, request);
    return request.promise;
  }

  remove(id: string) {
    this.entries.delete(id);
    this.pending.get(id)?.controller.abort();
    this.pending.delete(id);
  }

  clear() {
    for (const request of this.pending.values()) request.controller.abort();
    this.pending.clear();
    this.entries.clear();
  }
}
