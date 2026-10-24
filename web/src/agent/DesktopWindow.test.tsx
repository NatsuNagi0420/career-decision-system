/** 青穗集 · 桌面窗口回归：默认收起、非模态结构和基础窗口操作，不调用真实模型。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesktopWindow } from "./DesktopWindow";

const noop = () => {};

describe("职业工作台桌面窗口", () => {
  it("收起时保留内部表单，不把工作台常驻显示在主页", () => {
    const html = renderToStaticMarkup(<DesktopWindow open={false} onClose={noop} onMinimize={noop}><input defaultValue="未保存的草稿" /></DesktopWindow>);
    expect(html).toMatch(/role="dialog"[^>]*hidden=""/);
    expect(html).toContain('value="未保存的草稿"');
  });

  it("打开时是允许继续操作主对话的非模态窗口", () => {
    const html = renderToStaticMarkup(<DesktopWindow open onClose={noop} onMinimize={noop}><p>职业档案</p></DesktopWindow>);
    expect(html).toContain('aria-modal="false"');
    expect(html).toContain('aria-labelledby="');
    expect(html).not.toContain('hidden=""');
    expect(html).toContain('aria-label="最小化工作台"');
    expect(html).toContain('aria-label="最大化工作台"');
    expect(html).toContain('aria-label="关闭工作台"');
    expect(html).toContain("Esc 最小化");
  });
});
