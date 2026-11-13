/** 青穗集 · 职业任务能力策略：任务入口控制领域工具，简历按当前关卡开放。 */
import type { TaskKind } from "../../guidance-contract.js";
import type { ResumeState } from "../../resume-contract.js";
export function guidedToolAllowed(kind: TaskKind | undefined, name: string, state?: ResumeState) {
  if (!kind) return true;
  if (["read_career_preparation", "propose_job_decision", "start_career_preparation", "review_career_answer"].includes(name)) return kind === "learning" || kind === "career";
  if (["read_learning_context", "search_learning_videos", "propose_learning_path"].includes(name)) return kind === "learning" || kind === "career";
  if (["list_files", "read_file", "list_project_files", "inspect_project", "read_project_file", "search_project_files", "search_files", "plan_tasks", "ask_user", "list_career_directions", "search_job_samples", "read_job_sample", "assess_career_options"].includes(name)) return true;
  if (kind === "resume") {
    // pending 代表程序已经进入事实、取舍或正文整理；此时只给模型当前关卡的提交工具，
    // 避免它继续重复收集同一批材料，把一次版本更新误当成新的失败。
    return name === "read_resume_context" || name === "read_career_context" ||
      ((name === "capture_resume_material") && !state?.pending) ||
      (name === "propose_resume_update" && Boolean(state?.pending)) ||
      (name === "prepare_resume_step" && Boolean(state?.source_text && !state.pending));
  }
  return ["read_career_context", "propose_career_update", "write_file", "publish_file", "request_export", "apply_project_patch", "undo_project_edit"].includes(name);
}
