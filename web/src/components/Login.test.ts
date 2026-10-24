/** 青穗集 · 登录入口契约：正式穗奈、真实表单与正确试映室入口不能回退为旧像素形象。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Login } from "./Login";

const html = renderToStaticMarkup(createElement(Login, { onSuccess: () => {} }));

describe("the career desktop login", () => {
  it("welcomes with the shared formal character rather than the old pixel portrait", () => {
    expect(html).toContain('class="auth__art login-art"');
    expect(html).toContain('class="suinai-motion-character"');
    expect(html).toContain('role="img"');
    expect(html).toContain("穗奈向你问好，陪你整理求职的下一步");
    expect(html).not.toContain('class="suinai-portrait');
    expect(html).not.toContain('class="suinai-sprite');
  });
  it("keeps accessible, browser-compatible login fields and the registration entry", () => {
    expect(html).toContain('aria-label="登录账号"');
    expect(html).toContain('id="username"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('id="password"');
    expect(html).toContain('minLength="8"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain("进入我的桌面");
    expect(html).toContain("第一次来？创建账号");
    expect(html).not.toContain('id="consent"');
  });
  it("points to Suinai's own motion studio, not the unrelated native-model sample", () => {
    expect(html).toContain('href="?preview=suinai-motion"');
    expect(html).toContain("穗奈动作试映室");
    expect(html).not.toContain('href="?preview=live2d"');
    expect(html).not.toContain("Live2D 交互预览");
  });
  it("has an explicit animation control and a safe reduced-motion server snapshot", () => {
    expect(html).toContain('class="login-art__motion"');
    expect(html).toContain('aria-label="系统已减少动态"');
    expect(html).toContain('aria-pressed="true" disabled=""');
  });
});
