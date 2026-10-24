/** 青穗集 · 第一屏必须是求职入口，不能再露出规划轨道。 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Welcome } from "./Welcome";

const html = renderToStaticMarkup(
  createElement(Welcome, {
    lead: "直接说你现在卡在哪一步。",
    onStart: () => {},
  }),
);

describe("the first screen a job seeker sees", () => {
  it("greets and offers the four job-seeking actions", () => {
    expect(html).toContain("你好，我是穗奈");
    expect(html).toContain("先补我的经历");
    expect(html).toContain("对照岗位");
    expect(html).toContain("缺口和练习");
    expect(html).toContain("写一份简历");
  });

  it("does not put the researcher loop on the consumer greeting", () => {
    expect(html).not.toContain("这一轮走到哪");
    expect(html).not.toContain("看方向");
    expect(html).not.toContain("两个方向犹豫");
    expect(html).not.toContain("工作流");
    expect(html).not.toContain("确定性路径");
  });
});
