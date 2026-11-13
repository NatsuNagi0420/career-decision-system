/** 青穗集 · TypeScript Agent 前端协议：只接收公开配置，永不包含模型密钥。 */
export interface AgentUser {
  identity?: "device" | "official" | "legacy";
  official_account?: { id: number; username: string };
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
export interface OfficialSession {
  connected: boolean;
  account: { id: number; username: string } | null;
  usage?: { day: string; billing_enabled: boolean; balance_micros: number; held_micros: number; requests: number; input_tokens: number; output_tokens: number; charged_micros: number; images: number } | null;
}
export type PermissionMode = "default" | "full-access";
export type WorkspaceAccess = "read-only" | "workspace-write";
export interface LocalWorkspace {
  id: string;
  user_id: number;
  name: string;
  root_path: string;
  canonical_path: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}
export type ReasoningEffort = "auto" | "low" | "medium" | "high";
export interface RunOptions { resume_edit?: import("../../../agent/src/resume-fields").ResumeEditRequest; replaces_message_id?: string; permission_mode: PermissionMode; reasoning_effort: ReasoningEffort; full_access_confirmed: boolean; obligation_id?: string; attachment_ids?: string[]; }
export interface Conversation {
  sync_origin?: { session_id: string; target: "pc" | "cloud"; device_id: string | null };
  guidance?: import("../../../agent/src/guidance-contract").GuidanceState;
  /** 仅用于兼容旧版专用对话；新对话在同一主线内使用职业与简历工具。 */
  mode?: "resume";
  title_manual?: boolean;
  archived?: boolean;
  id: string;
  title: string;
  profile_id: string | null;
  workspace_id?: string | null;
  workspace_access?: WorkspaceAccess;
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
  attachments?: MessageAttachment[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  created_at: string;
}
export interface MessageAttachment {
  artifact_id: string;
  name: string;
  mime: string;
}
export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_approval"
  | "waiting_input"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export interface AgentRun {
  error_code?: string;
  can_retry?: boolean;
  retry_count?: number;
  checkpoint_id?: string;
  checkpoint_step?: number;
  parent_run_id?: string;
  continuation_count?: number;
  total_steps?: number;
  continuation_run_id?: string;
  permission_mode?: PermissionMode;
  reasoning_effort?: ReasoningEffort;
  attachment_ids?: string[];
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
export type AgentCheckpointStatus = "active" | "paused" | "completed" | "failed";
export interface AgentCheckpoint {
  id: string;
  run_id: string;
  conversation_id: string;
  user_id: number;
  step: number;
  status: AgentCheckpointStatus;
  completed_tool_call_ids: string[];
  pending_tool_call_ids: string[];
  context_signature: string | null;
  parent_id?: string;
  created_at: string;
  updated_at: string;
}
export interface AgentEvent {
  seq: number;
  run_id: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
}
export type ObligationStatus = "open" | "claimed" | "fulfilled" | "abandoned";
export interface AgentObligation {
  id: string;
  user_id: number;
  conversation_id: string;
  source_run_id: string | null;
  capability_id: string;
  intent: string;
  title: string;
  status: ObligationStatus;
  trigger: "guidance_next_step" | "agent_commitment";
  due_at: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
}
export interface Snapshot {
  resume?: import("../../../agent/src/resume-contract").ResumeState;
  plan?: import("../../../agent/src/core/task-memory").AgentTaskPlan | null;
  guidance?: import("../../../agent/src/guidance-contract").GuidanceView;
  obligations?: AgentObligation[];
  conversation: Conversation;
  messages: ChatMessage[];
  runs: AgentRun[];
  artifacts: AgentFile[];
  approvals: AgentApproval[];
  checkpoints?: AgentCheckpoint[];
  last_seq: number;
  events?: AgentEvent[];
  drafts?: Record<string, string>;
}
export interface AgentInfo {
  ui?: import("../../../agent/src/ui-contract").DeploymentUi;
  deployment_mode?: "local" | "server";
  local_file_actions?: boolean;
  runtime: string;
  official_configured: boolean;
  agent_capabilities?: Array<{
    id: string;
    domain: string;
    name: string;
    description: string;
    riskTier: string;
    requiresApproval: boolean;
    evidenceRequired: boolean;
    minDataCoverage: number;
    thinking: "on" | "off";
    maxTokens: number;
    artifactType: string | null;
    requiredContext: string[];
    tools: string[];
    proposalTypes: string[];
    nextCapabilities: string[];
  }>;
  persistent_secrets_supported: boolean;
  file_workspace: {
    available: boolean;
    message: string;
    supported_extensions: string[];
    max_file_bytes: number;
    max_binary_file_bytes?: number;
    project_workspaces?: boolean;
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
    max_total_steps?: number;
    max_task_steps?: number;
    max_continuations?: number;
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
  paused: "已保存进度",
  completed: "本轮回复结束",
  failed: "本轮未完成",
  cancelled: "已停止",
  interrupted: "运行曾被中断",
};
