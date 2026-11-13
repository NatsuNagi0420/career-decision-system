/** 青穗集 · 面试窗口回归：启动、逐题作答、暂停和复盘状态，防止输出尚未作答题目的参考答案。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewWindow, type InterviewWindowProps } from "./InterviewWindow";
import type { PublicPreparationSession } from "../../../agent/src/preparation-contract";

const session: PublicPreparationSession = {
  id:"interview", conversation_id:"conversation", job_id:"job", job_title:"前端开发", job_description:"组件开发",
  mode:"interview", status:"active", background:"一个模拟开发场景", focus:["组件边界"], total:3,
  questions:[{ id:"question", topic:"组件拆分", prompt:"如何划分组件和状态？", requirement:"组件开发", origin:"generated", source_title:"AI生成", source_url:null }],
  answers:[], start_run_id:"run", context_version:0, created_at:"2026-11-13T00:00:00Z", updated_at:"2026-11-13T00:00:00Z",
};
function render(extra: Partial<InterviewWindowProps> = {}) {
  return renderToStaticMarkup(<InterviewWindow open busy={false} motion action="A21" onSubmit={async () => true} onFinish={async () => {}} onRestart={() => {}} onPause={async () => {}} onResume={async () => {}} onClose={() => {}} onMinimize={() => {}} {...extra}/>);
}
describe("独立文字面试窗口", () => {
  it("准备页需用户开始，面试使用独立窗口控件", () => {
    const html = render({launchPrompt:"穗奈，我想针对「前端开发」做一轮模拟面试。"});
    expect(html).toContain('id="suinai-interview-window"');
    expect(html).toContain("开始面试");
    expect(html).toContain('aria-label="最小化面试窗口"');
    expect(html).not.toContain('aria-label="面试回答"');
  });
  it("只有当前题与文字输入框，背景可按需展开", () => {
    const html = render({session});
    expect(html).toContain("如何划分组件和状态？");
    expect(html).toContain('aria-label="面试回答"');
    expect(html).toContain('aria-label="发送面试回答"');
    expect(html).toContain('aria-label="查看面试背景与考察点"');
    expect(html).toContain("结束面试");
    expect(html).not.toContain("reference_answer");
  });
  it("暂停后可恢复；结束后不再显示回答框", () => {
    const paused = render({session:{...session,status:"paused"}});
    expect(paused).toContain("继续面试");
    expect(paused).not.toContain('aria-label="面试回答"');
    const done = render({session:{...session,status:"completed"}});
    expect(done).toContain("本轮表现");
    expect(done).toContain("这次还没有回答。");
    expect(done).toContain("再来一轮");
    expect(done).toContain("离开面试");
    expect(done).not.toContain('aria-label="发送面试回答"');
  });
});
