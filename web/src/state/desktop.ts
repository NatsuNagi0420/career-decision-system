/** 青穗集 · 桌面应用目录与成果筛选：只组织既有能力，不触发模型、不伪造用户进度。 */
import type { ArtifactEntry } from "../api/client";

export type DesktopApp = "messages" | "profile" | "jobs" | "growth" | "resume";
export const DESKTOP_APPS = [
  { id: "profile", name: "个人主页", file: "PROFILE", title: "先补我的经历", hint: "把做过的事，变成清楚的经历", goal: "先补我的经历，缺哪条会明说", glyph: "person_search", artifactType: "ProfileGapReport" },
  { id: "jobs", name: "岗位浏览器", file: "CAREER", title: "对照岗位", hint: "看要求，也看你已经做过的事", goal: "按我现在的经历对照目录里适合我的岗位", glyph: "travel_explore", artifactType: "JobMatchReport" },
  { id: "growth", name: "成长手账", file: "GROWTH", title: "缺口和练习", hint: "把下一步拆成能做的小事", goal: "对照岗位看我还缺什么、有没有题库和练习", glyph: "route", artifactType: "LearningPathDraft" },
  { id: "resume", name: "简历文件", file: "RESUME", title: "写一份简历", hint: "只写你确认过的真实经历", goal: "帮我根据现在的情况写一份简历", glyph: "article", artifactType: "ResumeDraft" },
] as const;

export function desktopArtifacts(app: DesktopApp, artifacts: ArtifactEntry[]): ArtifactEntry[] {
  const spec = DESKTOP_APPS.find((entry) => entry.id === app);
  return spec ? artifacts.filter((entry) => entry.artifact_type === spec.artifactType && entry.status !== "superseded") : [];
}
