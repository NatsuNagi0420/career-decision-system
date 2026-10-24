/** 青穗集 · 模型设置渲染回归：默认选择列表、协议自动检测和分项失败解释。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelSettings } from "./ModelSettings";
import type { ModelProfile } from "./types";
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
function render(profiles: ModelProfile[] = [], consent = true) {
  return renderToStaticMarkup(
    createElement(ModelSettings, {
      profiles,
      selected: profiles[0]?.id ?? "",
      info: null,
      user: { id: 1, username: "fixture", external_ai_consent: consent },
      onClose() {},
      async onSaved() {},
      async onConsent() {},
    }),
  );
}
describe("模型配置入口", () => {
  it("官方连接显示公开名称，不把真实模型编号当作展示名", () => {
    const html = render([{ ...profile, mode: "official", name: "官方服务", display_name: "Suinai Flash" }]);
    expect(html).toContain("<strong>Suinai Flash</strong>");
    expect(html).not.toContain("listed-model");
  });
  it("新连接默认拉取列表和自动协议，不强迫手填模型名称", () => {
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
