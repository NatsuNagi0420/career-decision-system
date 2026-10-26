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

export interface ModelProfile {
  id: string;
  name: string;
  mode: "official" | "custom";
  api_kind: "auto" | "chat-completions" | "responses";
  display_name?: string;
  model: string;
  base_url: string;
  has_key: boolean;
  capabilities: {
    chat: boolean;
    tools: boolean;
    stream: boolean;
    tested_at: string | null;
    note: string;
  };
}

export interface Conversation {
  id: string;
  title: string;
  profile_id: string | null;
  archived?: boolean;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
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
}

export interface Artifact {
  id: string;
  conversation_id: string;
  run_id: string | null;
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
}

export interface CareerComparison {
  job_id: string;
  summary: string;
  checks: Array<{ requirement: string; assessment: "supported" | "partial" | "unknown" | "conflict"; reason: string }>;
  confirmed_at: string;
  stale?: boolean;
}

export interface CareerView {
  revision: number;
  context_version: number;
  updated_at: string | null;
  profile: CareerProfile;
  skills?: Array<{ name: string; stage: string; evidence: Array<{ source_id: string; quote: string }> }>;
  jobs: CareerJob[];
  actions: CareerAction[];
  comparisons: CareerComparison[];
  proposals: CareerProposal[];
  sources?: Array<{ id: string; kind: string; text: string }>;
  saved_jobs: Array<{ catalogue_id: string; created_at: string; title: string; company: string; city: string; available: boolean }>;
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

export class AgentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

const API_ORIGIN =
  (import.meta.env.VITE_AGENT_API_ORIGIN as string | undefined) ??
  "http://127.0.0.1:8110";
const TOKEN_KEY = "qingsui.agent.session.token";

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
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return cryptoApi?.randomUUID?.() ?? `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
    if (options.data !== undefined && method !== "GET") header["Content-Type"] = "application/json";
    if (token) header.Authorization = `Bearer ${token}`;

    uni.request({
      ...options,
      url: apiUrl(path),
      header,
      success: response => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data as T);
          return;
        }
        const message = detailFromResponse(response.data, response.statusCode);
        if (response.statusCode === 401) {
          clearToken();
          const pages = getCurrentPages();
          const current = pages.length ? pages[pages.length - 1].route : "";
          if (current !== "pages/auth/index") uni.reLaunch({ url: "/pages/auth/index" });
        }
        reject(new AgentApiError(message, response.statusCode));
      },
      fail: error => {
        reject(new AgentApiError(error.errMsg || "无法连接到 8110 Agent 服务", 0));
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
    return request<{ external_ai_consent: boolean }>("/api/v1/auth/ai-consent", {
      method: "POST",
      data: { granted },
    });
  },
  logout() {
    return request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" });
  },
};

export const agentApi = {
  models() {
    return request<ModelProfile[]>("/api/v1/agent/models");
  },
  testModel(profileId: string) {
    return request<ModelProfile>(`/api/v1/agent/models/${profileId}/test`, { method: "POST", data: {} });
  },
  conversations() {
    return request<Conversation[]>("/api/v1/agent/conversations");
  },
  createConversation(profileId: string | null) {
    return request<Conversation>("/api/v1/agent/conversations", {
      method: "POST",
      data: { profile_id: profileId },
    });
  },
  snapshot(conversationId: string) {
    return request<AgentSnapshot>(`/api/v1/agent/conversations/${conversationId}`);
  },
  importFile(conversationId: string, name: string, base64: string) {
    return request<Artifact>(`/api/v1/agent/conversations/${conversationId}/files`, {
      method: "POST",
      data: { name, base64 },
    });
  },
  updateConversation(conversationId: string, patch: { title?: string; archived?: boolean }) {
    return request<Conversation>(`/api/v1/agent/conversations/${conversationId}`, {
      method: "PATCH" as unknown as UniApp.RequestOptions["method"],
      data: patch,
    });
  },
  deleteConversation(conversationId: string) {
    return request<{ ok: boolean; id: string }>(`/api/v1/agent/conversations/${conversationId}`, {
      method: "DELETE",
    });
  },
  run(
    conversationId: string,
    input: string,
    profileId: string,
    requestId: string,
  ) {
    return request<RunResult>(`/api/v1/agent/conversations/${conversationId}/runs`, {
      method: "POST",
      data: {
        profile_id: profileId,
        input,
        request_id: requestId,
        permission_mode: "default",
        reasoning_effort: "auto",
        full_access_confirmed: false,
      },
    });
  },
};

function querySuffix(entries: Array<[string, string | number | undefined]>): string {
  const values = entries
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return values.length ? `?${values.join("&")}` : "";
}

export const careerApi = {
  view() {
    return request<CareerView>("/api/v1/agent/career");
  },
  directions(query: { query?: string; limit?: number } = {}) {
    const suffix = querySuffix([["query", query.query], ["limit", query.limit]]);
    return request<CareerDirectionResponse>(`/api/v1/agent/career/catalogue/directions${suffix}`);
  },
  jobs(query: { query?: string; directionCode?: string; city?: string; limit?: number } = {}) {
    const suffix = querySuffix([["query", query.query], ["direction_code", query.directionCode], ["city", query.city], ["limit", query.limit]]);
    return request<CatalogueJobsResponse>(`/api/v1/agent/career/catalogue/jobs${suffix}`);
  },
};

export function isActiveRun(run: AgentRun | undefined): boolean {
  return Boolean(run && ["queued", "running", "awaiting_approval"].includes(run.status));
}

export function modelIsReady(model: ModelProfile | undefined): boolean {
  return Boolean(model?.capabilities.chat && model.capabilities.tested_at);
}

export function goToAuth(): void {
  uni.reLaunch({ url: "/pages/auth/index" });
}

/** 保留给旧页面的本地预览备用，不再用于真实对话发送。 */
export function demoReply(input: string): string {
  if (/简历|经历/.test(input)) return "我们先把你真实做过的事整理出来，再决定哪些内容适合写进简历。你最近做过一个什么项目？";
  if (/岗位|工作|实习/.test(input)) return "可以。穗奈会把你的经历和岗位要求放在一起比较，告诉你已经具备什么、下一步补什么。";
  return "我在这里。你可以说说最近想找什么机会，或者哪件事让你最迷茫，我们从那里开始。";
}
