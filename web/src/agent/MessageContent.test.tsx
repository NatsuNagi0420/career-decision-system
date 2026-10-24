/** 青穗集 · 消息排版回归：宽松中文加粗、原文保真、流式位置与 Markdown 安全。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageContent } from "./MessageContent";
import { createReveal } from "./stream-reveal";
const render = (content: string) => renderToStaticMarkup(<MessageContent content={content} />);

describe("聊天 Markdown 加粗兼容", () => {
  it("修复截图中的中文引号和内侧空格，不显示成对加粗标记", () => {
    const html = render('你是觉得:** “怎么看怎么难受，像个劣质的半成品” **。');
    expect(html).toContain('<strong>“怎么看怎么难受，像个劣质的半成品”</strong>');
    expect(html).not.toContain('**');
  });
  it("正常 Markdown、列表和链接继续排版", () => {
    const html = render('**重点**和**“引用”**。\n\n- **下一步**：先试试。\n\n[链接](https://example.com)');
    expect(html).toContain('<strong>重点</strong>');
    expect(html).toContain('<strong>“引用”</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('href="https://example.com"');
  });
  it("保留显式转义、代码、数学星号、未闭合标记", () => {
    expect(render(String.raw`\*\* 原样中文 \*\*`)).not.toContain('<strong>');
    expect(render('`** 中文代码 **`')).toContain('<code>** 中文代码 **</code>');
    expect(render('```txt\n** 中文代码 **\n```')).not.toContain('<strong>');
    expect(render('2 ** 3 ** 2')).not.toContain('<strong>');
    expect(render('** 还没有接收完整')).toContain('**');
  });
  it("兼容修复不影响 HTML、图片和危险链接的安全限制", () => {
    const html = render('** “安全正文” **\n\n<script>alert(1)</script>\n\n![图片](https://example.com/x.png)\n\n[危险](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('href="javascript:');
  });
  it("显字插件仍按原始偏移处理，不把星号变成装饰乱码", () => {
    const content = '开头:** “中文引用” **。';
    const html = renderToStaticMarkup(<MessageContent content={content} reveal={{ state: createReveal(content, 1000, true), now: 1000 }} />);
    expect(html).toContain('<strong>');
    expect(html).toContain('class="stream-token"');
    expect(html).not.toContain('**');
  });
});
