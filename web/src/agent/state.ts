/** 青穗集 · 任务事件合并：按序去重，正式消息替换流式草稿，失败不会被改成成功。 */
import { isActive } from "./types";
import type {
  Snapshot,
  AgentEvent,
  ChatMessage,
  AgentRun,
  AgentApproval,
  AgentFile,
} from "./types";
export interface ViewState {
  snapshot: Snapshot;
  drafts: Record<string, string>;
  events: AgentEvent[];
}
function replace<T extends { id: string }>(values: T[], value: T) {
  return values.some((item) => item.id === value.id)
    ? values.map((item) => (item.id === value.id ? value : item))
    : [...values, value];
}
export function initialView(snapshot: Snapshot): ViewState {
  const finalized = new Set(snapshot.messages.map(message => message.id));
  return {
    snapshot,
    drafts: isActive(snapshot.runs.at(-1))
      ? Object.fromEntries(Object.entries(snapshot.drafts ?? {}).filter(([id]) => !finalized.has(id)))
      : {},
    events: snapshot.events ?? [],
  };
}
export function applyEvent(state: ViewState, event: AgentEvent): ViewState {
  if (event.seq <= state.snapshot.last_seq) return state;
  const snapshot = { ...state.snapshot, last_seq: event.seq };
  const drafts = { ...state.drafts };
  if (event.kind === "conversation.rewound") {
    const messageIds = new Set(event.data.message_ids as string[]), runIds = new Set(event.data.run_ids as string[]);
    snapshot.messages = snapshot.messages.filter(message => !messageIds.has(message.id));
    snapshot.runs = snapshot.runs.filter(run => !runIds.has(run.id));
    snapshot.approvals = snapshot.approvals.map(approval => approval.run_id && runIds.has(approval.run_id) && approval.status === "pending" ? { ...approval, status: "expired" as const } : approval);
    snapshot.guidance = event.data.guidance as Snapshot["guidance"];
    snapshot.plan = null;
    return { snapshot, drafts: {}, events: [...state.events.filter(item => !item.run_id || !runIds.has(item.run_id)), event].slice(-300) };
  }
  if (event.kind === "resume.review" && snapshot.resume) {
    snapshot.resume = { ...snapshot.resume, evidence_review: event.data.review as import("../../../agent/src/career-decision-contract").ResumeEvidenceReview };
  }
  if (event.kind === "resume.state") {
    const value = event.data.state as NonNullable<Snapshot["resume"]>;
    if (value && (!snapshot.resume || value.revision >= snapshot.resume.revision)) snapshot.resume = { ...value, evidence_review: value.evidence_review ?? snapshot.resume?.evidence_review };
  }
  if (event.kind === "plan.updated" && event.run_id) {
    const plan = event.data.plan as { steps?: NonNullable<Snapshot["plan"]>["steps"] } | undefined;
    if (Array.isArray(plan?.steps)) snapshot.plan = { run_id: event.run_id, steps: plan.steps, updated_at: event.created_at };
  }
  if (event.kind === "guidance.updated") {
    const value = event.data.guidance as NonNullable<Snapshot["guidance"]>;
    if (!snapshot.guidance || value.revision >= snapshot.guidance.revision) snapshot.guidance = value;
  }
  if (event.kind === "obligation.created" || event.kind === "obligation.updated") {
    const obligation = event.data.obligation as NonNullable<Snapshot["obligations"]>[number];
    snapshot.obligations = [...(snapshot.obligations ?? []).filter(item => item.id !== obligation.id), obligation];
  }
  if (event.kind === "message.added") {
    const message = event.data.message as ChatMessage;
    snapshot.messages = replace(snapshot.messages, message);
    delete drafts[message.id];
  }
  if (event.kind === "answer.delta") {
    const key = String(event.data.message_id);
    const active = snapshot.runs.at(-1);
    if (isActive(active) && active!.id === event.run_id && !snapshot.messages.some(message => message.id === key))
      drafts[key] = (drafts[key] ?? "") + String(event.data.text ?? "");
  }
  if (event.kind === "run.retry") {
    for (const key of Object.keys(drafts)) delete drafts[key];
  }
  if (event.kind === "run.checkpoint") {
    const checkpoint = event.data.checkpoint as import("./types").AgentCheckpoint | undefined;
    if (checkpoint) snapshot.checkpoints = [...(snapshot.checkpoints ?? []).filter(item => item.run_id !== checkpoint.run_id), checkpoint];
    const run = snapshot.runs.find(item => item.id === checkpoint?.run_id);
    if (run && checkpoint) {
      const updated = { ...run, checkpoint_id: checkpoint.id, checkpoint_step: checkpoint.step };
      snapshot.runs = snapshot.runs.map(item => item.id === updated.id ? updated : item);
    }
  }
  if (event.kind === "run.status") {
    const run = event.data.run as AgentRun;
    const previous = snapshot.runs.at(-1);
    snapshot.runs = replace(snapshot.runs, run);
    if ((!isActive(run) && snapshot.runs.at(-1)?.id === run.id) || (isActive(run) && previous?.id !== run.id))
      for (const key of Object.keys(drafts)) delete drafts[key];
  }
  if (event.kind === "approval.updated")
    snapshot.approvals = replace(
      snapshot.approvals,
      event.data.approval as AgentApproval,
    );
  if (event.kind === "artifact.created")
    snapshot.artifacts = replace(
      snapshot.artifacts,
      event.data.artifact as AgentFile,
    );
  return {
    snapshot,
    drafts,
    events:
      event.kind === "answer.delta"
        ? state.events
        : [...state.events, event].slice(-300),
  };
}

