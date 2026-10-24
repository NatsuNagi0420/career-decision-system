/** 青穗集 · 个人主页资料整理：经历分类、真实成果与下一步建议共用同一组规则。 */
import type { ArtifactEntry, PersonalProfile } from "../api/client";

export const FACT_CATEGORIES = [
  ["education", "教育背景"], ["experience", "实习与项目"], ["skills", "技能与工具"],
  ["awards", "证书与获奖"], ["constraints", "求职偏好"], ["interests", "兴趣方向"],
  ["values", "看重的事情"], ["context", "其他经历"],
] as const;

export function categoryLabel(key: string): string {
  return FACT_CATEGORIES.find(([value]) => value === key)?.[1]
    ?? (({ projects: "项目经历", project: "项目经历", internship: "实习经历", school: "教育背景" } as Record<string, string>)[key] ?? key);
}

export function availableArtifacts(artifacts: ArtifactEntry[]): ArtifactEntry[] {
  return artifacts.filter(item => !["superseded", "rejected"].includes(item.status));
}

export function nextProfileStep(profile: PersonalProfile, artifacts: ArtifactEntry[]) {
  const has = (type: string) => availableArtifacts(artifacts).some(item => item.artifact_type === type);
  if (!profile.facts.length && !profile.school && !profile.major) return {
    title: "先留下一段真实经历", detail: "课程作业、实习或做过的小项目，都可以从一句话开始。",
    goal: "帮我梳理个人经历，一次问我一个问题，确认后再保存", label: "和穗奈整理经历",
  };
  if (!has("JobMatchReport")) return {
    title: "看看经历适合哪些岗位", detail: "用你已确认的资料对照岗位目录，了解匹配依据和不足。",
    goal: "按我已确认的经历对照目录里适合我的岗位，并说明依据", label: "开始岗位对照",
  };
  if (!has("LearningPathDraft")) return {
    title: "把岗位要求变成学习计划", detail: "从已有岗位对照里找出知识缺口和可以开始的练习。",
    goal: "根据我的岗位对照，整理知识缺口、学习路线和已有题库练习", label: "整理学习路线",
  };
  return { title: has("ResumeDraft") ? "继续打磨你的简历" : "把经历整理成简历",
    detail: "围绕目标方向，用已确认的经历写作，缺少的内容会明确告诉你。",
    goal: has("ResumeDraft") ? "帮我检查已有简历，按目标岗位提出可核实的优化建议" : "根据已确认的经历写一份简历，并告诉我还要补哪些内容",
    label: has("ResumeDraft") ? "继续优化简历" : "开始写简历" };
}
