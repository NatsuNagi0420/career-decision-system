/** 青穗集 · 流式粒子预览：复用正式消息组件，用合成分片观察解码效果，不调用模型或读取用户会话。 */
import { useEffect, useState } from "react";
import { SUINAI_AVATAR_URL } from "../assets";
import { StreamingContent } from "./StreamingContent";
import { UiMotionToggle } from "./AsciiArt";
import { MessageContent } from "./MessageContent";
import { useMessageEntrance } from "./messageEntrance";
import { useUiMotion } from "./uiMotion";
import "./agent.css";
import "./career-theme.css";
import "./message-interactions.css";
import "./stream-preview.css";
const BUBBLE_SAMPLE = '你是觉得:** “怎么看怎么难受，像个半成品” **。\n\n先不用急着推翻重做。我们把问题拆小，一次处理一件事。\n\n1. **先确认方向**：找出最影响体验的部分。\n2. **再定下一步**：做一个你能马上看到的改进。\n\n> 慢一点也没关系，我们一步一步来。';
const DEMO = "这是示例文字。\n\n我会陪你把真实经历，慢慢整理成清晰的下一步。\n\n- **先认识自己**：说说你最有成就感的一件事。\n- **再看方向**：对照目标岗位，找到已经具备的能力。\n- **一起行动**：把下一步拆成今天就能完成的小任务。\n\n中文、English 和 emoji 🌱 都会按收到的内容逐段显现。";
const FILES: [] = [];
export function StreamPreview() {
  const [text, setText] = useState(""), [streaming, setStreaming] = useState(false), [play, setPlay] = useState(0), [sample, setSample] = useState(false);
  const { playing } = useUiMotion();
  const entering = useMessageEntrance("stream-preview", true, play ? ["history", "reply-" + play] : ["history"], playing);
  useEffect(() => {
    if (!play) return;
    setText(""); setStreaming(true);
    const content = sample ? "这是示例文字" : DEMO;
    let cursor = 0, step = 0, timer: ReturnType<typeof setTimeout>;
    function next() {
      cursor = Math.min(content.length, cursor + (sample ? content.length : [6, 16, 9, 22, 12][step % 5]));
      // 预览分片不会截断 emoji 的 UTF-16 代理对。
      if (cursor < content.length && /[\uD800-\uDBFF]/.test(content[cursor - 1])) cursor++;
      setText(content.slice(0, cursor));
      if (cursor < content.length) timer = setTimeout(next, [460, 260, 680, 180, 320][step++ % 5]);
      else timer = setTimeout(() => setStreaming(false), 240);
    }
    timer = setTimeout(next, 180);
    return () => clearTimeout(timer);
  }, [play, sample]);
  function replay(one: boolean) { setSample(one); setPlay(value => value + 1); }
  return <main className="career-workspace stream-preview" data-inspector-open="false" data-ui-motion={playing ? "on" : "off"}>
    <section className="stream-preview__window">
      <header className="stream-preview__header"><strong>穗奈 · 对话预览</strong><UiMotionToggle /></header>
      <div className="stream-preview__messages">
        <article className="agent-message agent-message--assistant">
          <img className="agent-message-avatar" src={SUINAI_AVATAR_URL} alt="穗奈" width={36} height={36} />
          <header>穗奈<small>12:21</small></header>
          <MessageContent content={BUBBLE_SAMPLE} />
        </article>
        {play ? <article key={play} className="agent-message agent-message--assistant" data-entering={entering.has("reply-" + play) || undefined}>
          <img className="agent-message-avatar" src={SUINAI_AVATAR_URL} alt="穗奈" width={36} height={36} />
          <header>穗奈</header>
          <StreamingContent key={play} content={text} streaming={streaming} files={FILES} />
        </article> : null}
      </div>
      <footer className="stream-preview__controls"><button type="button" onClick={() => replay(true)}>这是示例文字</button><button type="button" onClick={() => replay(false)}>播放流式演示</button></footer>
    </section>
  </main>;
}
