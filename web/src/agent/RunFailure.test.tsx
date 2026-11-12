/** 青穗集 · 回复中断界面回归：提示不虚构排队，技术详情可查，续接只在服务端允许时出现。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { failureMessage, RunFailure } from "./RunFailure";
import type { AgentRun } from "./types";
const run: AgentRun = { id: "failed-step", status: "failed", steps: 2, input_tokens: 0, output_tokens: 0, created_at: "2026-10-24T08:03:48Z", updated_at: "2026-10-24T08:04:55Z", error: "模型数据长时间未继续返回。", error_code: "provider_timeout", can_retry: true };
const noop = () => {};
describe("穗奈的中断提示", () => {
  it("超时用自然措辞，提供续接与可访问详情，不虚构繁忙或隐藏未完成状态", () => {
    const html = renderToStaticMarkup(<RunFailure run={run} onRetry={noop} onDetails={noop} />);
    expect(html).toContain("穗奈开了个小差，这次还没答完");
    expect(html).toContain("继续回复");
    expect(html).toContain('aria-label="查看中断原因"');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/超时|排队|人数|繁忙/);
  });
  it("额度和鉴权保留可处理的错误，不把所有失败都说成忙", () => {
    expect(failureMessage({ ...run, error_code: "provider_401", error: "密钥无效，请检查配置。" })).toContain("密钥无效");
    expect(failureMessage({ ...run, error_code: "provider_quota", error: "服务余额不足。" })).toContain("余额不足");
    expect(failureMessage({ ...run, error_code: "provider_429" })).toContain("暂时繁忙");
    expect(failureMessage({ ...run, error_code: "relay_daily_output_limit" })).toContain("本机中转");
    expect(failureMessage({ ...run, error_code: "relay_daily_request_limit" })).toContain("请求次数");
    expect(failureMessage({ ...run, error_code: "relay_busy" })).toContain("正在处理");
  });
  it("旧超时记录同样使用友好措辞", () => {
    expect(failureMessage({ ...run, error_code: undefined, error: "模型请求超时，请检查服务后重试。" })).toContain("这次还没答完");
  });
  it("不可续接时保留详情入口，不给无效重试按钮", () => {
    const html = renderToStaticMarkup(<RunFailure run={{ ...run, can_retry: false }} onRetry={noop} onDetails={noop} />);
    expect(html).not.toContain("继续回复"); expect(html).toContain("查看中断原因");
  });
  it("请求提交中禁止重复点击续接", () => {
    const html = renderToStaticMarkup(<RunFailure run={run} disabled onRetry={noop} onDetails={noop} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*class="run-recovery__retry"/);
  });
});
