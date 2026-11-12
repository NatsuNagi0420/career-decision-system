/** 青穗集 · 引导体验回归：固定演示不冒充自由问答，演示纸面不改变真实草稿或增加虚构技能。 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { RESUME_DEMO_TURNS, completedResumeExample } from "./test-fixtures/resume-conversation";
import { ResumeCheckpoint } from "./ResumeCheckpoint";
import { emptyResumeState } from "../../../agent/src/resume-contract";
import { renderResumeHtml } from "../../../agent/src/resume-render";
describe("简历引导对话", () => {
 it("预设对话解释个人贡献与无指标情况，示例与真实状态隔离", () => {
   const real = emptyResumeState(), example = completedResumeExample();
   expect(RESUME_DEMO_TURNS).toHaveLength(5);
   expect(RESUME_DEMO_TURNS.map(t => t.reply).join("\n")).toContain("个人贡献");
   expect(RESUME_DEMO_TURNS.map(t => t.reply).join("\n")).toContain("去编用户量");
   expect(example.body).not.toBeNull(); expect(real.source_text).toBe("");
   const html = renderResumeHtml(example.header, example.body!, true);
   expect(html).toContain("虚构人物"); expect(html).not.toContain("校园摄影社团");
 });
 it("没有小结时不向用户展示表单或空关卡，已有正文时只给预览入口", () => {
   const props = { disabled: false, apply: async () => null, onContinue: async () => {}, onCorrect: () => {}, onPreview: () => {} };
   expect(renderToStaticMarkup(createElement(ResumeCheckpoint, { ...props, state: emptyResumeState() }))).toBe("");
   const markup = renderToStaticMarkup(createElement(ResumeCheckpoint, { ...props, state: completedResumeExample() }));
   expect(markup).toContain("看看我的简历"); expect(markup).not.toContain("<form"); expect(markup).not.toContain("<input");
 });
});
