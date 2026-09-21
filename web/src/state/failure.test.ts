import { describe, expect, it } from "vitest";
import { describeFailure, formatFailure } from "./failure";

describe("describeFailure", () => {
  it("names the stage a run stopped on", () => {
    expect(describeFailure("budget: 这次任务的 token 预算 40000 已经用尽")).toEqual({
      stage: "token 预算",
      detail: "这次任务的 token 预算 40000 已经用尽",
    });
  });

  it("keeps an unlabelled prefix verbatim instead of hiding it", () => {
    expect(describeFailure("weird_stage: 崩了")).toEqual({ stage: null, detail: "weird_stage: 崩了" });
  });

  it("passes through text that carries no stage at all", () => {
    expect(describeFailure("这一轮失败了")).toEqual({ stage: null, detail: "这一轮失败了" });
  });

  it("says nothing failed when there is no error", () => {
    expect(describeFailure(null)).toBeNull();
    expect(describeFailure("")).toBeNull();
  });

  it("names the stage in the sentence the shell shows", () => {
    expect(formatFailure("restart: 上次进程退出时它还停在这一步", "这一轮失败了")).toBe(
      "失败在「重启后对账」：上次进程退出时它还停在这一步"
    );
  });

  it("never loses a stage it has no label for", () => {
    expect(formatFailure("mystery_stage: 撑不住了", "这一轮失败了")).toBe("mystery_stage: 撑不住了");
    expect(formatFailure(null, "这一轮失败了")).toBe("这一轮失败了");
  });
});
