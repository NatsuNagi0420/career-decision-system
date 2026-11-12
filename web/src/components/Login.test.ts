/** 青穗集 · 账号入口回归：无障碍字段、后端透明素材和真实登录会话。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { Login } from "./Login";
const html = renderToStaticMarkup(createElement(Login, { onSuccess: () => {} }));
describe("account entry", () => {
  it("本机显式提供官方账号与 API Key，云端不显示自带Key入口", () => {
    const local = renderToStaticMarkup(createElement(Login, { onSuccess() {}, onLocalMode: async () => {} }));
    expect(local).toContain("青穗集账号登录"); expect(local).toContain("API-KEY 登录");
    expect(html).not.toContain("API-KEY 登录");
  });
  it("uses the transparent welcome artwork through the backend asset route", () => {
    expect(html).toContain('/api/assets/brand/account/suinai-welcome.webp');
    expect(html).toContain('穗奈向你问好，陪你整理求职的下一步');
    for (const match of html.matchAll(new RegExp('src="(/api/assets/[^"]+)"', "g"))) expect(existsSync(new URL("../../../assets/web/" + match[1].slice("/api/assets/".length), import.meta.url))).toBe(true);
  });
  it("provides accessible login fields and tab switching without a dead recovery link", () => {
    expect(html).toContain('aria-label="登录账号"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('记住我');
    expect(html).not.toContain('忘记密码');
    expect(html).not.toContain('id="consent"');
    expect(html).not.toContain('YOUR CAREER, YOUR PACE');
    expect(html).not.toContain('本机任务工作区');
  });
  it("respects reduced-motion settings in the initial render", () => {
    expect(html).toContain('aria-label="系统已减少动态"');
    expect(html).toContain('data-animated="false"');
  });
});
