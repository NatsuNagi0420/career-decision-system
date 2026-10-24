/** 青穗集 · 会话历史回归：搜索只过滤标题、归档分类不混淆，所有对话共用常见操作。 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConversationActions, ConversationHistory, filterConversations } from "./ConversationHistory";
import { ResumeConversationBar } from "./ResumeConversation";
import type { Conversation } from "./types";
const conversations: Conversation[] = [
  { id: "a", title: "前端学习计划", profile_id: null, created_at: "2026-10-21", updated_at: "2026-10-21" },
  { id: "b", title: "React 作品整理", profile_id: null, created_at: "2026-10-22", updated_at: "2026-10-22" },
  { id: "c", title: "之前的前端方向", archived: true, profile_id: null, created_at: "2026-10-20", updated_at: "2026-10-20" },
];
const actions = { onRename: () => {}, onArchive: () => {}, onDelete: () => {} };
describe("对话历史管理", () => {
  it("搜索支持中文、大小写、全角和两侧空白，不修改原始顺序", () => {
    expect(filterConversations(conversations, false, "前端").map(item => item.id)).toEqual(["a"]);
    expect(filterConversations(conversations, false, "  ＲＥＡＣＴ  ").map(item => item.id)).toEqual(["b"]);
    expect(filterConversations(conversations, false, "").map(item => item.id)).toEqual(["b", "a"]);
    expect(filterConversations(conversations, true, "前端").map(item => item.id)).toEqual(["c"]);
    expect(conversations.map(item => item.id)).toEqual(["a", "b", "c"]);
  });
  it("同一菜单提供重命名、归档、恢复、永久删除，运行时仍可重命名", () => {
    const normal = renderToStaticMarkup(createElement(ConversationActions, { ...actions, conversation: conversations[0], disabled: false }));
    for (const text of ["重命名", "归档对话", "永久删除", 'popover="auto"']) expect(normal).toContain(text);
    const archived = renderToStaticMarkup(createElement(ConversationActions, { ...actions, conversation: conversations[2], disabled: false }));
    expect(archived).toContain("恢复对话");
    const active = renderToStaticMarkup(createElement(ConversationActions, { ...actions, conversation: conversations[0], disabled: false, active: true }));
    expect(active.match(/role="menuitem" disabled/g)).toHaveLength(2);
    expect(active).toContain("任务结束或停止后可归档、删除");
  });
  it("空历史有说明与搜索入口，不强制用户开始制作简历", () => {
    const html = renderToStaticMarkup(createElement(ConversationHistory, { ...actions, conversations: [], selectedId: null, disabled: false, activeId: null, archived: false, onArchived: () => {}, onChoose: () => {} }));
    expect(html).toContain("搜索对话标题"); expect(html).toContain("最近对话"); expect(html).toContain("已归档");
    expect(html).not.toContain("简历工坊"); expect(html).not.toContain("新建简历");
  });
  it("已有简历的状态提示只允许收起，不再邀请新开或切换对话", () => {
    const html = renderToStaticMarkup(createElement(ResumeConversationBar, { state: null, busy: false, onPreview: () => {}, onDemo: () => {}, onHide: () => {} }));
    expect(html).toContain("这段对话里的简历资料"); expect(html).toContain("收起简历资料提示"); expect(html).not.toContain("回到普通新对话");
  });
});
