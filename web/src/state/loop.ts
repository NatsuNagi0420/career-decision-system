/** 青穗集 · 求职主线四站：画像、岗位、缺口、简历。一站亮起只因为有对应成果物。 */
import type { Feed } from "../api/client";

/**
 * The four stations the product actually runs through, in order. A station is `done`
 * only because a row exists that proves it — the artifact type. Nothing here is
 * estimated from how many runs happened, and there is no percentage.
 */
export interface Station {
  key: "profile" | "jobs" | "gaps" | "resume";
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
  const profiles = ofType(feed, "ProfileGapReport");
  const jobs = ofType(feed, "JobMatchReport");
  const gaps = ofType(feed, "LearningPathDraft");
  const resumes = ofType(feed, "ResumeDraft");
  const jobQuotes = quotes(jobs);

  return [
    {
      key: "profile",
      name: "画像",
      glyph: "person_search",
      done: profiles.length > 0,
      hint: profiles.length ? "已经记下你确认过的经历" : "还没记下经历",
      capability: "profile_diagnose",
      goal: "先补我的经历，缺哪条会明说",
    },
    {
      key: "jobs",
      name: "岗位",
      glyph: "travel_explore",
      done: jobs.length > 0,
      hint: jobQuotes ? `对上了 ${jobQuotes} 条原话` : "还没有能对上的岗位原话",
      capability: "job_match",
      goal: "按我现在的经历对照目录里适合我的岗位",
    },
    {
      key: "gaps",
      name: "缺口",
      glyph: "route",
      done: gaps.length > 0,
      hint: gaps.length ? "已经对照过缺口和练习" : "还没看缺口和练习",
      capability: "learning_path",
      goal: "对照岗位看我还缺什么、有没有题库和练习",
    },
    {
      key: "resume",
      name: "简历",
      glyph: "article",
      done: resumes.length > 0,
      hint: resumes.length ? "已经有一份简历草稿" : "还没写简历",
      capability: "resume_build",
      goal: "帮我根据现在的情况写一份简历",
    },
  ];
}

/** The first station the data has not lit yet — the one the screen should push. */
export function currentStation(stations: Station[]): Station | null {
  return stations.find((station) => !station.done) ?? null;
}
