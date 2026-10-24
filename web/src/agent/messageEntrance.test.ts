/** 青穗集 · 新消息入场回归：新消息一次播放，历史、流式更新和切换不会整列重复入场。 */
import { describe, expect, it } from "vitest";
import { advanceMessageEntrance, type MessageEntranceState } from "./messageEntrance";
const initial = (): MessageEntranceState => ({ scope: null, ready: false, known: new Set(), entering: new Set() });
describe("新消息入场", () => {
  it("首次打开历史只建立基线，后续新增 ID 才入场", () => {
    const history = advanceMessageEntrance(initial(), "chat-a", true, ["old"], true);
    expect(history.entering.size).toBe(0);
    const next = advanceMessageEntrance(history, "chat-a", true, ["old", "new"], true);
    expect([...next.entering]).toEqual(["new"]);
    expect(advanceMessageEntrance(next, "chat-a", true, ["old", "new"], true)).toBe(next);
  });
  it("动画结束后同 ID 流式分片和最终回复不重新入场", () => {
    const history = advanceMessageEntrance(initial(), "chat-a", true, ["old"], true);
    const arrived = advanceMessageEntrance(history, "chat-a", true, ["old", "stream"], true);
    const ended = { ...arrived, entering: new Set<string>() };
    expect(advanceMessageEntrance(ended, "chat-a", true, ["old", "stream"], true)).toBe(ended);
  });
  it("等待加载、切换和恢复历史不回放", () => {
    const waiting = advanceMessageEntrance(initial(), "chat-a", false, [], true);
    const loaded = advanceMessageEntrance(waiting, "chat-a", true, ["one", "two"], true);
    expect(loaded.entering.size).toBe(0);
    expect(advanceMessageEntrance(loaded, "chat-b", true, ["three"], true).entering.size).toBe(0);
  });
  it("关闭动效不积压入场，重新开启也不补播", () => {
    const history = advanceMessageEntrance(initial(), "chat-a", true, ["old"], true);
    const paused = advanceMessageEntrance(history, "chat-a", true, ["old", "new"], false);
    expect(paused.entering.size).toBe(0);
    expect(advanceMessageEntrance(paused, "chat-a", true, ["old", "new"], true).entering.size).toBe(0);
  });
});
