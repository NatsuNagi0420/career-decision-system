/** 青穗集 · 学习呈现回归：恢复学习位置、跳过统计、视频地址边界和路线预览。 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LearningPath, LearningResource, LearningState } from "../../../agent/src/learning-contract";
import { LearningProgress, LearningWorkspace } from "./LearningWorkspace";
import { learningPlayerUrl, learningProgress, nextLearningNode, nodeReady } from "./learning";
const path: LearningPath = { id: "path", job_id: "job", title: "前端学习", summary: "结合岗位练习", created_at: "", updated_at: "", nodes: [
  { key: "types", title: "类型", requirement: "TypeScript", objective: "理解类型", estimated_minutes: 30, prerequisites: [], search_query: "TypeScript", exercise: "写函数", deliverable: "函数代码", status: "done", notes: "", result: "完成", resources: [], updated_at: null },
  { key: "components", title: "组件", requirement: "组件开发", objective: "实现组件", estimated_minutes: 60, prerequisites: ["types"], search_query: "组件", exercise: "做组件", deliverable: "组件代码", status: "todo", notes: "", result: "", resources: [], updated_at: null },
] };
describe("学习路线", () => {
  it("续接未完成章节，区分学完和跳过，不将视频打开计为进度", () => {
    expect(nextLearningNode(path)?.key).toBe("components");
    expect(nodeReady(path, path.nodes[1])).toBe(true);
    expect(learningProgress(path)).toEqual({ completed: 1, skipped: 0, total: 2, percent: 50 });
    const skipped = { ...path, nodes: [{ ...path.nodes[0], status: "skipped" as const }, path.nodes[1]] };
    expect(learningProgress(skipped)).toEqual({ completed: 0, skipped: 1, total: 2, percent: 50 });
    expect(renderToStaticMarkup(<LearningProgress path={skipped} />)).toContain("跳过 1 节");
  });
  it("播放地址只能由合法BV号生成，禁止任意iframe来源", () => {
    expect(learningPlayerUrl({ bvid: "BV14Z4y1u7pi" } as LearningResource)).toMatch(/^https:\/\/player\.bilibili\.com\/player.html\?/);
    expect(learningPlayerUrl({ bvid: "//evil.invalid" } as LearningResource)).toBeNull();
  });
  it("无路线时从真实岗位开始，有路线时显示章节和练习，不自动播放外站视频", () => {
    const state: LearningState = { revision: 0, active_path_id: null, paths: [], proposal: null, updated_at: null };
    const workspace = { state, error: "", saving: false, refresh: async () => {}, change: async () => true };
    const empty = renderToStaticMarkup(<LearningWorkspace workspace={workspace} jobs={[]} onPrompt={() => {}} />);
    expect(empty).toContain("先保存一个目标岗位");
    const markup = renderToStaticMarkup(<LearningWorkspace workspace={{ ...workspace, state: { ...state, paths: [path], active_path_id: path.id } }} jobs={[]} onPrompt={() => {}} />);
    expect(markup).toContain("学习章节"); expect(markup).toContain("动手练一练");
    expect(markup).toContain("搜索B站"); expect(markup).not.toContain("<iframe");
  });
});
