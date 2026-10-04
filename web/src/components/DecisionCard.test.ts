import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DecisionCard } from "./DecisionCard";

/**
 * The approval card is the load-bearing gate: one click can now file several rows, so
 * every row it is about to write has to be readable on the card. Before this, list
 * payloads were dumped through `JSON.stringify` — a person approving
 * `{"facts":[{"dimension":…` agreed to something they could not actually read.
 */
const render = (payload: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(DecisionCard, {
      title: "补充画像事实：南方学院 信息管理与信息系统，2027 年毕业 等 3 条",
      rationale: "把你说的三件事分开记，方便以后单条改。",
      riskTier: "R2",
      criteria: ["没提意向城市"],
      payload,
      onDecide: () => {},
    }),
  );

describe("the confirmation gate shows what one click writes", () => {
  const payload = {
    project_id: "3d24b6ab0f0e4a5f9a1c2b3d4e5f6071",
    facts: [
      { dimension: "education", statement: "南方学院 信息管理与信息系统，2027 年毕业" },
      { dimension: "skills", statement: "会用 SQL 和 pandas 做数据清洗" },
      { dimension: "awards", statement: "拿过校级数学建模二等奖" },
    ],
  };

  it("lists every fact as a sentence, not as JSON", () => {
    const html = render(payload);
    expect(html).toContain("会用 SQL 和 pandas 做数据清洗");
    expect(html).toContain("拿过校级数学建模二等奖");
    expect(html).toContain("画像事实");
    expect(html).not.toContain('{"dimension"');
    expect(html).not.toContain("[{");
  });

  it("keeps the raw project key off a C-facing card", () => {
    const html = render(payload);
    expect(html).not.toContain("3d24b6ab");
    expect(html).not.toContain("所属项目");
  });

  it("does the same for a task list, which used to print as JSON too", () => {
    const html = render({
      plan_tasks: [{ week_no: 1, title: "去问一个在职的人他的一天怎么过", expected_output: "一段转述" }],
    });
    expect(html).toContain("去问一个在职的人他的一天怎么过");
    expect(html).toContain("第 1 周");
    expect(html).not.toContain('{"week_no"');
  });

  it("still shows plain fields and the not-yet-sure list", () => {
    const html = render({ name: "数据分析师", quote: "负责排班与对账" });
    expect(html).toContain("名称：数据分析师");
    expect(html).toContain("引文：负责排班与对账");
    expect(html).toContain("没提意向城市");
  });
});
