import { describe, expect, it } from "vitest";
import type { Feed } from "../api/client";
import { currentStation, loopStations } from "./loop";

const artifact = (type: string, quoteCount = 0) => ({
  id: `a-${type}`,
  run_id: "r1",
  artifact_type: type,
  title: type,
  status: "committed",
  version: 1,
  data_coverage: null,
  is_provisional: false,
  generation_mode: "mock",
  content: {},
  evidence_quotes: Object.fromEntries(Array.from({ length: quoteCount }, (_, i) => [String(i), "原句"])),
  source_refs: [],
  supersedes_id: null,
});

const feed = (over: Partial<Feed> = {}): Feed => ({
  runs: [],
  projects: [],
  artifacts: [],
  obligations: [],
  tasks: [],
  pending_approvals: [],
  ...over,
});

describe("the loop spine", () => {
  it("starts at the first station when nothing has happened", () => {
    const stations = loopStations(feed());
    expect(stations.map((station) => station.done)).toEqual([false, false, false, false, false]);
    expect(currentStation(stations)?.key).toBe("direction");
  });

  it("says there is nothing to point at once every station is lit", () => {
    const stations = loopStations(
      feed({
        artifacts: [
          artifact("DirectionBrief", 2),
          artifact("DecisionFrame"),
          artifact("ComparisonMatrix"),
          artifact("WeeklyReviewDraft"),
        ],
        tasks: [
          {
            id: "t1",
            project_id: "p1",
            plan_id: "pl1",
            title: "去问一个在职的人",
            expected_output: "他的一天",
            week_no: 1,
            kind: "conversation",
            status: "done",
            due_date: null,
            results: [{ id: "r1", body: "…", link: null, at: "2026-09-22T10:00:00" }],
          },
        ],
      }),
    );
    expect(stations.every((station) => station.done)).toBe(true);
    expect(currentStation(stations)).toBeNull();
  });

  it("counts what came back instead of guessing progress", () => {
    const stations = loopStations(
      feed({
        tasks: [
          {
            id: "t1",
            project_id: "p1",
            plan_id: "pl1",
            title: "a",
            expected_output: "",
            week_no: 1,
            kind: "conversation",
            status: "open",
            due_date: null,
            results: [{ id: "r1", body: "…", link: null, at: "2026-09-22T10:00:00" }],
          },
          {
            id: "t2",
            project_id: "p1",
            plan_id: "pl1",
            title: "b",
            expected_output: "",
            week_no: 1,
            kind: "conversation",
            status: "open",
            due_date: null,
            results: [],
          },
        ],
      }),
    );
    const act = stations.find((station) => station.key === "act");
    expect(act?.hint).toBe("1 / 2 件带回了结果");
    expect(act?.done).toBe(true);
  });

  it("does not light a later station because an earlier one is empty", () => {
    const stations = loopStations(feed({ artifacts: [artifact("ComparisonMatrix")] }));
    expect(stations.map((station) => station.done)).toEqual([false, false, true, false, false]);
    // The spine still points at 看方向: a conclusion with nothing under it is not progress.
    expect(currentStation(stations)?.key).toBe("direction");
  });

  it("keeps every station pointing at a capability the shell can actually run", () => {
    const ids = loopStations(feed()).map((station) => station.capability);
    expect(ids).toEqual(["direction_explore", "decision_frame", "compare_decide", "action_plan", "weekly_review"]);
  });
});
