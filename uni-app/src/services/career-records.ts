/** 青穗集 · 成长记录呈现：完整展示建议内容，不把待确认草稿当成个人事实。 */
import type { CareerProposal, CareerView } from "./api";
export const profileLabels: Record<string, string> = {
  goal: "当前目标",
  education: "教育背景",
  experience: "项目与工作经历",
  skills: "技能",
  preferences: "偏好与限制",
  weekly_hours: "每周可投入时间",
};
export function pendingProposals(career: CareerView | null) {
  return (
    career?.proposals.filter(
      (p) => !p.status || p.status === "pending_confirmation",
    ) ?? []
  );
}
export function proposalRows(
  proposal: CareerProposal,
): Array<{ label: string; value: string }> {
  const data = proposal.data ?? {};
  if (
    data.kind === "profile" &&
    data.profile &&
    typeof data.profile === "object"
  )
    return Object.entries(data.profile as Record<string, unknown>)
      .filter(
        ([key, value]) =>
          key in profileLabels && typeof value === "string" && value,
      )
      .map(([key, value]) => ({
        label: profileLabels[key],
        value: String(value),
      }));
  if (data.kind === "actions" && Array.isArray(data.actions))
    return data.actions.flatMap((action, i) => {
      const a = action as Record<string, unknown>;
      return [
        ["下一步 " + (i + 1), a.title],
        ["原因", a.why],
        ["需要学习", a.learn],
        ["交付成果", a.deliverable],
      ]
        .filter(([, value]) => typeof value === "string" && value)
        .map(([label, value]) => ({
          label: String(label),
          value: String(value),
        }));
    });
  if (data.kind === "skills" && Array.isArray(data.skills))
    return data.skills.flatMap((item) => {
      const skill = item as Record<string, unknown>;
      const evidence = Array.isArray(skill.evidence)
        ? skill.evidence
            .map((e) => String((e as Record<string, unknown>).quote || ""))
            .filter(Boolean)
        : [];
      return [
        {
          label: String(skill.name || "技能"),
          value: evidence.length ? evidence.join("\n") : "尚未提供引用依据",
        },
      ];
    });
  if (data.kind === "comparison")
    return [
      { label: "岗位对照", value: String(data.summary || proposal.title) },
      ...(Array.isArray(data.checks)
        ? data.checks.map((item) => {
            const c = item as Record<string, unknown>;
            return {
              label: String(c.requirement || "要求"),
              value: String(c.reason || "待核对"),
            };
          })
        : []),
    ];
  if (data.kind === "catalogue_job")
    return [
      {
        label: "岗位样本",
        value:
          proposal.catalogue_sample?.title ||
          String(data.catalogue_id || proposal.title),
      },
    ];
  return [
    {
      label: "整理内容",
      value: typeof data.summary === "string" ? data.summary : proposal.title,
    },
  ];
}
