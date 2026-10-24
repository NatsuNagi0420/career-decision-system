/** 青穗集 · 消息操作与显示缓冲回归：复制原文、原位编辑、已收字符边界与平滑收尾。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageActions, MessageEditor } from "./MessageActions";
const noop = () => {};
describe("消息操作", () => {
  it("用户消息提供两个图标，助手消息只提供复制", () => {
    const user = renderToStaticMarkup(<MessageActions content="原文" onEdit={noop} disabled={false} onError={noop} />);
    expect(user).toContain('aria-label="复制文字"'); expect(user).toContain('aria-label="编辑并重新发送"');
    expect(user).not.toContain(">复制文字<");
    expect(renderToStaticMarkup(<MessageActions content="答复" disabled={false} onError={noop} />)).not.toContain('aria-label="编辑并重新发送"');
  });
  it("编辑区保留原文，提供取消和重发并说明已保存资料不会回滚", () => {
    const html = renderToStaticMarkup(<MessageEditor content="原始问题" disabled={false} onCancel={noop} onSend={noop} />);
    expect(html).toContain('aria-label="编辑这条消息"'); expect(html).toContain("原始问题");
    expect(html).toContain("重新发送"); expect(html).toContain("取消"); expect(html).toContain("已保存的文件和资料保留");
  });
});

