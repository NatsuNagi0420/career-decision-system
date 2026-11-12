/** 青穗集 · 统一入口回归：本机保留 API Key 入口，云端仅展示官方账号。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentEntry } from "./AgentEntry";
import { Login } from "../components/Login";
describe("统一账号入口", () => {
  it("在同一页面提供账号表单与本机 API Key", () => {
    const html = renderToStaticMarkup(createElement(AgentEntry,{onLocalMode:async()=>{},onOfficialSuccess:()=>{}}));
    expect(html).toContain('aria-label="登录账号"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('本机 API Key');
    expect(html).not.toContain('先选择工作方式');
  });
  it("云端没有本机 API Key 按钮", () => {
    const html = renderToStaticMarkup(createElement(Login,{onSuccess:()=>{}}));
    expect(html).not.toContain('class="account-local"');
  });
});
