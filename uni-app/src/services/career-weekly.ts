/** 青穗集 · 本周回顾：仅汇总当前来源的真实时间记录，更新日期不冒称完成日期。 */
import type { Artifact, CareerView } from "./api";
import type { LearningState, PreparationState } from "./career-development";
export interface WeeklyReport {
  period: string; from: string; to: string; actions: string[]; lessons: string[]; sessions: string[]; files: string[]; next: string;
}
export function weeklyReport(career: CareerView | null, learning: LearningState | null, preparation: PreparationState | null, files: Artifact[], now = new Date()): WeeklyReport {
  const start = new Date(now); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  const end = new Date(start); end.setDate(start.getDate() + 7);
  const inWeek = (stamp?: string | null) => { const time = stamp ? Date.parse(stamp) : NaN; return Number.isFinite(time) && time >= start.getTime() && time <= now.getTime() && time < end.getTime(); };
  const label = (date: Date) => `${date.getMonth() + 1}.${date.getDate()}`;
  const last = new Date(end); last.setDate(last.getDate() - 1);
  const actions = career?.actions.filter(item => item.status === "done" && inWeek(item.updated_at)).map(item => item.title) || [];
  const lessons = learning?.paths.flatMap(path => path.nodes.filter(node => node.status === "done" && inWeek(node.updated_at)).map(node => node.title)) || [];
  const sessions = preparation?.sessions.filter(item => item.status === "completed" && inWeek(item.updated_at)).map(item => item.job_title + " · " + ({ practice: "练习", exam: "试卷", interview: "面试" }[item.mode])) || [];
  const uniqueFiles = [...new Map(files.filter(file => file.kind === "output" && inWeek(file.created_at)).map(file => [file.id, file])).values()].map(file => file.name);
  const activePath = learning?.paths.find(path => path.id === learning.active_path_id);
  const node = activePath?.nodes.find(item => item.status === "doing") || activePath?.nodes.find(item => item.status === "todo");
  const action = career?.actions.find(item => item.status === "doing") || career?.actions.find(item => item.status === "todo");
  return { period: `${label(start)} — ${label(last)}`, from: start.toISOString(), to: end.toISOString(), actions, lessons, sessions, files: uniqueFiles, next: node?.title || action?.title || "和穗奈确定下一步" };
}
export function weeklyPosterLines(report: WeeklyReport, includeTitles = false, pcSource = false) {
  const lines = ["青穗集 · 本周回顾", report.period, "", ...(pcSource ? ["电脑来源 · 已同步记录"] : [`学习记录 ${report.lessons.length} 节`, `训练结束 ${report.sessions.length} 轮`]), `行动记录 ${report.actions.length} 项`, `生成文件 ${report.files.length} 份`];
  if (includeTitles) lines.push("", "这周留下的积累", ...[...report.lessons, ...report.sessions, ...report.actions, ...report.files].slice(0, 6));
  lines.push("", "走过的每一步，都算数。", "和穗奈一起，把迷茫变成下一步");
  return lines;
}
