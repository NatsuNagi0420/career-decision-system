/** 青穗集 · 求职主线四站只由成果物点亮。 */
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
    expect(stations.map((station) => station.done)).toEqual([false, false, false, false]);
    expect(currentStation(stations)?.key).toBe("profile");
  });

  it("says there is nothing to point at once every station is lit", () => {
    const stations = loopStations(
      feed({
        artifacts: [
          artifact("ProfileGapReport"),
          artifact("JobMatchReport", 2),
          artifact("LearningPathDraft"),
          artifact("ResumeDraft"),
        ],
      }),
    );
    expect(stations.every((station) => station.done)).toBe(true);
    expect(currentStation(stations)).toBeNull();
  });

  it("counts quoted job lines instead of guessing progress", () => {
    const stations = loopStations(feed({ artifacts: [artifact("JobMatchReport", 3)] }));
    const jobs = stations.find((station) => station.key === "jobs");
    expect(jobs?.hint).toBe("对上了 3 条原话");
    expect(jobs?.done).toBe(true);
  });

  it("does not light a later station because an earlier one is empty", () => {
    const stations = loopStations(feed({ artifacts: [artifact("ResumeDraft")] }));
    expect(stations.map((station) => station.done)).toEqual([false, false, false, true]);
    expect(currentStation(stations)?.key).toBe("profile");
  });

  it("keeps every station pointing at a capability the shell can actually run", () => {
    const ids = loopStations(feed()).map((station) => station.capability);
    expect(ids).toEqual(["profile_diagnose", "job_match", "learning_path", "resume_build"]);
  });
});
