/** 青穗集 · TypeScript Agent 前端协议：只接收公开配置，永不包含模型密钥。 */
export interface AgentUser {
  id: number;
  username: string;
  external_ai_consent: boolean;
}
export type ModelProtocol = "auto" | "chat-completions" | "responses";
export interface DiscoveredModel {
  id: string;
  label?: string;
}
export interface ModelDiscovery {
  base_url: string;
  models: DiscoveredModel[];
  note: string;
}
export interface ModelDiscoveryInput {
  base_url: string;
  api_key?: string;
  profile_id?: string;
  allow_local: boolean;
}
export interface ModelProfile {
  resolved_api_kind?: Exclude<ModelProtocol, "auto">;
  id: string;
  name: string;
  mode: "official" | "custom";
  api_kind: ModelProtocol;
  base_url: string;
  model: string;
  /** 仅用于展示；实际模型请求仍由后端使用 model。 */
  display_name?: string;
  allow_local: boolean;
  remember_key: boolean;
  has_key: boolean;
  capabilities: {
    chat: boolean;
    tools: boolean;
    stream: boolean;
    tested_at: string | null;
    note: string;
    checks?: {
      stage: "chat" | "stream" | "tools";
      protocol: Exclude<ModelProtocol, "auto">;
      ok: boolean;
      note: string;
    }[];
  };
}
export interface ModelInput {
  name: string;
  mode: "official" | "custom";
  api_kind: ModelProtocol;
  base_url: string;
  model: string;
  api_key?: string;
  allow_local: boolean;
  remember_key: boolean;
}
export type PermissionMode = "default" | "full-access";
export type ReasoningEffort = "auto" | "low" | "medium" | "high";
export interface RunOptions { replaces_message_id?: string; permission_mode: PermissionMode; reasoning_effort: ReasoningEffort; full_access_confirmed: boolean; }
export interface Conversation {
  guidance?: import("../../../agent/src/guidance-contract").GuidanceState;
  /** 仅用于兼容旧版专用对话；新对话在同一主线内使用职业与简历工具。 */
  mode?: "resume";
  title_manual?: boolean;
  archived?: boolean;
  id: string;
  title: string;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
export interface ChatMessage {
  id: string;
  run_id: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  created_at: string;
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
  error_code?: string;
  can_retry?: boolean;
  retry_count?: number;
  permission_mode?: PermissionMode;
  reasoning_effort?: ReasoningEffort;
  id: string;
  status: RunStatus;
  steps: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  created_at: string;
  updated_at: string;
}
export interface AgentFile {
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
export interface FilePreview {
  artifact: AgentFile;
  preview_kind: "markdown" | "text" | "json" | "csv" | "html" | "image" | "pdf" | "unsupported";
  mime: string;
  content: string;
  truncated: boolean;
}
export interface AgentApproval {
  id: string;
  run_id: string | null;
  artifact_id: string;
  status: "pending" | "approved" | "rejected" | "expired";
  expires_at: string;
}
export interface AgentEvent {
  seq: number;
  run_id: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
}
export interface Snapshot {
  guidance?: import("../../../agent/src/guidance-contract").GuidanceView;
  conversation: Conversation;
  messages: ChatMessage[];
  runs: AgentRun[];
  artifacts: AgentFile[];
  approvals: AgentApproval[];
  last_seq: number;
  events?: AgentEvent[];
  drafts?: Record<string, string>;
}
export interface AgentInfo {
  deployment_mode?: "local" | "server";
  local_file_actions?: boolean;
  runtime: string;
  official_configured: boolean;
  persistent_secrets_supported: boolean;
  file_workspace: {
    available: boolean;
    message: string;
    supported_extensions: string[];
    max_file_bytes: number;
  };
  sandbox: {
    available: boolean;
    provider: string;
    message: string;
    image: string;
    isolation_tested: boolean;
    shell?: string;
    isolation?: "container" | "write-restricted";
    read_isolated?: boolean;
    network_isolated?: boolean;
    resource_limits?: boolean;
    checked_at?: string;
    tested_checks?: string[];
  };
  limits: {
    steps: number;
    run_timeout_ms: number;
    max_run_output_tokens: number;
  };
}
export const isActive = (run: AgentRun | undefined) =>
  Boolean(
    run && ["queued", "running", "awaiting_approval"].includes(run.status),
  );
export const STATUS_LABEL: Record<RunStatus, string> = {
  queued: "准备开始",
  running: "正在处理",
  awaiting_approval: "等待你确认",
  waiting_input: "等待你补充",
  completed: "本轮回复结束",
  failed: "本轮未完成",
  cancelled: "已停止",
  interrupted: "运行曾被中断",
};
