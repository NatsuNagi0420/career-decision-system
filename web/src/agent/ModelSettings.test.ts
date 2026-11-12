/** 青穗集 · 模型设置渲染回归：默认选择列表、协议自动检测和分项失败解释。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelSettings } from "./ModelSettings";
import type { AgentInfo, AgentUser, ModelProfile } from "./types";
const profile: ModelProfile = {
  id: "fixture-profile",
  name: "fixture gateway",
  mode: "custom",
  api_kind: "auto",
  resolved_api_kind: "responses",
  base_url: "https://gateway.example/v1",
  model: "listed-model",
  allow_local: false,
  remember_key: false,
  has_key: true,
  capabilities: {
    chat: true,
    tools: false,
    stream: false,
    tested_at: "2026-10-21T00:00:00Z",
    note: "可以先聊天",
    checks: [
      {
        stage: "tools",
        protocol: "responses",
        ok: false,
        note: "该模型不支持工具调用。",
      },
    ],
  },
};
function render(profiles: ModelProfile[] = [], consent = true, info: AgentInfo | null = null, identity: AgentUser["identity"] = "device", presentation: "dialog" | "entry" = "dialog") {
  return renderToStaticMarkup(
    createElement(ModelSettings, {
      profiles,
      selected: profiles[0]?.id ?? "",
      info,
      user: { id: 1, username: "fixture", external_ai_consent: consent, identity },
      presentation,
      onClose() {},
      async onSaved() {},
      async onConsent() {},
    }),
  );
}
describe("模型配置入口", () => {
  it("登录移出连接面板，官方身份仍能同时配置自己的接口", () => {
    const html = render([profile], true, null, "official");
    expect(html).toContain("自定义接口"); expect(html).toContain("官方服务");
    expect(html).not.toContain('class="agent-official-account"');
    expect(html).not.toContain("输入官方账号"); expect(html).not.toContain("退出官方账号");
  });
  it("API Key 登录内嵌配置且不开放官方连接或先进入桌面", () => {
    const html = render([], false, { persistent_secrets_supported: true } as AgentInfo, "device", "entry");
    expect(html).toContain('aria-label="API-KEY 登录"'); expect(html).toContain("连接并进入");
    expect(html).not.toContain("<dialog"); expect(html).not.toContain("官方服务");
    expect(html).not.toContain("只保存"); expect(html).not.toContain("进入桌面");
    expect(html).toContain("使用 Windows 当前用户加密保存密钥");
  });
  it("已有可用API Key配置提供显式进入，不能误用官方连接", () => {
    const html = render([profile, { ...profile, id: "official", mode: "official", display_name: "Suinai Flash" }], true, null, "device", "entry");
    expect(html).toContain("进入桌面"); expect(html).not.toContain("Suinai Flash");
  });
  it("官方连接显示公开名称，不把真实模型编号当作展示名", () => {
    const html = render([{ ...profile, mode: "official", name: "官方服务", display_name: "Suinai Flash" }], true, null, "official");
    expect(html).toContain("<strong>Suinai Flash</strong>");
    expect(html).not.toContain("listed-model");
  });
  it("云端连接设置只展示官方服务，不暴露自定义 Key 入口", () => {
    const html = render([{ ...profile, mode: "official", name: "官方服务", display_name: "Suinai Flash" }], true, { deployment_mode: "server" } as AgentInfo);
    expect(html).toContain("云端工作区只使用 Suinai Flash");
    expect(html).not.toContain("＋ 添加连接");
    expect(html).not.toContain("自定义接口");
    expect(html).not.toContain("自定义网关的隐私");
  });  it("新连接默认拉取列表和自动协议，不强迫手填模型名称", () => {
    const html = render();
    expect(html).toContain("拉取模型列表");
    expect(html).toMatch(/<select[^>]*>[\s\S]*?请先点击上方拉取模型列表/);
    expect(html).toContain('value="auto" selected=""');
    expect(html).not.toContain('placeholder="使用网关中可用的模型名称"');
    expect(html.indexOf("agent-consent")).toBeLessThan(
      html.indexOf("agent-model-discovery"),
    );
  });
  it("已保存的模型可以保留选择，工具失败与普通聊天能力分别呈现", () => {
    const html = render([profile]);
    expect(html).toContain('value="listed-model" selected=""');
    expect(html).toContain("工具往返：");
    expect(html).toContain("该模型不支持工具调用。");
    expect(html).toContain("实际使用协议：");
    expect(html).toContain("Responses");
    expect(html).toContain("非流式");
  });
});

