/**
 * Minimal API client plus the SSE reader.
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

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

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
}

export interface Feed {
  runs: RunEntry[];
  projects: ProjectEntry[];
  artifacts: ArtifactEntry[];
  obligations: ObligationEntry[];
  pending_approvals: Array<{ id: string; run_id: string; proposal_id: string; expires_at: string | null }>;
}

export interface Continuation {
  obligation: ObligationEntry | null;
  /** Why nothing is starting on its own. Shown rather than hidden behind silence. */
  reason: "no_due_obligation" | "cooling_down" | null;
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
      if (options.signal?.aborted) {
        return;
      }
    }
    if (sawTerminal || options.signal?.aborted) {
      return;
    }
    attempts += 1;
    await sleep(400 * attempts);
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
