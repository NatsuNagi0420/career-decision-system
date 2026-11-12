/** 青穗集 · 小程序 Agent API：令牌、模型配置、会话快照与真实任务请求都由此统一管理。 */
export type AgentRole = "user" | "assistant" | "tool";

export interface SessionUser {
  id: number;
  username: string;
  external_ai_consent: boolean;
}

export interface SessionResponse {
  token: string;
  user: SessionUser;
}

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string;
  created_at?: string;
  run_id?: string | null;
}

export interface Conversation {
  id: string;
  title: string;
  profile_id: string | null;
  target?: "pc" | "cloud";
  device_id?: string | null;
  workspace_id?: string | null;
  workspace_name?: string | null;
  workspace_access?: "read-only" | "workspace-write";
  archived?: boolean;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | "waiting_pc"
  | "paused"
  | "queued"
  | "running"
  | "awaiting_approval"
  | "waiting_input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export interface AgentRun {
  id: string;
  status: RunStatus;
  error: string | null;
  steps: number;
  local_run_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentSnapshot {
  conversation: Conversation;
  messages: AgentMessage[];
  runs: AgentRun[];
  drafts?: Record<string, string>;
  artifacts?: Artifact[];
  last_seq: number;
  approvals?: Array<{
    id: string;
    run_id: string;
    status: string;
    reason?: string;
  }>;
  tasks?: HubTask[];
  events?: AgentEvent[];
  resume?: ResumeDocument;
  files?: Artifact[];
}

export interface Artifact {
  id: string;
  conversation_id: string;
  run_id?: string | null;
  session_id?: string;
  name: string;
  path: string;
  bytes: number;
  sha256: string;
  version: number;
  kind: "input" | "output";
  created_at: string;
}

export interface CareerProfile {
  goal: string;
  education: string;
  experience: string;
  skills: string;
  preferences: string;
  weekly_hours: string;
  confirmed_at: string | null;
}

export interface CareerJob {
  id: string;
  title: string;
  company: string;
  url: string;
  description: string;
  created_at: string;
  catalogue?: {
    catalogue_id: string;
    data_kind: "historical" | "collected";
    captured_at: string | null;
    recruitment_status?: "unknown" | "open_explicit" | "closed_explicit";
    record_use?: "recent_sample" | "undated_reference" | "historical_reference";
  };
}

export interface CareerAction {
  id: string;
  title: string;
  job_id: string | null;
  why: string;
  learn: string;
  deliverable: string;
  status: "todo" | "doing" | "done";
  result: string;
  created_at: string;
  updated_at: string;
}

export interface CareerProposal {
  id: string;
  title: string;
  created_at: string;
  conversation_id: string;
  status?: "pending_confirmation" | "applied" | "rejected";
  data?: Record<string, unknown>;
  stale?: boolean;
  stale_reason?: string;
  catalogue_sample?: { title?: string };
}

export interface CareerComparison {
  job_id: string;
  summary: string;
  checks: Array<{
    requirement: string;
    assessment: "supported" | "partial" | "unknown" | "conflict";
    reason: string;
  }>;
  confirmed_at: string;
  stale?: boolean;
}

export interface CareerView {
  revision: number;
  context_version: number;
  updated_at: string | null;
  profile: CareerProfile;
  skills?: Array<{
    name: string;
    stage: string;
    evidence: Array<{ source_id: string; quote: string }>;
  }>;
  jobs: CareerJob[];
  actions: CareerAction[];
  comparisons: CareerComparison[];
  proposals: CareerProposal[];
  sources?: Array<{ id: string; kind: string; text: string }>;
  saved_jobs: Array<{
    catalogue_id: string;
    created_at: string;
    title: string;
    company: string;
    city: string;
    available: boolean;
  }>;
}

export interface CareerDirection {
  code: string;
  name: string;
  summary: string;
  common_skills: string[];
  title_rule_sample_count: number;
  collected_sample_count: number;
}

export interface CatalogueJobSample {
  id: string;
  title: string;
  company: string;
  city: string;
  excerpt: string;
  source_url: string;
  data_kind: "historical" | "collected";
  captured_at: string | null;
  published_at: string | null;
  expires_at: string | null;
  recruitment_status: "unknown" | "open_explicit" | "closed_explicit";
  availability: "closed" | "past_deadline" | "unverified";
  reference_notice: string;
  direction_codes: string[];
  work_type?: string;
  audience_clues?: string[];
}

export interface CareerDirectionResponse {
  total: number;
  directions: CareerDirection[];
  coverage_note?: string;
}

export interface CatalogueJobsResponse {
  total: number;
  samples: CatalogueJobSample[];
  filter_notes?: string[];
}

export interface RunResult extends AgentRun {
  request_id?: string;
}

export interface AgentApiError extends Error {
  status: number;
  code?: string;
}

// 使用原生 Error 附带请求信息，避免小程序转译 Error 子类时构造失败。
function apiError(
  message: string,
  status: number,
  code?: string,
): AgentApiError {
  const error = new Error(message) as AgentApiError;
  error.name = "AgentApiError";
  error.status = status;
  error.code = code;
  return error;
}

export function isAgentApiError(error: unknown): error is AgentApiError {
  return (
    error instanceof Error &&
    error.name === "AgentApiError" &&
    typeof (error as AgentApiError).status === "number"
  );
}

export const CAREER_CATALOGUE_LIMITS = { directions: 25, jobs: 5 } as const;

function catalogueLimit(value: number | undefined, maximum: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return Math.min(maximum, Math.max(1, Math.trunc(value)));
}

export const API_ORIGIN =
  (import.meta.env.VITE_AGENT_API_ORIGIN as string | undefined) ??
  "https://agent.suinai.me";
export function apiOriginLabel(): string {
  try {
    const url = new URL(API_ORIGIN);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return API_ORIGIN;
  }
}
const TOKEN_KEY = "qingsui.agent.session.token:" + API_ORIGIN;

export function apiUrl(path: string): string {
  return `${API_ORIGIN.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getToken(): string | null {
  const value = uni.getStorageSync(TOKEN_KEY);
  return typeof value === "string" && value ? value : null;
}

export function setToken(token: string): void {
  uni.setStorageSync(TOKEN_KEY, token);
}

export function clearToken(): void {
  uni.removeStorageSync(TOKEN_KEY);
}

export function hasToken(): boolean {
  return Boolean(getToken());
}

export function newRequestId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  return (
    cryptoApi?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const value = Math.floor(Math.random() * 16);
      return (char === "x" ? value : (value & 3) | 8).toString(16);
    })
  );
}

function detailFromResponse(data: unknown, statusCode: number): string {
  if (typeof data === "object" && data !== null && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return `请求失败（${statusCode}）`;
}

export async function request<T>(
  path: string,
  options: Omit<UniApp.RequestOptions, "url"> = {},
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const token = getToken();
    const header: Record<string, string> = {
      Accept: "application/json",
      ...(options.header as Record<string, string> | undefined),
    };
    const method = String(options.method ?? "GET").toUpperCase();
    if (options.data !== undefined && method !== "GET")
      header["Content-Type"] = "application/json";
    if (token) header.Authorization = `Bearer ${token}`;

    uni.request({
      timeout: 20000,
      ...options,
      url: apiUrl(path),
      header,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }
        const message = detailFromResponse(response.data, response.statusCode);
        if (response.statusCode === 401) {
          clearToken();
          const pages = getCurrentPages();
          const current = pages.length ? pages[pages.length - 1].route : "";
          if (current !== "pages/auth/index")
            uni.reLaunch({ url: "/pages/auth/index" });
        }
        const code = (response.data as { code?: unknown } | null)?.code;
        reject(
          apiError(
            message,
            response.statusCode,
            typeof code === "string" ? code : undefined,
          ),
        );
      },
      fail: (error) => {
        reject(apiError(error.errMsg || "无法连接 Agent 服务", 0));
      },
    });
  });
}

export const authApi = {
  login(username: string, password: string) {
    return request<SessionResponse>("/api/v1/auth/login", {
      method: "POST",
      data: { username, password },
    });
  },
  register(username: string, password: string, externalAiConsent: boolean) {
    return request<SessionResponse>("/api/v1/auth/register", {
      method: "POST",
      data: { username, password, external_ai_consent: externalAiConsent },
    });
  },
  me() {
    return request<SessionUser>("/api/v1/auth/me");
  },
  consent(granted: boolean) {
    return request<{ external_ai_consent: boolean }>(
      "/api/v1/auth/ai-consent",
      {
        method: "POST",
        data: { granted },
      },
    );
  },
  logout() {
    return request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" });
  },
};

export interface HubDevice {
  id: string;
  name: string;
  status: "pending" | "active" | "revoked";
  online: boolean;
  last_seen_at?: string | null;
  revision: number;
  settings: {
    allow_remote: boolean;
    workspace_id: string | null;
    workspace_access: "read-only" | "workspace-write";
    model_source: "official" | "local";
    profile_id: string | null;
    reasoning_effort: "auto" | "low" | "medium" | "high";
    sync_chats: boolean;
  };
  limits: { workspace_ids: string[]; allow_project_write: boolean };
  catalogue: {
    workspaces: Array<{ id: string; name: string }>;
    profiles: Array<{ id: string; name: string; mode: string; ready: boolean }>;
  };
}
let execution: {
  target: "pc" | "cloud";
  device_id: string | null;
  workspace_id: string | null;
} = { target: "cloud", device_id: null, workspace_id: null };
export const hubApi = {
  config: () => request<{ cloud_enabled: boolean }>("/api/v1/hub/config"),
  devices: () => request<HubDevice[]>("/api/v1/hub/devices"),
  confirm: (pairingToken: string) =>
    request<HubDevice>("/api/v1/hub/devices/confirm", {
      method: "POST",
      data: { pairing_token: pairingToken },
    }),
  settings: (device: HubDevice, settings: HubDevice["settings"]) =>
    request<HubDevice>(`/api/v1/hub/devices/${device.id}/settings`, {
      method: "POST",
      data: { settings, revision: device.revision },
    }),
  revoke: (id: string) =>
    request(`/api/v1/hub/devices/${id}`, { method: "DELETE" }),
  cancel: (id: string) =>
    request(`/api/v1/hub/tasks/${id}/cancel`, { method: "POST", data: {} }),
  approve: (id: string, approvalId: string, approved: boolean) =>
    request(`/api/v1/hub/tasks/${id}/approve`, {
      method: "POST",
      data: { approval_id: approvalId, approved },
    }),
  setExecution: (
    target: "pc" | "cloud",
    deviceId: string | null,
    workspaceId: string | null = null,
  ) => {
    execution = { target, device_id: deviceId, workspace_id: workspaceId };
  },
};

export const agentApi = {
  conversations() {
    return request<Conversation[]>("/api/v1/hub/sessions");
  },
  createConversation(_profileId: string | null, selection = execution) {
    return request<Conversation>("/api/v1/hub/sessions", {
      method: "POST",
      data: selection,
    });
  },
  async snapshot(conversationId: string): Promise<AgentSnapshot> {
    const result = await request<AgentSnapshot>(
      `/api/v1/hub/sessions/${conversationId}`,
    );
    const tasks = result.tasks ?? [];
    const messages = [...result.messages];
    for (const task of tasks) {
      const represented = messages.some(
        (message) =>
          message.role === "user" &&
          (message.id === "task-" + task.id ||
            Boolean(task.local_run_id && message.run_id === task.local_run_id)),
      );
      if (!represented)
        messages.push({
          id: "task-" + task.id,
          role: "user",
          content: task.input,
          run_id: task.local_run_id,
          created_at: task.created_at,
        });
    }
    messages.sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || ""),
    );
    return {
      ...result,
      messages,
      tasks,
      artifacts: result.files ?? [],
      runs: result.runs ?? [],
    };
  },
  importFile(conversationId: string, name: string, base64: string) {
    return request<Artifact>(`/api/v1/hub/sessions/${conversationId}/files`, {
      method: "POST",
      data: { name, base64 },
    });
  },
  updateConversation(
    conversationId: string,
    patch: { title?: string; archived?: boolean },
  ) {
    return request<Conversation>(`/api/v1/hub/sessions/${conversationId}`, {
      method: "POST",
      data: patch,
    });
  },
  deleteConversation(conversationId: string) {
    return request<{ ok: boolean; id: string }>(
      `/api/v1/hub/sessions/${conversationId}`,
      { method: "DELETE" },
    );
  },
  run(
    conversationId: string,
    input: string,
    _profileId: string,
    requestId: string,
  ) {
    return request<RunResult>(`/api/v1/hub/sessions/${conversationId}/tasks`, {
      method: "POST",
      data: { input, request_id: requestId },
    });
  },
};

function querySuffix(
  entries: Array<[string, string | number | undefined]>,
): string {
  const values = entries
    .filter(
      (entry): entry is [string, string | number] =>
        entry[1] !== undefined && entry[1] !== "",
    )
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    );
  return values.length ? `?${values.join("&")}` : "";
}

export const careerApi = {
  sources: () => request<{ sources: CareerSource[] }>("/api/v1/hub/career"),
  async view(source?: string) {
    const selected = source || execution.device_id || "cloud";
    if (selected === "cloud")
      return request<CareerView>("/api/v1/agent/career");
    const result = await careerApi.sources();
    return (
      result.sources.find((item) => item.source === selected)?.data ??
      emptyCareerView()
    );
  },
  change: (revision: number, change: Record<string, unknown>) =>
    request<CareerView>("/api/v1/agent/career/changes", {
      method: "POST",
      data: { revision, change },
    }),
  directions(query: { query?: string; limit?: number } = {}) {
    const suffix = querySuffix([
      ["query", query.query],
      [
        "limit",
        catalogueLimit(query.limit, CAREER_CATALOGUE_LIMITS.directions),
      ],
    ]);
    return request<CareerDirectionResponse>(
      `/api/v1/agent/career/catalogue/directions${suffix}`,
    );
  },
  jobs(
    query: {
      query?: string;
      directionCode?: string;
      city?: string;
      limit?: number;
    } = {},
  ) {
    const suffix = querySuffix([
      ["query", query.query],
      ["direction_code", query.directionCode],
      ["city", query.city],
      ["limit", catalogueLimit(query.limit, CAREER_CATALOGUE_LIMITS.jobs)],
    ]);
    return request<CatalogueJobsResponse>(
      `/api/v1/agent/career/catalogue/jobs${suffix}`,
    );
  },
};

export function isActiveRun(
  run: Pick<AgentRun, "status"> | undefined,
): boolean {
  return Boolean(
    run &&
      ["queued", "waiting_pc", "running", "awaiting_approval"].includes(
        run.status,
      ),
  );
}

export function goToAuth(): void {
  uni.reLaunch({ url: "/pages/auth/index" });
}

/** 同步资料保留来源；手机不将电脑画像静默写进云端画像。 */
export interface CareerSource {
  source: string;
  data: CareerView;
  updated_at: string;
}
export interface HubTask extends Omit<AgentRun, "steps"> {
  steps?: number;
  session_id: string;
  input: string;
  target: "pc" | "cloud";
  device_id: string | null;
  local_run_id: string | null;
  cancel_requested?: boolean;
}
export interface AgentEvent {
  id?: string;
  seq?: number;
  run_id?: string;
  type: string;
  data: Record<string, unknown>;
  created_at?: string;
}
export interface ResumeDocument {
  revision: number;
  updated_at: string | null;
  header: { name: string; headline: string; contact: string };
  target?: { title: string; company: string; description: string };
  body: {
    summary: { text: string };
    sections: Array<{
      kind: string;
      entries: Array<{
        title: string;
        subtitle: string;
        period: string;
        bullets: string[];
      }>;
    }>;
  } | null;
  questions?: string[];
}
export interface OfficialCredits {
  enabled: boolean;
  summary: {
    daily_points: number;
    remaining_points: number;
    used_points: number;
    reserved_points: number;
    resets_at: string;
  };
  entries: Array<{
    id: string;
    created_at: string;
    capability: string;
    state: string;
    points: number;
    reserved_points: number;
  }>;
  next_cursor: string | null;
}
export const accountApi = {
  credits: (cursor?: string) =>
    request<OfficialCredits>(
      "/api/v1/agent/official/credits" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    ),
};
export function emptyCareerView(): CareerView {
  return {
    revision: 0,
    context_version: 0,
    updated_at: null,
    profile: {
      goal: "",
      education: "",
      experience: "",
      skills: "",
      preferences: "",
      weekly_hours: "",
      confirmed_at: null,
    },
    jobs: [],
    actions: [],
    comparisons: [],
    proposals: [],
    saved_jobs: [],
    sources: [],
    skills: [],
  };
}
