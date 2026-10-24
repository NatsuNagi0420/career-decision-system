/** 青穗集 · 正式陪伴状态：只读取同一任务的事件与已落库结果，不根据回复措辞猜测成功。 */
import type { Snapshot } from "../api/client";
import { emptyState, type ShellState } from "../state/frames";
import { formatFailure } from "../state/failure";
import { actionForSignals, type SuinaiActionId } from "./suinaiActions";

export type CompanionPhase = "idle" | "listening" | "working" | "confirmation" | "result" | "cancelled" | "error";
export interface CompanionCue {
  phase: CompanionPhase;
  action: SuinaiActionId;
  /** Stable across tokens, feed refreshes and navigation; a new cue may restart its action once. */
  key: string;
  label: string;
  line: string;
  reconnect?: boolean;
}
export interface CompanionIssue { kind: "connection" | "request"; message: string }
export interface CompanionInput {
  runId: string | null;
  state: ShellState;
  snapshot: Snapshot | null;
  composing: boolean;
  submitting?: "run" | "decision" | null;
  issue?: CompanionIssue | null;
  /** History and reloads show the result calmly instead of replaying a success reaction. */
  reactToResult?: boolean;
}
type Domain = "profile" | "jobs" | "learning" | "route" | "resume";
const DOMAINS: Record<string, Domain> = {
  profile_diagnose: "profile", job_match: "jobs", learning_path: "learning",
  action_plan: "route", resume_build: "resume",
};
const WORK: Record<Domain, [string, string]> = {
  profile: ["正在整理画像", "我在对照你提供的经历。需要核对的地方，会先问你再保存。"],
  jobs: ["正在对照岗位", "我在对照你的经历和岗位目录。推荐会说明依据，不把目录当作实时招聘。"],
  learning: ["正在整理学习建议", "我在对照岗位要求，整理需要补的知识和已有练习。"],
  route: ["正在梳理下一步", "我在把目标拆成可以执行和核对的小步骤。"],
  resume: ["正在整理简历", "我在检查已确认的经历和表达，不会替你编造能力、经历或成果数字。"],
};
const RESULTS: Record<string, [SuinaiActionId, string, string]> = {
  ProfileGapReport: ["A11", "画像整理结果已返回", "整理结果和待补信息在消息里。先核对理解是否准确，这不代表所有资料已经确认或保存。"],
  JobMatchReport: ["A15", "岗位对照结果已返回", "可以看看推荐依据和要求差距。这些是岗位目录参考，不保证当前正在招聘。"],
  LearningPathDraft: ["A26", "学习建议已整理", "知识缺口和已收录的练习在结果里。我们可以从眼前的一小步开始。"],
  ActionPlanDraft: ["A26", "行动路线已整理", "路线草稿在消息里。需要写入的内容仍以你的确认和实际结果为准。"],
  ResumeDraft: ["A33", "简历草稿已整理", "先核对草稿里的事实和表达，再选择模板。这只是草稿，还没有导出文件。"],
};

export function companionCue(input: CompanionInput): CompanionCue {
  const scope = input.runId ?? "no-run";
  const state = input.runId && input.state.runId === input.runId ? input.state : emptyState;
  const snapshot = input.snapshot?.run.id === input.runId ? input.snapshot : null;
  const cue = (phase: CompanionPhase, action: SuinaiActionId, key: string, label: string, line: string): CompanionCue =>
    ({ phase, action, key: `${scope}:${key}`, label, line });
  if (input.submitting) return cue("working", "A38", `submitting:${input.submitting}`,
    input.submitting === "decision" ? "正在提交你的决定" : "正在提交任务",
    "请求正在提交，先不用重复点击。收到实际进度后，我会继续告诉你。");
  if (input.issue) return { ...cue("error", "A39", `issue:${input.issue.kind}:${input.issue.message}`,
    input.issue.kind === "connection" ? "连接暂时中断" : "提交尚未确认",
    input.issue.kind === "connection" ? "暂时没能收到完整进度，这不代表后台任务已经失败。可以重新连接进度，不会重复提交任务。" : "这次提交还没有得到确认。请查看消息中的提示，再决定是否重试。"),
    reconnect: input.issue.kind === "connection" };

  // Terminal events are authoritative; a still-running snapshot can be an earlier read.
  const terminal = ["completed", "failed", "cancelled"].includes(state.status);
  const status = terminal ? state.status : snapshot && ["completed", "failed", "cancelled"].includes(snapshot.run.status)
    ? snapshot.run.status : state.status !== "idle" ? state.status : snapshot?.run.status;
  if (status === "failed") return cue("error", actionForSignals({ error: true }), "failed", "这一步没有完成",
    formatFailure(state.errors.at(-1) ?? snapshot?.run.error, "请查看消息中的失败说明，我们再决定如何继续。"));
  if (input.composing && (status === "completed" || status === "cancelled")) return cue("listening", "A03", "listening", "等你写完", "先慢慢写，没发送前我不会整理或保存。");
  if (status === "cancelled") return cue("cancelled", "A02", "cancelled", "已按你的决定停止",
    "这次提议没有执行写入。你可以继续修改想法，不需要为了继续对话而采纳它。");
  if (status === "awaiting_approval") return cue("confirmation", actionForSignals({ awaitingConfirmation: true }), "confirmation", "等你确认",
    "请先检查消息里的确认卡。你确认后，我才会继续执行这次写入。");
  const domain = DOMAINS[state.capabilityId ?? snapshot?.run.capability_id ?? ""];
  if (status === "running" || status === "created" || status === "paused") {
    if (status === "paused") return cue("working", "A22", "paused", "任务已暂停", "这一步暂时停下了。请先查看消息中的说明，不会假装还在处理中。");
    const [label, line] = domain ? WORK[domain] : ["正在处理你的问题", "我在对照你提供的内容。结果会留在消息里，不需要一直盯着我。"];
    return cue("working", domain ? actionForSignals({ running: true, domain }) : "A38", `working:${domain ?? "general"}`, label, line);
  }
  if (status === "completed") {
    // A persisted draft is a deliverable, not an approved business write or a file export.
    if (!snapshot || snapshot.run.status !== "completed") return cue("working", "A38", "syncing", "正在同步结果", "任务已结束，我正在核对已保存的结果。");
    const applied = snapshot.proposals.find(proposal => proposal.status === "applied" && proposal.result !== null);
    if (applied) return cue("result", input.reactToResult ? domain === "profile" ? "A13" : "A04" : "A02", `applied:${applied.id}`,
      domain === "profile" ? "本次画像信息已保存" : "本次确认已执行",
      "服务端已确认这次写入完成。可以在消息里检查结果，后续整理会以已确认的信息为准。");
    const artifact = [...snapshot.artifacts].reverse().find(entry => entry.run_id === input.runId && ["draft", "committed", "pending_approval"].includes(entry.status));
    if (artifact?.status === "pending_approval") return cue("result", "A12", `unconfirmed:${artifact.id}:${artifact.version}`, "本轮结果尚未确认",
      "内容已返回，但还没有确认写入。请先检查消息里的结果，不把它当成已保存或已导出的文件。");
    if (artifact?.is_provisional) return cue("result", "A12", `provisional:${artifact.id}:${artifact.version}`, "结果仍需补充依据",
      "这份结果已标出依据不足的地方。先补信息或核对原文，不把暂定结论当成确定答案。");
    if (artifact) {
      const [action, label, line] = RESULTS[artifact.artifact_type] ?? ["A04", "本轮结果已返回", "这轮整理的具体说明在消息里，可以先看看，再决定下一步。"];
      return cue("result", input.reactToResult ? action : "A02", `result:${artifact.id}:${artifact.version}`, label, line);
    }
    return cue("result", "A02", "completed", "这一轮已结束", "具体说明留在消息里。是否保存或导出，以实际结果为准。");
  }
  if (input.runId && !snapshot && state.status === "idle") return cue("working", "A38", "connecting", "正在读取任务进度", "我在读取这轮对话的实际状态，请稍等一下。");
  if (input.composing) return cue("listening", actionForSignals({ composing: true }), "listening", "等你写完", "先慢慢写，没发送前我不会整理或保存。");
  return cue("idle", actionForSignals({}), "idle", "随时可以开始", "不用一下子想清楚所有事。我们先把眼前这一小步做好。");
}
