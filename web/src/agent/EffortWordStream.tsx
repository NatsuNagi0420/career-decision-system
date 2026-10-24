/** 青穗集 · 日文词语变换：局部低帧率更新，浮层关闭、页面后台或动效禁用时停止计时。 */
import { useEffect, useRef, useState } from "react";
import { effortWordFrame } from "./effortWords";

export function EffortWordStream({ active }: { active: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const panel = ref.current?.closest<HTMLElement>("[popover]");
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => { clearInterval(timer); timer = undefined; };
    const sync = () => {
      stop();
      if (!document.hidden && panel?.matches(":popover-open")) timer = setInterval(() => setTick(value => value + 1), 140);
    };
    panel?.addEventListener("toggle", sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => { stop(); panel?.removeEventListener("toggle", sync); document.removeEventListener("visibilitychange", sync); };
  }, [active]);
  return <span ref={ref} className="agent-effort-word-stream" data-word-motion={active ? "enabled" : "still"}>
    {[0, 1].map(row => <span className={"agent-effort-ascii" + (row ? " agent-effort-ascii--reverse" : "")} key={row}>
      {[0, 1].map(copy => <span className="agent-effort-word-loop" key={copy}>{effortWordFrame(active ? tick : 0, row).map((word, slot) => <span className="agent-effort-word" lang="ja" key={slot}>{word}</span>)}</span>)}
    </span>)}
  </span>;
}
