/** 青穗集 · 精简回复状态回归：唯一执行入口、流式去重、静止回退和审批状态。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionToggle, RunActivity } from "./RunActivity";
import type { AgentRun } from "./types";
const noop = () => {};
const run: AgentRun = { id: "activity-test", status: "running", steps: 1, input_tokens: 0, output_tokens: 0, error: null, created_at: new Date(Date.now() - 5_000).toISOString(), updated_at: new Date().toISOString() };
describe("紧凑回复状态", () => {
  it("等待只显示头像、一个主状态与耗时，不重复执行入口或说明行", () => {
    const html = renderToStaticMarkup(<RunActivity run={run} records={[]} onOpen={noop} />);
    expect(html).toContain("run-presence");
    expect(html).toContain('role="status"');
    expect(html).toContain("正在构思");
    expect(html).toContain("已用时");
    expect(html).not.toContain("执行记录");
    expect(html).not.toContain("等待模型返回");
    expect(html).not.toContain("data-ascii");
  });
  it("提交请求没有重复的连接中副标签", () => {
    const html = renderToStaticMarkup(<RunActivity submitting records={[]} onOpen={noop} />);
    expect(html.match(/连接中/g)).toHaveLength(1);
    expect(html).not.toContain("run-activity__elapsed");
  });
  it("短暂请求不显示毫秒计时或不停变化的小数", () => {
    const html = renderToStaticMarkup(<RunActivity run={{ ...run, created_at: new Date().toISOString() }} records={[]} onOpen={noop} />);
    expect(html).not.toContain("run-activity__elapsed");
    expect(html).not.toContain(" ms");
  });
  it("流式正文已经显示时移除纯等待占位", () => {
    expect(renderToStaticMarkup(<RunActivity run={run} records={[]} drafting onOpen={noop} />)).toBe("");
  });
  it("静态渲染保留可读状态，默认不播放装饰动画", () => {
    const html = renderToStaticMarkup(<RunActivity run={run} records={[]} onOpen={noop} />);
    expect(html).toContain('data-motion="still"');
    expect(html).toContain("正在构思");
  });
  it("等待用户确认不显示思考动画", () => {
    const html = renderToStaticMarkup(<RunActivity run={{ ...run, status: "awaiting_approval" }} records={[]} onOpen={noop} />);
    expect(html).toContain("等待你的确认");
    expect(html).not.toContain("run-presence");
  });
});
describe("标题栏执行入口", () => {
  it("使用图标与悬浮提示，不再显示重复的文字按钮", () => {
    const html = renderToStaticMarkup(<ExecutionToggle open={false} active onClick={noop} />);
    expect(html).toContain('aria-label="打开执行记录"');
    expect(html).toContain('data-tooltip="执行记录"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-running="true"');
    expect(html).not.toContain(">执行记录<");
  });
  it("打开后提供收起语义并关联同一个侧栏", () => {
    const html = renderToStaticMarkup(<ExecutionToggle open active={false} onClick={noop} />);
    expect(html).toContain('aria-label="收起执行记录"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="career-context"');
  });
});

it("长等待更新为整理中，不凭空宣称正在排队", () => {
  const html = renderToStaticMarkup(<RunActivity run={{ ...run, created_at: new Date(Date.now() - 30_000).toISOString() }} records={[]} onOpen={noop} />);
  expect(html).toContain("还在认真整理，这次需要久一点");
  expect(html).not.toMatch(/排队|人数|超时/);
});
