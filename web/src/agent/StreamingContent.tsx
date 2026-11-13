/** 青穗集 · 流式粒子显字：已收分片先占位乱码，再解码成正文；历史直出、后台暂停与减少动态均不阻塞阅读。 */
import { useEffect, useMemo, useState } from "react";
import { MessageContent } from "./MessageContent";
import { useUiMotion } from "./uiMotion";
import { batchEndsAt, createReveal, receiveReveal, settleReveal } from "./stream-reveal";
import type { AgentFile } from "./types";
export function StreamingContent({ content, streaming, files, runId, animateEntrance = false }: { content: string; streaming: boolean; files: AgentFile[]; runId?: string | null; animateEntrance?: boolean }) {
  const { playing } = useUiMotion();
  const [visible, setVisible] = useState(() => typeof document !== "undefined" && document.visibilityState === "visible");
  const [sawStream, setSawStream] = useState(streaming || animateEntrance);
  const enabled = playing && visible && (streaming || sawStream);
  const [timeline, setTimeline] = useState(() => createReveal(content, performance.now(), enabled));
  if ((streaming || animateEntrance) && !sawStream) setSawStream(true);
  // 同一次提交中准备占位，避免先闪现正文、下一帧才变乱码。不会逐帧 setState。
  let current = timeline;
  if (timeline.content !== content || timeline.enabled !== enabled) {
    current = receiveReveal(timeline, content, performance.now(), enabled);
    setTimeline(current);
  }
  useEffect(() => {
    const changed = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);
  useEffect(() => {
    if (!timeline.batches.length) return;
    const endsAt = Math.max(...timeline.batches.map(batchEndsAt));
    const timer = setTimeout(() => setTimeline(state => settleReveal(state, performance.now())), Math.max(0, endsAt - performance.now()) + 24);
    return () => clearTimeout(timer);
  }, [timeline]);
  const reveal = useMemo(() => enabled && current.batches.length ? { state: current, now: performance.now() } : undefined, [enabled, current]);
  return <div className="career-draft-content streaming-content" data-streaming={streaming} data-revealing={Boolean(reveal)}>
    <MessageContent content={content} files={files} runId={runId} reveal={reveal} />
    {streaming && <span className="agent-caret" aria-hidden="true" />}
  </div>;
}

