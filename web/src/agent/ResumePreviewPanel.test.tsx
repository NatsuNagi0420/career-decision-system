/** 青穗集 · 简历纸面回归：收集阶段也直接显示 A4，侧栏不承载模板和步骤。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumePreviewPanel } from "./ResumePreviewPanel";
import { changeResumeExample, createResumeExample } from "./resume-flow";
import { completedResumeExample } from "./resume-conversation";
const noop = () => {};
describe("简历纸面侧栏", () => {
  it("经历整理阶段就展示实际内容，不等正文完成", () => {
    const state = changeResumeExample(createResumeExample(), { type: "task.request", kind: "facts" });
    const html = renderToStaticMarkup(<ResumePreviewPanel state={state} busy={false} saving={false} onClose={noop} onOpenStudio={noop} />);
    expect(html).toContain("简历实时 A4 预览");
    expect(html).toContain("校园活动报名项目");
    expect(html).toContain("resume-sheet");
    expect(html).toContain("简历编辑与导出");
    expect(html).not.toContain("LIVE DRAFT");
    expect(html).not.toContain("简历整理进度");
    expect(html).not.toContain("选择简历模板");
    expect(html).not.toContain("resume-live-skeleton");
  });
  it("已生成的正文继续用相同的 A4 排版", () => {
    const html = renderToStaticMarkup(<ResumePreviewPanel state={completedResumeExample()} busy={false} saving={false} onClose={noop} onOpenStudio={noop} />);
    expect(html).toContain("软件工程");
    expect(html).toContain("resume-theme-one-page");
    expect(html).not.toContain("正文生成后显示纸面");
  });
  it("尚无材料时保留真实空白纸面，不填虚构姓名和经历", () => {
    const html = renderToStaticMarkup(<ResumePreviewPanel state={null} busy={false} saving={false} onClose={noop} onOpenStudio={noop} />);
    expect(html).toContain("姓名待填写");
    expect(html).toContain("简历实时 A4 预览");
    expect(html).not.toContain("校园活动报名项目");
  });
});
