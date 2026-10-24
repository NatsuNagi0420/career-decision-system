/** 青穗集 · 像素弹窗契约：后端背景、可访问标题与真实按钮，风险文字不烘焙进图片。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PixelConfirmDialog } from "./PixelConfirmDialog";

describe("像素确认弹窗", () => {
  it("通过后端加载背景，并用 DOM 展示标题、说明和确认按钮", () => {
    const html = renderToStaticMarkup(<PixelConfirmDialog title="开启完全访问？" description={<p>允许读取、修改本机文件。<strong>可能造成数据丢失。</strong></p>} confirmLabel="确认开启" cancelLabel="保持默认" onResolve={() => {}} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby=');
    expect(html).toContain('aria-describedby=');
    expect(html).toContain('src="/api/assets/dialogs/warning-window.webp"');
    expect(html).toContain("<strong>可能造成数据丢失。</strong>");
    expect(html).toContain('type="button">保持默认</button>');
    expect(html).toContain('type="button">确认开启</button>');
    expect(html.indexOf(">保持默认</button>")).toBeLessThan(html.indexOf(">确认开启</button>"));
  });

  it("默认操作文案仍为取消与确定，长说明由可滚动正文承载", () => {
    const html = renderToStaticMarkup(<PixelConfirmDialog title="请确认" description={<p>{"需要核实的说明。".repeat(100)}</p>} onResolve={() => {}} />);
    expect(html).toContain('class="pixel-confirm__body"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('type="button">取消</button>');
    expect(html).toContain('type="button">确定</button>');
  });
});
