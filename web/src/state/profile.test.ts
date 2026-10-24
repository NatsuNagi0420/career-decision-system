/** 青穗集 · 主页下一步验收：依据真实资料与有效成果，不以空报告或拒绝结果冒充进展。 */
import { describe, expect, it } from "vitest";
import type { ArtifactEntry, PersonalProfile } from "../api/client";
import { availableArtifacts, categoryLabel, nextProfileStep } from "./profile";
const empty: PersonalProfile = { version: 0, school: "", major: "", graduation_year: null, city_targets: [], summary: "", updated_at: null, facts: [] };
const artifact = (artifact_type: string, status = "draft") => ({ artifact_type, status } as ArtifactEntry);
describe("personal homepage", () => {
  it("starts from experience when there is no confirmed material", () => {
    expect(nextProfileStep(empty, []).label).toBe("和穗奈整理经历");
  });
  it("can match jobs after the person filled their background", () => {
    expect(nextProfileStep({ ...empty, school: "测试大学" }, []).label).toBe("开始岗位对照");
  });
  it("does not use rejected or superseded files as progress", () => {
    expect(availableArtifacts([artifact("JobMatchReport", "rejected"), artifact("JobMatchReport", "superseded")])).toEqual([]);
    expect(nextProfileStep({ ...empty, major: "计算机" }, [artifact("JobMatchReport", "rejected")]).label).toBe("开始岗位对照");
  });
  it("moves from a job report to a learning route then a resume", () => {
    const profile = { ...empty, major: "计算机" };
    const jobs = [artifact("JobMatchReport")];
    expect(nextProfileStep(profile, jobs).label).toBe("整理学习路线");
    expect(nextProfileStep(profile, [...jobs, artifact("LearningPathDraft")]).label).toBe("开始写简历");
    expect(nextProfileStep(profile, [...jobs, artifact("LearningPathDraft"), artifact("ResumeDraft")]).label).toBe("继续优化简历");
  });
  it("keeps unfamiliar legacy categories visible", () => {
    expect(categoryLabel("experience")).toBe("实习与项目");
    expect(categoryLabel("project")).toBe("项目经历");
    expect(categoryLabel("custom")).toBe("custom");
  });
});
