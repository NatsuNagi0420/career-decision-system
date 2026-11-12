/** 青穗集 · 折叠回归：按钮可访问、内容稳定保留，关闭时退出键盘和读屏导航。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
describe("平滑折叠", () => {
  it("关闭保留子树但设为inert，展开不依赖原生details瞬切", () => {
    const html=renderToStaticMarkup(<AnimatedDisclosure summary="这段对话的小结"><p>真实小结</p></AnimatedDisclosure>);
    expect(html).toContain('aria-expanded="false"'); expect(html).toContain('inert=""');
    expect(html).toContain("真实小结"); expect(html).not.toContain("<details");
  });
  it("展开状态拥有相同内容与受控区域", () => {
    const html=renderToStaticMarkup(<AnimatedDisclosure summary="小结" defaultOpen><p>内容</p></AnimatedDisclosure>);
    expect(html).toContain('aria-expanded="true"'); expect(html).toContain('aria-hidden="false"');
    expect(html).not.toContain('inert=""');
  });
});
