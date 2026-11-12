/** 青穗集 · 成长展示摘要：只统计已有资料和真实行动，不推断能力分或简历完成度。 */
import type { CareerView } from "./api";
export function growthSummary(career: CareerView) {
  // 接口返回异常时在读取阶段报错，不能让模板里的 computed 抛错后整页空白。
  if (!career || !career.profile ||
      !Array.isArray(career.jobs) || !Array.isArray(career.actions) ||
      !Array.isArray(career.proposals))
    throw new Error("成长资料暂时无法显示，请重试。");
  const profileKeys = [
    "education",
    "experience",
    "skills",
    "preferences",
    "weekly_hours",
  ] as const;
  const factCount = profileKeys.filter((key) =>
    career.profile[key]?.trim(),
  ).length;
  const actions = career.actions;
  const done = actions.filter((action) => action.status === "done");
  const next =
    actions.find((action) => action.status === "doing") ??
    actions.find((action) => action.status === "todo");
  const result = [...done]
    .filter((action) => action.result.trim())
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  return {
    factCount,
    doneCount: done.length,
    total: actions.length,
    completion: actions.length
      ? Math.round((done.length / actions.length) * 100)
      : 0,
    next,
    result,
    relatedJob: next?.job_id
      ? career.jobs.find((job) => job.id === next.job_id)
      : undefined,
    otherActions: actions
      .filter((action) => action.id !== next?.id)
      .slice(0, 3),
    pendingCount: career.proposals.filter(
      (proposal) =>
        !proposal.status || proposal.status === "pending_confirmation",
    ).length,
    allDone: actions.length > 0 && done.length === actions.length,
  };
}
