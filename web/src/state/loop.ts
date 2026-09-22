import type { Feed } from "../api/client";

/**
 * The five stations the product actually runs through, in order. A station is `done`
 * only because a row exists that proves it — the artifact type, the task result, the
 * review draft. Nothing here is estimated from how many runs happened, and there is no
 * percentage: a station is lit by a row or it is not lit.
 */
export interface Station {
  key: "direction" | "frame" | "compare" | "act" | "review";
  /** Four characters or fewer; this is a label on a track, not a sentence. */
  name: string;
  glyph: string;
  done: boolean;
  /** What the rows say, in the words a student reads. */
  hint: string;
  /** What the composer should hold if she takes this station as her next step. */
  capability: string;
  goal: string;
}

const ofType = (feed: Feed | null, ...types: string[]) =>
  (feed?.artifacts ?? []).filter((entry) => types.includes(entry.artifact_type));

const quotes = (rows: { evidence_quotes: Record<string, string> }[]) =>
  rows.reduce((total, entry) => total + Object.keys(entry.evidence_quotes ?? {}).length, 0);

export function loopStations(feed: Feed | null): Station[] {
  const directions = ofType(feed, "DirectionBrief", "ProfileGapReport");
  const directionQuotes = quotes(directions);

  const frames = ofType(feed, "DecisionFrame");
  const matrices = ofType(feed, "ComparisonMatrix");
  const candidates = feed?.projects?.[0]?.candidate_count ?? 0;

  const tasks = feed?.tasks ?? [];
  const brought = tasks.filter((task) => task.results.length > 0).length;
  const reviews = ofType(feed, "WeeklyReviewDraft");
  const planned = tasks.length > 0 || ofType(feed, "ActionPlanDraft").length > 0;

  return [
    {
      key: "direction",
      name: "看方向",
      glyph: "travel_explore",
      done: directions.length > 0,
      hint: directionQuotes ? `对上了 ${directionQuotes} 条原话` : "还没有能对上的原话",
      capability: "direction_explore",
      goal: "我在两个方向之间犹豫，想先看看真实岗位到底要什么",
    },
    {
      key: "frame",
      name: "说清比什么",
      glyph: "flag",
      done: frames.length > 0,
      hint: frames.length ? "已经框成一个能比较的问题" : "还没说清这次要比什么",
      capability: "decision_frame",
      goal: "帮我把这个纠结整理成一个能比较、能行动的问题",
    },
    {
      key: "compare",
      name: "摆开比一比",
      glyph: "balance",
      done: matrices.length > 0,
      hint: matrices.length
        ? candidates
          ? `${candidates} 个选择摆在一起了`
          : "有了一个能改的比较结论"
        : "手上还没有能比的结论",
      capability: "compare_decide",
      goal: "把这几个选择按我在乎的标准摆开比一比",
    },
    {
      key: "act",
      name: "去做一件",
      glyph: "edit_note",
      done: brought > 0,
      hint: tasks.length
        ? `${brought} / ${tasks.length} 件带回了结果`
        : planned
          ? "这周的计划刚排出来，还没派事"
          : "还没派一件小事给你做",
      capability: "action_plan",
      goal: "这周给我一件能在现实中做完的小事",
    },
    {
      key: "review",
      name: "回头看",
      glyph: "history",
      done: reviews.length > 0,
      hint: reviews.length ? "这一周已经对过一次账" : "还没回头看这一周",
      capability: "weekly_review",
      goal: "带我回头看这一周做成了什么、卡在哪",
    },
  ];
}

/** The first station the data has not lit yet — the one the screen should push. */
export function currentStation(stations: Station[]): Station | null {
  return stations.find((station) => !station.done) ?? null;
}
