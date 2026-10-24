/** 青穗集 · 安全消息排版：仅将已登记文件转换为侧栏预览链接，禁用原始 HTML 和远程图片自动加载。 */
import { memo } from "react";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkChatEmphasis } from "./remarkChatEmphasis";
import { StreamRevealContext, StreamText, streamTextPlugin } from "./StreamParticles";
import type { RevealFrame } from "./stream-reveal";
import type { AgentFile } from "./types";
import { FileLink } from "./FileLinks";
import { isArtifactReference, resolveArtifactLink } from "./artifactLinks";
export const MessageContent = memo(function MessageContent({ content, files = [], runId, reveal }: { content: string; files?: AgentFile[]; runId?: string | null; reveal?: RevealFrame }) {
  return <StreamRevealContext.Provider value={reveal ?? null}><div className="career-message-content"><Markdown remarkPlugins={[remarkGfm, remarkChatEmphasis]} rehypePlugins={reveal ? [streamTextPlugin] : []} skipHtml urlTransform={url => resolveArtifactLink(url, files, runId) || isArtifactReference(url) ? url : defaultUrlTransform(url)} components={{
    span: StreamText,
    a: ({ href, children }) => {
      const file = resolveArtifactLink(href, files, runId);
      if (file) return <FileLink file={file}>{children}</FileLink>;
      if (href && isArtifactReference(href)) return <span className="file-unavailable" title="此文件尚未保存为可访问的版本">{children}（文件尚不可用）</span>;
      return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    img: ({ alt }) => <span className="career-image-placeholder">[图片未自动加载{alt ? "：" + alt : ""}]</span>,
    table: ({ children }) => <div className="career-message-table"><table>{children}</table></div>,
  }}>{content}</Markdown></div></StreamRevealContext.Provider>;
});

