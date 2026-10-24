/** 青穗集 · 任务提示草稿回归：自动词随任务切换，手写草稿与异步编辑不被覆盖。 */
import { describe, expect, it } from "vitest";
import { composerDraftReducer, EMPTY_COMPOSER_DRAFT, TASK_PROMPTS } from "./companion-state";

describe("任务提示与手写草稿", () => {
  it.each(["career", "learning", "resume"] as const)("空输入选择 %s 时填入对应默认提示", kind => {
    expect(composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind })).toEqual({ text: TASK_PROMPTS[kind], task: kind });
  });

  it("连续切换任务替换自动提示，不保留上一个任务的默认词", () => {
    let draft = EMPTY_COMPOSER_DRAFT;
    for (const kind of ["career", "learning", "resume", "career"] as const) {
      draft = composerDraftReducer(draft, { type: "task", kind });
      expect(draft).toEqual({ text: TASK_PROMPTS[kind], task: kind });
    }
  });

  it("手写或其他入口填入的草稿在选择任务时保留，即使恰好等于默认词", () => {
    for (const text of ["我只想改一下项目经历这一段。", TASK_PROMPTS.career]) {
      const draft = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "edit", text });
      expect(composerDraftReducer(draft, { type: "task", kind: "learning" })).toBe(draft);
    }
  });

  it("修改过的自动提示转为手写草稿，不再被下一次选择覆盖", () => {
    const automatic = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind: "career" });
    const edited = composerDraftReducer(automatic, { type: "edit", text: automatic.text + " 我更喜欢后端。" });
    expect(edited.task).toBeNull();
    expect(composerDraftReducer(edited, { type: "task", kind: "resume" })).toBe(edited);
  });

  it("切回自由聊聊清除未编辑的自动提示，但保留手写草稿", () => {
    const automatic = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind: "resume" });
    expect(composerDraftReducer(automatic, { type: "task", kind: null })).toEqual(EMPTY_COMPOSER_DRAFT);
    const edited = composerDraftReducer(automatic, { type: "edit", text: "我暂时想聊一下实习选择。" });
    expect(composerDraftReducer(edited, { type: "task", kind: null })).toBe(edited);
  });

  it("清空输入框后仍可填入新任务的默认提示", () => {
    const automatic = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind: "career" });
    const cleared = composerDraftReducer(automatic, { type: "edit", text: "" });
    expect(composerDraftReducer(cleared, { type: "task", kind: "learning" }).text).toBe(TASK_PROMPTS.learning);
  });

  it("发送完成或切换会话的重置同时清除文本和自动来源", () => {
    const automatic = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind: "resume" });
    const reset = composerDraftReducer(automatic, { type: "reset" });
    expect(reset).toEqual({ text: "", task: null });
    const nextDraft = composerDraftReducer(reset, { type: "edit", text: TASK_PROMPTS.resume });
    expect(composerDraftReducer(nextDraft, { type: "task", kind: "career" })).toBe(nextDraft);
  });

  it("异步保存任务期间新增的手写内容不会被返回的默认提示覆盖", async () => {
    let draft = composerDraftReducer(EMPTY_COMPOSER_DRAFT, { type: "task", kind: "career" });
    let saved!: () => void;
    const saving = new Promise<void>(resolve => { saved = resolve; });
    const switching = saving.then(() => { draft = composerDraftReducer(draft, { type: "task", kind: "learning" }); });
    draft = composerDraftReducer(draft, { type: "edit", text: "每周只有六个小时学习时间。" });
    saved();
    await switching;
    expect(draft).toEqual({ text: "每周只有六个小时学习时间。", task: null });
  });
});
