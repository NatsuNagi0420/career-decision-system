/** 青穗集 · 职业主线与求职任务：用已有事实确定下一步，草稿不等于完成。 */
import type { CareerView } from "./api";
import type { LearningState, PreparationState, PreparationMode } from "./career-development";
export const journeySteps = [
  { key: "profile", title: "认识自己", url: "/pages/profile/index" },
  { key: "compare", title: "选择方向", url: "/pages/compare/index" },
  { key: "learning", title: "补齐知识", url: "/pages/learning/index" },
  { key: "practice", title: "练习面试", url: "/pages/preparation/index" },
  { key: "results", title: "准备投递", url: "/pages/career-task/index" },
] as const;
export function journeyIndex(career: CareerView, learning?: LearningState | null, preparation?: PreparationState | null) {
  if (!career.profile.experience.trim() && !career.profile.education.trim()) return 0;
  if (!career.jobs.length) return 1;
  const decision = preparation?.boards.find(board => !board.stale && board.primary_job_id && career.jobs.some(job => job.id === board.primary_job_id));
  const targetId = decision?.primary_job_id || (career.jobs.length === 1 ? career.jobs[0].id : null);
  if (!targetId) return 1;
  const sessions = preparation?.sessions.filter(session => session.job_id === targetId && !session.stale) || [];
  if (sessions.some(session => session.status !== "completed")) return 3;
  if (sessions.some(session => session.status === "completed" && session.answers.length > 0)) return 4;
  const path = learning?.paths.find(path => path.id === learning.active_path_id && path.job_id === targetId);
  if (path?.nodes.some(node => node.status === "done") && path.nodes.every(node => node.status === "done" || node.status === "skipped")) return 3;
  return 2;
}
export type CareerTaskKind = "resume" | "compare" | "interview";
export const careerTasks: Array<{ kind: CareerTaskKind; title: string; icon: string; placeholder: string }> = [
  { kind: "resume", title: "针对岗位改简历", icon: "resume", placeholder: "补充想突出的经历，或粘贴目标岗位 JD" },
  { kind: "compare", title: "比较职业方向", icon: "target", placeholder: "补充纠结的方向，以及时间、城市等限制" },
  { kind: "interview", title: "准备一次面试", icon: "books", placeholder: "补充面试日期、岗位要求或想练习的问题" },
];
export function careerTaskPrompt(kind: CareerTaskKind, career: CareerView | null, jobId: string, notes: string, filename?: string, sameSource = true) {
  const job = career?.jobs.find(item => item.id === jobId);
  const instruction = kind === "resume"
    ? "请结合我上传的简历或已确认的真实经历，针对目标岗位优化简历。先核对材料和缺失信息，再改写、排版并导出可下载文件。不能编造职责、数字或成果。"
    : kind === "compare"
      ? "请读取我的已确认经历和已保存岗位，比较吸引点、准备成本、取舍和未知信息，逐字引用依据，并保存岗位比较草稿；首选和备选由我决定。"
      : "请读取我的真实经历和目标岗位，帮助我准备面试。先核对背景，再开始一轮文字模拟面试，一次问一题，依据我的回答追问并记录反馈。";
  return [instruction, sameSource && career?.profile.goal ? "当前目标：" + career.profile.goal : "",
    !sameSource ? "执行位置已改变，请读取此位置的真实职业资料并重新确认。以下岗位文本由我从另一位置提供，不代表此位置已有对应记录；如需保存岗位，先与我核对。" : "",
    job ? `目标岗位：${job.title}\n${sameSource ? `岗位编号：${job.id}\n` : ''}岗位要求：${job.description}` : "请先和我确定目标岗位。",
    notes.trim() ? "我的补充：\n" + notes.trim() : "", filename ? "随附材料：" + filename : ""].filter(Boolean).join("\n\n");
}
export function preparationPrompt(mode: PreparationMode, job: { id: string; title: string }, total: number, bankIds: string[] = []) {
  const selection = mode === "practice" && bankIds.length ? `使用整理题库 ID：${bankIds.join("、")}，共 ${bankIds.length} 题。` : `现场出 ${total} 题。`;
  return `我想针对已保存的「${job.title}」（岗位编号：${job.id}）开始全新的一轮${{ practice: "岗位练习", exam: "模拟试卷", interview: "文字模拟面试" }[mode]}。请读取最新职业与准备记录，调用 start_career_preparation 保存本轮。${selection}${mode === "exam" ? "一次一题，交卷前不讲答案或评分。" : mode === "interview" ? "请担任考官，结合我的真实经历设定工作场景，一次问一题，等我回答后再追问。" : "一次一题，答后讲解并记录实际反馈。"}题目不得冒称企业真题，不把练习表现当作职业能力认证。`;
}
