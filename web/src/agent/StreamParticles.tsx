/** 青穗集 · 文字粒子解码：Markdown 只随分片解析，乱码与像素尘由 CSS 合成，不逐帧重排整段正文。 */
import { createContext, Fragment, memo, useContext, useMemo, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import type { Element, Root, RootContent, Text } from "hast";
import type { ExtraProps } from "react-markdown";
import { glyphSchedule, glyphSourceOffsets, scrambleGlyph, streamGraphemes, STREAM_DUST_MS, STREAM_LETTER_MS, type RevealFrame } from "./stream-reveal";

export const StreamRevealContext = createContext<RevealFrame | null>(null);
declare module "hast" {
  interface ElementData {
    streamText?: string;
    streamSource?: string;
    streamStart?: number;
  }
}
/** 只包装解析后的可见文字，不改 Markdown 标记、链接地址、文件权限或 HTML 安全规则。 */
export function streamTextPlugin() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value ?? "");
    function visit(parent: Root | Element) {
      parent.children = parent.children.map((child): RootContent => {
        if (child.type === "text" && child.value.trim()) {
          const text = child as Text;
          const floor = parent.position?.start.offset ?? 0;
          const ceiling = parent.position?.end.offset ?? source.length;
          const found = text.position?.start.offset ?? source.indexOf(text.value, floor);
          const start = found >= floor && found <= ceiling ? found : floor;
          const end = text.position?.end.offset ?? start + text.value.length;
          const data = { streamText: text.value, streamSource: source.slice(start, end), streamStart: start };
          return { type: "element", tagName: "span", properties: {}, data: { ...data }, children: [text], position: text.position };
        }
        if (child.type === "element" && !["script", "style", "textarea", "svg"].includes(child.tagName)) visit(child);
        return child;
      });
    }
    visit(tree);
  };
}
const DecodeGlyph = memo(function DecodeGlyph({ text, offset, appearsAt, readyAt, particles }: { text: string; offset: number; appearsAt: number; readyAt: number; particles: boolean }) {
  // 已挂载字符不重复改 delay；若 Markdown 结构变化导致重挂，以负延迟续播而不是重新乱码。
  const style = useMemo(() => {
    const now = performance.now();
    return {
    "--decode-delay": `${readyAt - now}ms`,
    "--mask-delay": `${appearsAt - now}ms`,
    "--decode-duration": `${STREAM_LETTER_MS}ms`,
    "--dust-duration": `${STREAM_DUST_MS}ms`,
    "--dust-x": `${(offset % 2 ? 1 : -1) * (7 + offset % 7)}px`,
    "--dust-y": `${-9 - offset % 10}px`,
    "--glyph-phase": `${-(offset % 4) * 65}ms`,
  } as CSSProperties;
  }, [appearsAt, readyAt, offset]);
  return <span className="stream-token" data-particles={particles || undefined} style={style}>
    <span className="stream-token__letter">{text}</span>
    <span className="stream-token__glyph" data-glyph={scrambleGlyph(offset)} data-next={scrambleGlyph(offset + 1)} data-last={scrambleGlyph(offset + 2)} aria-hidden="true" />
  </span>;
});
export function StreamText({ node, children, ...props }: ComponentProps<"span"> & ExtraProps) {
  const frame = useContext(StreamRevealContext);
  const data = node?.data;
  if (!frame || typeof data?.streamText !== "string" || typeof data.streamStart !== "number") return <span {...props}>{children}</span>;
  const text = data.streamText, source = data.streamSource ?? text, start = data.streamStart;
  const lastOffset = start + source.length;
  if (!frame.state.batches.some(batch => batch.to > start && batch.from < lastOffset)) return <span className="stream-text">{text}</span>;
  const glyphs = streamGraphemes(text), offsets = glyphSourceOffsets(glyphs, source, start);
  const density = Math.max(1, Math.ceil(frame.state.batches.reduce((count, batch) => count + batch.to - batch.from, 0) / 80));
  const pieces: ReactNode[] = [];
  let plain = "", plainStart = 0;
  function flush() {
    if (plain) pieces.push(<Fragment key={`plain-${plainStart}`}>{plain}</Fragment>);
    plain = "";
  }
  glyphs.forEach((glyph, index) => {
    const offset = offsets[index], schedule = glyphSchedule(frame.state, offset);
    if (/^\s+$/u.test(glyph.text) || !schedule || frame.now >= schedule.readyAt + STREAM_DUST_MS) {
      if (!plain) plainStart = glyph.index;
      plain += glyph.text;
    } else {
      flush();
      pieces.push(<DecodeGlyph key={glyph.index} text={glyph.text} offset={offset} appearsAt={schedule.appearsAt} readyAt={schedule.readyAt} particles={offset % density === 0} />);
    }
  });
  flush();
  return <span className="stream-text">{pieces}</span>;
}



