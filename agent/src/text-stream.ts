/** 青穗集 · 正文流式缓冲：首段立即推送、后续限时合并、跨分片脱敏与停止清理。 */
import type { Secrets } from "./secrets.js";

export class TextStream {
  private batch = "";
  private timer?: ReturnType<typeof setTimeout>;
  private started = false;
  private closed = false;
  private failure?: { error: unknown };
  private readonly abort = () => this.close();

  constructor(
    private readonly secrets: Pick<Secrets, "redactChunk">,
    private readonly emit: (text: string) => void,
    private readonly signal: AbortSignal,
    private readonly intervalMs = 40,
  ) {
    if (signal.aborted) this.close();
    else signal.addEventListener("abort", this.abort, { once: true });
  }

  push(text: string) {
    if (this.failure) throw this.failure.error;
    if (this.closed || this.signal.aborted || !text) return;
    this.batch += text;
    if (!this.started) this.flush();
    if (this.batch && this.started && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        try { this.flush(); }
        catch (error) { this.failure = { error }; this.close(); }
      }, this.intervalMs);
    }
  }

  finish() {
    try {
      if (this.failure) throw this.failure.error;
      if (!this.closed && !this.signal.aborted) this.flush(true);
    } finally { this.close(); }
  }

  private flush(final = false) {
    if (this.closed || this.signal.aborted || !this.batch) return;
    const chunk = this.secrets.redactChunk(this.batch, final);
    this.batch = chunk.rest;
    if (chunk.safe) {
      this.emit(chunk.safe);
      this.started = true;
    }
  }

  private close() {
    this.closed = true;
    this.batch = "";
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.signal.removeEventListener("abort", this.abort);
  }
}
