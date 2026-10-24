/** 青穗集 · 输入区渲染回归：图标入口、权限、模型与推理滑条排列，不展示用户头像。 */
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatComposer } from "./ChatComposer";
import { RunActivity } from "./RunActivity";
import { ReasoningSlider } from "./ReasoningSlider";
import type { ModelProfile } from "./types";
const noop = () => {};
describe("对话工具栏", () => {
  it.each(["official", "custom"] as const)("%s 模型显示名称与连接分开，第三方保留原始模型编号", mode => {
    const profile: ModelProfile = {
      id: "fixture-profile", name: "我的连接", mode, api_kind: "chat-completions",
      base_url: "https://fixture.example.invalid/v1", model: "upstream-model-id",
      ...(mode === "official" ? { display_name: "Suinai Flash" } : {}),
      allow_local: false, remember_key: false, has_key: true,
      capabilities: { chat: true, tools: true, stream: true, tested_at: "2026-10-24T00:00:00Z", note: "fixture" },
    };
    const html = renderToStaticMarkup(<ChatComposer text="" onText={noop} composer={createRef()} fileInput={createRef()} onSubmit={noop} onUpload={noop} onCancel={noop} busy={false} working={false} fileBusy={false} waiting={false} archived={false} profiles={[profile]} selected={profile.id} onSelect={noop} permission="default" onPermission={noop} effort="auto" onEffort={noop} />);
    if (mode === "official") {
      expect(html).toContain("Suinai Flash");
      expect(html).not.toContain("upstream-model-id");
    } else {
      expect(html).toContain("upstream-model-id");
      expect(html).not.toContain("Suinai Flash");
    }
  });
  it("导入只有图标且有悬浮说明，权限在左，模型与思考紧邻发送", () => {
    const html = renderToStaticMarkup(<ChatComposer text="你好" onText={noop} composer={createRef()} fileInput={createRef()} onSubmit={noop} onUpload={noop} onCancel={noop} busy={false} working={false} fileBusy={false} waiting={false} archived={false} profiles={[]} selected="" onSelect={noop} permission="default" onPermission={noop} effort="auto" onEffort={noop} />);
    expect(html).toContain('aria-label="导入文件"');
    expect(html).toContain('data-tooltip="导入文件"');
    expect(html).not.toContain('>导入资料<');
    expect(html).toContain('aria-label="思考强度"');
    expect(html).toContain('type="range"');
    expect(html.indexOf('agent-composer-model')).toBeLessThan(html.indexOf('aria-label="发送消息"'));
    expect(html).toContain('默认配置');
    expect(html).toContain('完全访问');
  });
  it.each(["auto", "low", "medium", "high"] as const)("思考档位 %s 与轨道进度、可访问状态一致", effort => {
    const values = ["auto", "low", "medium", "high"];
    const labels = ["自动", "轻量", "标准", "深入"];
    const index = values.indexOf(effort);
    const html = renderToStaticMarkup(<ChatComposer text="" onText={noop} composer={createRef()} fileInput={createRef()} onSubmit={noop} onUpload={noop} onCancel={noop} busy={false} working={false} fileBusy={false} waiting={false} archived={false} profiles={[]} selected="" onSelect={noop} permission="default" onPermission={noop} effort={effort} onEffort={noop} />);
    expect(html).toContain(`--effort-progress:${index / 3 * 100}%`);
    expect(html).toContain(`aria-valuetext="${labels[index]}"`);
    expect(html).toContain(`value="${index}"`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2); // 默认权限与一个思考档位。
    expect(html).toContain('aria-describedby="agent-effort-note"');
    expect(html).toContain(effort === "auto" ? "跟随模型默认设置" : "需模型及服务商支持，不支持时会提示");
    expect(html).not.toContain("不假装生效");
    expect(html).toContain(`data-high="${effort === "high"}"`);
    expect(html).toContain('step="0.001"');
    expect(html).toContain('class="agent-effort-meter" aria-hidden="true"');
  });
  it("锁定时禁用滑条和全部档位，ASCII 装饰不进入读屏播报", () => {
    const html = renderToStaticMarkup(<ReasoningSlider effort="high" disabled onChange={noop} />);
    expect(html.match(/disabled=""/g)).toHaveLength(5);
    expect(html).toContain('class="agent-effort-rail" aria-hidden="true"');
    expect(html).toContain('data-ascii="effort-high"');
    expect(html).toContain('class="agent-effort-track"');
    expect(html).toContain('class="agent-effort-scan"');
    expect(html).toContain('agent-effort-ascii--reverse');
    expect(html).toContain('agent-effort-scan--echo');
    expect(html).toContain('data-level="3"');
    expect(html).toContain('lang="ja"');
    expect(html).toContain('ミライ');
    expect(html).not.toContain('/::/');
    expect(html).not.toContain('[&gt;###&lt;]');
    expect(html).toContain('data-motion="still"');
  });
  it("等待期间显示活动与真实事件，不捏造思考内容", () => {
    const html = renderToStaticMarkup(<RunActivity records={[]} onOpen={noop} run={{ id: "test", status: "running", steps: 1, input_tokens: 0, output_tokens: 0, error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }} />);
    expect(html).toContain('data-active="true"');
    expect(html).toContain('正在构思');
    expect(html).toContain('run-presence');
    expect(html).not.toContain('等待模型返回');
    expect(html).not.toContain('查看本轮执行记录');
    expect(html).not.toContain('思考与执行');
  });
});
