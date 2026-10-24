/** 青穗集 · 职业工作台回归：欢迎入口、像素素材和安全 Markdown 排版，不调用真实模型。 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CareerWelcome } from "./CareerWelcome";
import { CAREER_QUICK_PROMPTS, CAREER_STARTERS, CareerIcon } from "./CareerVisuals";
import { MessageContent } from "./MessageContent";

const noop = () => {};

describe("职业对话起始页", () => {
  it("展示三个真实需求入口，不伪造用户画像和完成状态", () => {
    const html = renderToStaticMarkup(<CareerWelcome connected onPrompt={noop} onConnect={noop} />);
    expect(html).toContain("你好，我是穗奈。");
    expect(html).toContain("梳理经历");
    expect(html).toContain("发现优势");
    expect(html).toContain("探索方向");
    expect(html.match(/class="career-step-card /g)).toHaveLength(3);
    expect(html).not.toContain("连接模型，和穗奈聊聊");
    expect(html).not.toMatch(/匹配度|画像已完成|测评已完成/);
    expect(CAREER_STARTERS.every(item => item.prompt.length > 20)).toBe(true);
    expect(CAREER_QUICK_PROMPTS).toHaveLength(3);
  });

  it("尚未连接模型时给出设置入口", () => {
    const html = renderToStaticMarkup(<CareerWelcome connected={false} onPrompt={noop} onConnect={noop} />);
    expect(html).toContain("连接模型，和穗奈聊聊");
  });

  it("所有像素图标与现有头像都能在公开资源目录中找到", () => {
    const names = ["newChat", "history", "resume", "send", "folder", "target", "strengths", "compass", "plan", "search", "settings", "complete", "sprout", "notes", "growth", "direction", "heart", "star", "seedling"] as const;
    const html = renderToStaticMarkup(<>{names.map(name => <CareerIcon key={name} name={name} />)}<CareerWelcome connected onPrompt={noop} onConnect={noop} /></>);
    const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]!);
    expect(sources.length).toBeGreaterThanOrEqual(names.length + 1);
    for (const source of sources) {
      expect(source).toMatch(/^\/api\/assets\/brand\//);
      expect(existsSync(new URL("../../../assets/web/" + source.slice("/api/assets/".length), import.meta.url)), source).toBe(true);
    }
    expect(html).toContain("/api/assets/brand/suinai-avatar/suinai-avatar.png");
  });
});

describe("安全消息排版", () => {
  it("渲染标题、列表、代码和可横向滚动的表格", () => {
    const html = renderToStaticMarkup(<MessageContent content={"## 建议\n\n- 真实经历\n- 下一步\n\n```ts\nconst next = 1;\n```\n\n| 阶段 | 产出 |\n| --- | --- |\n| 本周 | 练习 |"} />);
    expect(html).toContain("<h2>建议</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain('class="language-ts"');
    expect(html).toContain('class="career-message-table"');
    expect(html).toContain("<table>");
  });

  it("跳过原始 HTML，不自动加载消息中的远程图片", () => {
    const html = renderToStaticMarkup(<MessageContent content={'<script>alert(1)</script>\n\n<iframe src="https://example.com/private"></iframe>\n\n![参考图](https://example.com/tracking.png)'} />);
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("tracking.png");
    expect(html).toContain("图片未自动加载：参考图");
  });

  it("外部链接隔离新窗口，危险链接不可执行", () => {
    const html = renderToStaticMarkup(<MessageContent content={'[资料](https://example.com)\n\n[危险](javascript:alert%281%29)'} />);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain('href="javascript:');
  });
});
