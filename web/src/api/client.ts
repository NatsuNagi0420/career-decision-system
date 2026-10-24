/**
 * 青穗集 · 统一 API 与进度流：登录鉴权、断线续传与明确中断反馈，不把传输结束当作任务完成。
 *
 * EventSource cannot send an Authorization header, so the stream is read over
 * fetch and parsed by hand. Reconnect resumes from the last seq actually applied,
 * which is why `reduceFrame` has to be idempotent.
 */

import type { Frame } from "../state/frames";

const TOKEN_KEY = "career.session.token";

export interface SessionUser {
  id: number;
  username: string;
  external_ai_consent: boolean;
}

export interface ProfileFact {
  id: string;
  dimension: string;
  statement: string;
  source: string;
  created_at: string;
}

export interface PersonalProfile {
  version: number;
  school: string;
  major: string;
  graduation_year: number | null;
  city_targets: string[];
  summary: string;
  updated_at: string | null;
  facts: ProfileFact[];
}

export type ProfileInput = Pick<PersonalProfile, "school" | "major" | "graduation_year" | "city_targets" | "summary"> & { expected_version: number };
export type ProfileFactInput = Pick<ProfileFact, "dimension" | "statement"> & { expected_version: number };

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

/**
 * A dead token has to end up back at the door, not on an empty shell. The shell used to
 * decide "signed in" from the mere presence of a stored token, so after a session row
 * disappeared every call 401ed and the page rendered a 390-character nothing.
 */
let onExpired: (() => void) | null = null;

export function onUnauthorized(handler: (() => void) | null): void {
  onExpired = handler;
}

const CREDENTIAL_PATHS = ["/api/v1/auth/login", "/api/v1/auth/register"];

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = tokenStore.get();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (!response.ok) {
    const dead = response.status === 401 && !CREDENTIAL_PATHS.some((p) => path.startsWith(p));
    if (dead) {
      tokenStore.clear();
      onExpired?.();
    }
    throw new ApiError(response.status, await describe(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function describe(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `${response.status}`;
  } catch {
    return `${response.status}`;
  }
}

/** Written by the browser, never by the server: it is what makes a second click on the
 *  same button land as one row. Generated once per card, so retrying still is one write. */
export function newRequestId(): string {
  return crypto.randomUUID?.() ?? `req-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export interface SessionResponse {
  token: string;
  user: { id: number; username: string; external_ai_consent: boolean };
}

export const api = {
  register: (username: string, password: string, consent: boolean) =>
    request<SessionResponse>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, external_ai_consent: consent }),
    }),
  login: (username: string, password: string) =>
    request<SessionResponse>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  setConsent: (granted: boolean) =>
    request<{ external_ai_consent: boolean }>("/api/v1/auth/ai-consent", { method: "POST", body: JSON.stringify({ granted }) }),
  capabilities: () => request<Capability[]>("/api/v1/capabilities"),
  me: () => request<SessionUser>("/api/v1/auth/me"),
  profile: (signal?: AbortSignal) => request<PersonalProfile>("/api/v1/profile", { signal }),
  updateProfile: (input: ProfileInput) => request<PersonalProfile>("/api/v1/profile", { method: "PUT", body: JSON.stringify(input) }),
  addProfileFact: (input: ProfileFactInput) => request<PersonalProfile>("/api/v1/profile/facts", { method: "POST", body: JSON.stringify(input) }),
  updateProfileFact: (id: string, input: ProfileFactInput) =>
    request<PersonalProfile>(`/api/v1/profile/facts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
  retractProfileFact: (id: string, version: number) =>
    request<PersonalProfile>(`/api/v1/profile/facts/${encodeURIComponent(id)}?expected_version=${version}`, { method: "DELETE" }),
  feed: () => request<Feed>("/api/v1/feed"),
  continuation: () => request<Continuation>("/api/v1/continuations"),
  abandonObligation: (obligationId: string) =>
    request<ObligationEntry>(`/api/v1/obligations/${obligationId}/abandon`, { method: "POST" }),
  createRun: (input: RunInput) =>
    request<{ run_id: string; thread_id: string; status: string }>("/api/v1/runs", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  snapshot: (runId: string) => request<Snapshot>(`/api/v1/runs/${runId}`),
  /** The person's own account of what they did. No approval gate here: the gate
   *  belongs on the archiving write that follows, not on their own words. `requestId`
   *  comes from the caller — one per task card, reused when the same click is retried —
   *  because minting it in here would make every click look like a new statement. */
  submitTaskResult: (taskId: string, body: string, link: string, requestId: string) =>
    request<{ result_id: string; task_id: string; run_id: string | null; duplicate?: boolean }>(
      `/api/v1/tasks/${taskId}/results`,
      {
        method: "POST",
        body: JSON.stringify({
          body,
          link: link || null,
          request_id: requestId,
        }),
      },
    ),
  /** The person closes the week. `weekly_review` is R3, so this is the only door a
   *  draft can become a record through — the agent has none. `input.request_id` is
   *  the card's own, which is what makes a replay come back as `duplicate`. */
  confirmWeeklyReview: (projectId: string, input: WeeklyReviewInput) =>
    request<WeeklyReviewOutcome>(`/api/v1/projects/${projectId}/weekly-review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  /** The matrix as stored, newest round first. Read from `comparison_results`, not from
   *  a run's prose, so a cell shows what spoke for it and against it rather than a
   *  bare score — and the superseded round stays visible. */
  comparison: (projectId: string) => request<ComparisonRound[]>(`/api/v1/projects/${projectId}/comparison`),
  decide: (runId: string, approvalId: string, approved: boolean, feedback: string) =>
    request<{ accepted: boolean }>(`/api/v1/runs/${runId}/approvals/${approvalId}/decision`, {
      method: "POST",
      body: JSON.stringify({ approved, feedback: feedback || null }),
    }),
};

export interface Capability {
  id: string;
  name: string;
  domain: string;
  status: "implemented" | "planned";
  risk_tier: string;
  description: string;
}

export interface RunInput {
  goal: string;
  capability_id: string | null;
  project_id?: string | null;
  /** Set when this run exists to discharge a promise 穗奈 made earlier. */
  obligation_id?: string | null;
}

export interface RunEntry {
  id: string;
  goal: string;
  status: string;
  capability_id: string | null;
  entry_point: string;
  created_at: string | null;
  finished_at: string | null;
  usage: { prompt: number; completion: number; reasoning: number; cached: number };
  error: string | null;
}

export interface ProjectEntry {
  id: string;
  title: string;
  question: string;
  status: string;
  primary_target: string | null;
  candidate_count: number;
  version: number;
  updated_at: string | null;
}

export interface ObligationEntry {
  id: string;
  run_id: string | null;
  project_id: string | null;
  capability_id: string;
  capability_name: string;
  intent: string;
  status: "open" | "claimed" | "fulfilled" | "abandoned";
  trigger_kind: "on_return" | "scheduled";
  not_before: string | null;
  created_at: string | null;
  /** False means it will wait in the list for you rather than start by itself. */
  startable: boolean;
}

export interface ArtifactEntry {
  id: string;
  run_id: string;
  artifact_type: string;
  title: string;
  status: string;
  version: number;
  data_coverage: number | null;
  is_provisional: boolean;
  generation_mode: string;
  content: Record<string, unknown>;
  evidence_quotes: Record<string, string>;
  source_refs: Array<Record<string, unknown>>;
  /** The matrix this one replaced. `version` is an optimistic lock, so this is the only
   *  field that says "the answer moved" rather than "this is the first answer". */
  supersedes_id: string | null;
}

export interface ComparisonCite {
  id: string;
  kind: string;
  statement: string;
  /** The verbatim source text, not a paraphrase of it. */
  quote: string;
  /** Where that sentence came from, already in words a student can read. */
  origin: string;
}

export interface ComparisonCell {
  criterion: string;
  candidate: string;
  verdict: string | null;
  score: number | null;
  note: string;
  for_it: ComparisonCite[];
  against: ComparisonCite[];
}

export interface ComparisonRound {
  round_no: number;
  artifact_id: string | null;
  supersedes_id: string | null;
  conclusion: string;
  is_provisional: boolean;
  created_at: string;
  cells: ComparisonCell[];
}

export interface TaskResultEntry {
  id: string;
  /** Verbatim: this is what an evidence row later quotes. */
  body: string;
  link: string | null;
  at: string;
}

export interface TaskEntry {
  id: string;
  project_id: string;
  plan_id: string;
  title: string;
  expected_output: string;
  week_no: number;
  kind: string;
  status: string;
  due_date: string | null;
  results: TaskResultEntry[];
}

export interface Feed {
  runs: RunEntry[];
  projects: ProjectEntry[];
  artifacts: ArtifactEntry[];
  obligations: ObligationEntry[];
  tasks: TaskEntry[];
  pending_approvals: Array<{ id: string; run_id: string; proposal_id: string; expires_at: string | null }>;
}

export interface Continuation {
  obligation: ObligationEntry | null;
  /** Why nothing is starting on its own. Shown rather than hidden behind silence. */
  reason: "no_due_obligation" | "cooling_down" | null;
}

export type ConfidenceTrend = "up" | "flat" | "down";

/** The body of the week's close, exactly as the endpoint takes it. */
export interface WeeklyReviewInput {
  /** Monday of the week being closed, `YYYY-MM-DD`. */
  week_start: string;
  body: string;
  confidence_trend: ConfidenceTrend;
  confidence_reason: string;
  next_focus: string;
  /** The run whose draft this reacts to. */
  source_run_id?: string;
  request_id: string;
}

export interface WeeklyReviewOutcome {
  review_id: string;
  project_id: string;
  week_start?: string;
  /** The same `request_id` reached the server twice: one row, not two. */
  duplicate?: boolean;
}

export interface Snapshot {
  run: {
    id: string;
    thread_id: string;
    status: string;
    goal: string;
    capability_id: string | null;
    risk_tier: string | null;
    entry_point: string;
    model_used: string | null;
    steps_used: number;
    usage: { prompt: number; completion: number; reasoning: number; cached: number };
    error: string | null;
    created_at: string | null;
    finished_at: string | null;
  };
  pending_approval_id: string | null;
  artifacts: ArtifactEntry[];
  proposals: Array<{
    id: string;
    proposal_type: string;
    title: string;
    rationale: string;
    status: string;
    payload: Record<string, unknown>;
    acceptance_criteria: string[];
    source_refs: Array<Record<string, unknown>>;
    result: Record<string, unknown> | null;
    error: string | null;
  }>;
}

const TERMINAL = new Set(["run_completed", "run_failed"]);

/** The answer while it is still being written. Never a fact, never persisted. */
export interface AnswerDelta {
  kind: "delta";
  run_id: string;
  answer: string;
  reasoning: string;
}

export async function* readRunStream(
  runId: string,
  options: {
    afterSeq?: number;
    signal?: AbortSignal;
    maxReconnects?: number;
    onDelta?: (delta: AnswerDelta) => void;
  } = {},
): AsyncGenerator<Frame> {
  let cursor = options.afterSeq ?? -1;
  let attempts = 0;
  const limit = options.maxReconnects ?? 5;
  let lastError: unknown;

  while (attempts <= limit) {
    let sawTerminal = false;
    try {
      for await (const frame of openStream(runId, cursor, options.signal, options.onDelta)) {
        if (frame.kind === "delta") {
          // No seq of its own: advancing the cursor here would make a reconnect
          // resume from a position that does not exist in the durable log.
          continue;
        }
        cursor = Math.max(cursor, frame.seq);
        if (TERMINAL.has(frame.kind)) {
          sawTerminal = true;
        }
        yield frame;
      }
    } catch (error) {
      if (options.signal?.aborted) return;
      lastError = error;
    }
    if (sawTerminal || options.signal?.aborted) return;
    attempts += 1;
    if (attempts <= limit) await sleep(400 * attempts);
  }
  // Exhaustion is not successful completion: the shell must stop pretending that it
  // is still receiving progress. This is a connection issue, not a failed backend run.
  if (!options.signal?.aborted) {
    const reason = lastError instanceof Error ? `（${lastError.message}）` : "";
    throw new Error(`任务进度连接已中断，请重新打开当前对话核对${reason}`);
  }
}

async function* openStream(
  runId: string,
  afterSeq: number,
  signal?: AbortSignal,
  onDelta?: (delta: AnswerDelta) => void,
): AsyncGenerator<Frame | AnswerDelta> {
  const token = tokenStore.get();
  const response = await fetch(`/api/v1/runs/${runId}/events?after_seq=${afterSeq}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!response.ok || !response.body) {
    throw new ApiError(response.status, await describe(response));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      return;
    }
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (data) {
        const parsed = JSON.parse(data) as Frame | AnswerDelta;
        if (parsed.kind === "delta") {
          onDelta?.(parsed);
        } else {
          yield parsed;
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
