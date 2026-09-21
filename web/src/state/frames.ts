/**
 * Run stream state, as a pure reducer.
 *
 * This is the state machine we took on by not adopting the official streaming hook,
 * so it is deliberately the most tested file in the front end: replayed frames must
 * not duplicate, out-of-order frames must not corrupt the timeline, and provisional
 * / truncated states must survive the round trip to the UI.
 *
 * `items` stays a flat, complete, append-only record — it is the audit trail and the
 * thing the replay tests assert on. `phase` is a *display* axis layered on top: the
 * internal machinery (which node ran, how many tokens it spent) is real and worth
 * keeping, but it is not what a student reads first.
 */
import { formatFailure } from "./failure";

export type FrameKind =
  | "run_started"
  | "step_started"
  | "step_completed"
  | "tool_call"
  | "artifact_created"
  | "proposal_created"
  | "write_withheld"
  | "approval_required"
  | "approval_resolved"
  | "usage_recorded"
  | "obligation_created"
  | "run_completed"
  | "run_failed";

export interface FrameEnvelope {
  run_id: string;
  thread_id: string;
  seq: number;
  event_id: string;
  kind: FrameKind;
  occurred_at: string;
}

export type Frame = FrameEnvelope & Record<string, unknown>;

export interface TimelineItem {
  seq: number;
  eventId: string;
  kind: FrameKind;
  title: string;
  detail?: string;
  tone: "neutral" | "warn" | "bad";
  /** "result" is what the run produced; "trace" is the machinery producing it. */
  phase: "result" | "trace";
  /** Set on the frames belonging to one graph step, so the trace can be folded. */
  stepId?: string;
  /** Lets the thread render the artifact's own prose instead of just its title. */
  artifactId?: string;
  /** The promise this line stands for, so the thread can offer 接着做 / 不用了. */
  obligationId?: string;
  /** The capability a promise points at, so the thread can name what she'll do. */
  capabilityId?: string;
  /** Server timestamp of the event, for the turn's own time label. */
  at?: string;
  /** Tool calls carry these so the trace rail can render a chip without re-reading prose. */
  toolName?: string;
  refCount?: number;
}

export interface TraceGroup {
  stepId: string;
  label: string;
  done: boolean;
  failed: boolean;
  items: TimelineItem[];
  /** From the step's own open and close frames, so the rail can time it honestly. */
  startedAt?: string;
  endedAt?: string;
}

export interface ArtifactView {
  id: string;
  type: string;
  title: string;
  version: number;
  dataCoverage: number | null;
  isProvisional: boolean;
  generationMode: string;
}

export interface ProposalView {
  id: string;
  type: string;
  title: string;
  rationale: string;
  riskTier: string;
  acceptanceCriteria: string[];
  approvalId?: string;
  state: "pending" | "awaiting" | "approved" | "rejected" | "error";
}

export interface PromiseView {
  id: string;
  capabilityId: string;
  intent: string;
  triggerKind: string;
  notBefore: string | null;
}

export interface UsageView {
  model: string;
  thinking: string;
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
}

export interface ShellState {
  status: "idle" | "running" | "awaiting_approval" | "completed" | "failed";
  goal?: string;
  items: TimelineItem[];
  artifacts: ArtifactView[];
  proposals: ProposalView[];
  /** What 穗奈 committed to doing next. Outlives this run — see Obligation. */
  promise: PromiseView | null;
  usage: UsageView | null;
  lastSeq: number;
  errors: string[];
}

export const emptyState: ShellState = {
  status: "idle",
  items: [],
  artifacts: [],
  proposals: [],
  promise: null,
  usage: null,
  lastSeq: -1,
  errors: [],
};

// Graph node names are an implementation detail; a student reading "select_action"
// learns nothing. These are the words for the same events.
const STEP_LABEL: Record<string, string> = {
  select_action: "决定下一步",
  tool_batch: "查资料",
  draft_digest: "整理结论",
};

const TOOL_LABEL: Record<string, string> = {
  get_run_history: "过往运行",
  get_artifact: "已有成果物",
  search_directions: "职业方向目录",
  get_direction_detail: "方向详情",
  get_job_samples: "真实岗位样本",
  get_requirement_items: "岗位要求原句",
  get_profile: "你的画像",
  list_candidates: "项目里的候选",
  get_evidence: "已归档证据",
  compare_candidates: "候选比较",
  estimate_load: "任务量估算",
  get_plan: "现有计划",
};

const str = (frame: Frame, key: string): string => {
  const value = frame[key];
  return typeof value === "string" ? value : "";
};

const num = (frame: Frame, key: string): number | null => {
  const value = frame[key];
  return typeof value === "number" ? value : null;
};

const bool = (frame: Frame, key: string): boolean => frame[key] === true;

const list = (frame: Frame, key: string): string[] => {
  const value = frame[key];
  return Array.isArray(value) ? value.map(String) : [];
};

const item = (
  frame: Frame,
  title: string,
  detail?: string,
  tone: TimelineItem["tone"] = "neutral",
  phase: TimelineItem["phase"] = "result",
  extra?: Partial<TimelineItem>,
): TimelineItem => ({
  seq: frame.seq,
  eventId: frame.event_id,
  kind: frame.kind,
  title,
  detail,
  tone,
  phase,
  at: frame.occurred_at,
  ...extra,
});

const labelForStep = (name: string): string => STEP_LABEL[name] ?? name;

const labelForTool = (name: string): string => TOOL_LABEL[name] ?? name;

export function reduceFrame(state: ShellState, frame: Frame): ShellState {
  // Replay is normal, not exceptional: the server replays committed history to a
  // late subscriber, and a reconnect replays the tail again.
  if (frame.seq <= state.lastSeq) {
    return state;
  }

  const base: ShellState = { ...state, lastSeq: frame.seq };
  const push = (entry: TimelineItem, patch: Partial<ShellState> = {}): ShellState => ({
    ...base,
    items: [...base.items, entry],
    ...patch,
  });

  switch (frame.kind) {
    case "run_started":
      return push(item(frame, "接到目标", str(frame, "goal")), { status: "running", goal: str(frame, "goal") });

    case "step_started":
      // Opened, not announced: a step that started says nothing the reader can use
      // yet, and `groupTrace` needs the label before its frames arrive.
      return push(
        item(frame, labelForStep(str(frame, "name")), undefined, "neutral", "trace", { stepId: str(frame, "step_id") }),
      );

    case "step_completed": {
      const summary = str(frame, "summary");
      if (!summary.startsWith("error")) {
        // Folded into the group's "done" marker rather than shown as a line.
        return push(item(frame, "完成", summary, "neutral", "trace", { stepId: str(frame, "step_id") }));
      }
      return push(item(frame, "这一步失败了", summary, "bad", "trace", { stepId: str(frame, "step_id") }));
    }

    case "tool_call": {
      const truncated = bool(frame, "truncated");
      const refs = Array.isArray(frame.source_refs) ? (frame.source_refs as unknown[]) : [];
      return push(
        item(
          frame,
          `查了「${labelForTool(str(frame, "name"))}」（${refs.length} 条来源）`,
          truncated ? "结果被裁剪，模型看到的是摘要，不是全量" : undefined,
          truncated ? "warn" : "neutral",
          "trace",
          // The rail renders the tool as a chip, so it needs the parts rather than the
          // sentence — parsing back out of prose would break the first time the
          // wording changes.
          { stepId: str(frame, "step_id"), toolName: labelForTool(str(frame, "name")), refCount: refs.length },
        ),
      );
    }

    case "artifact_created": {
      const artifact: ArtifactView = {
        id: str(frame, "artifact_id"),
        type: str(frame, "artifact_type"),
        title: str(frame, "title"),
        version: num(frame, "version") ?? 0,
        dataCoverage: num(frame, "data_coverage"),
        isProvisional: bool(frame, "is_provisional"),
        generationMode: str(frame, "generation_mode"),
      };
      return push(
        item(
          frame,
          `产出成果物 · ${artifact.title}`,
          artifact.isProvisional ? "依据不足，标记为待补证" : undefined,
          artifact.isProvisional ? "warn" : "neutral",
          "result",
          { artifactId: artifact.id },
        ),
        { artifacts: [...state.artifacts.filter((a) => a.id !== artifact.id), artifact] },
      );
    }

    case "proposal_created": {
      const proposal: ProposalView = {
        id: str(frame, "proposal_id"),
        type: str(frame, "proposal_type"),
        title: str(frame, "title"),
        rationale: str(frame, "rationale"),
        riskTier: str(frame, "risk_tier"),
        acceptanceCriteria: list(frame, "acceptance_criteria"),
        state: "pending",
      };
      return push(item(frame, `提议写入 · ${proposal.title}`), {
        proposals: [...state.proposals.filter((p) => p.id !== proposal.id), proposal],
      });
    }

    case "write_withheld":
      // The agent decided it had no basis and withheld the write. This has to be
      // as visible as a proposal, or the absence looks like a bug.
      return push(item(frame, "这次不提供写入", str(frame, "reason") || "依据不足", "warn"));

    case "approval_required": {
      const proposalId = str(frame, "proposal_id");
      return push(item(frame, "等你决定", `在你确认之前，不会有任何业务写入。${expiryNote(str(frame, "expires_at"))}`, "warn"), {
        status: "awaiting_approval",
        proposals: state.proposals.map((p) => (p.id === proposalId ? { ...p, approvalId: str(frame, "approval_id"), state: "awaiting" } : p)),
      });
    }

    case "approval_resolved": {
      const approvalId = str(frame, "approval_id");
      const outcome = str(frame, "status");
      const tone: TimelineItem["tone"] = outcome === "approved" ? "neutral" : outcome === "error" ? "bad" : "warn";
      return push(item(frame, `你的决定：${labelForOutcome(outcome)}`, undefined, tone), {
        proposals: state.proposals.map((p) => (p.approvalId === approvalId ? { ...p, state: mapOutcome(outcome) } : p)),
      });
    }

    case "usage_recorded":
      return push(item(frame, "记录用量", usageText(frame), "neutral", "trace", { stepId: str(frame, "step_id") }), {
        usage: usageOf(frame),
      });

    case "obligation_created": {
      const promise: PromiseView = {
        id: str(frame, "obligation_id"),
        capabilityId: str(frame, "capability_id"),
        intent: str(frame, "intent"),
        triggerKind: str(frame, "trigger_kind") || "on_return",
        notBefore: typeof frame.not_before === "string" ? frame.not_before : null,
      };
      return push(
        item(frame, "穗奈答应了下一步", promise.intent, "neutral", "result", {
          capabilityId: promise.capabilityId,
          obligationId: promise.id,
        }),
        { promise },
      );
    }

    case "run_completed":
      return push(item(frame, `结束 · ${str(frame, "status")}`), { status: str(frame, "status") === "completed" ? "completed" : "failed" });

    case "run_failed":
      // The raw error keeps its stage token in `errors` for whoever debugs the run;
      // what the timeline shows is the same labelled sentence the ribbon uses.
      return push(item(frame, "失败", formatFailure(str(frame, "error"), "这一轮失败了"), "bad"), {
        status: "failed",
        errors: [...state.errors, str(frame, "error")],
      });

    default:
      return base;
  }
}

/**
 * Split the flat audit trail into what a reader acts on and what they may inspect,
 * *in the order it happened*. Folding all the machinery to the top would read like a
 * log dump; interleaving it keeps "she looked, then she concluded" in that order.
 * Pure, so the folding logic is testable without a DOM.
 */
export type ThreadBlock = { type: "item"; item: TimelineItem } | { type: "group"; group: TraceGroup };

export function groupTrace(items: TimelineItem[]): ThreadBlock[] {
  const blocks: ThreadBlock[] = [];
  let open: TraceGroup | null = null;

  for (const entry of items) {
    if (entry.phase !== "trace") {
      open = null;
      blocks.push({ type: "item", item: entry });
      continue;
    }

    const key = entry.stepId || "无归属";
    if (open && open.stepId === key) {
      absorb(open, entry);
      continue;
    }
    open = { stepId: key, label: entry.title, done: false, failed: false, items: [] };
    absorb(open, entry);
    blocks.push({ type: "group", group: open });
  }
  return blocks;
}

function absorb(group: TraceGroup, entry: TimelineItem): void {
  // The open/close lines are the group's own state, not content to read. A clean
  // finish adds nothing; an error must stay legible inside the fold. Their timestamps
  // are kept, though: the rail's per-step duration is measured between these two, and
  // everything in between is a tool or usage line that would collapse to ~0.
  if (entry.title === "完成" || entry.title === "这一步失败了") {
    group.done = true;
    group.endedAt = entry.at;
    group.failed = group.failed || entry.tone === "bad";
    if (entry.tone === "bad") {
      group.items.push(entry);
    }
    return;
  }
  if (entry.kind === "step_started") {
    group.label = entry.title;
    group.startedAt = entry.at;
    return;
  }
  group.items.push(entry);
}

function labelForOutcome(outcome: string): string {
  return { approved: "已采纳并写入", rejected: "已拒绝", timed_out: "已超时", error: "执行失败" }[outcome] ?? outcome;
}

function mapOutcome(outcome: string): ProposalView["state"] {
  if (outcome === "approved") return "approved";
  if (outcome === "rejected") return "rejected";
  if (outcome === "error") return "error";
  return "pending";
}

function usageOf(frame: Frame): UsageView {
  return {
    model: str(frame, "model"),
    thinking: str(frame, "thinking"),
    prompt: num(frame, "prompt") ?? 0,
    completion: num(frame, "completion") ?? 0,
    reasoning: num(frame, "reasoning") ?? 0,
    cached: num(frame, "cached") ?? 0,
  };
}

function usageText(frame: Frame): string {
  const usage = usageOf(frame);
  return `${usage.model} · 输入 ${usage.prompt} / 输出 ${usage.completion}（思考 ${usage.reasoning}，命中缓存 ${usage.cached}）`;
}

/**
 * The confirmation has a fuse: past `expires_at` the server refuses the write and the
 * sweep cancels the run. A deadline nobody states reads as an infinite one, so the
 * first thing a person learns about expiry is that their click failed.
 *
 * Dates leave the server naive-UTC (`utcnow()` strips the offset), and `Date.parse`
 * reads an offset-less timestamp as *local* — without the `Z`, every deadline in a
 * UTC+8 browser would land eight hours early.
 */
export function expiryNote(raw: string): string {
  if (!raw || Number.isNaN(Date.parse(raw))) return "";
  const deadline = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/.test(raw) ? raw : `${raw}Z`);
  const left = deadline - Date.now();
  if (left <= 0) return "这张确认已经过期，点了也不会写入；还需要它的话，再发起一次同样的判断。";
  const hours = left / 3_600_000;
  const remaining = hours < 1 ? "不到 1 小时" : `${Math.floor(hours)} 小时`;
  const when = new Date(deadline).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `有效期到 ${when}（还剩 ${remaining}），过期后自动作废。`;
}
