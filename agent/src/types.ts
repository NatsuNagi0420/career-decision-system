/** 青穗集 · Agent 运行契约：模型、工具、事件和状态分离，不把计划当执行结果。 */
export type WireApiKind = "chat-completions" | "responses";
export type ApiKind = "auto" | WireApiKind;
export interface DiscoveredModel {
  id: string;
  label?: string;
}
export interface ModelDiscovery {
  base_url: string;
  models: DiscoveredModel[];
  note: string;
}
export interface ConnectionCheck {
  stage: "chat" | "stream" | "tools";
  protocol: WireApiKind;
  ok: boolean;
  note: string;
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
export const ACTIVE: RunStatus[] = ["queued", "running", "awaiting_approval"];
export interface User {
  id: number;
  username: string;
  external_ai_consent: boolean;
}
export interface Profile {
  id: string;
  user_id: number;
  name: string;
  mode: "official" | "custom";
  api_kind: ApiKind;
  resolved_api_kind?: WireApiKind;
  base_url: string;
  model: string;
  /** 官方服务的界面名称；不能替代请求中的真实模型 ID。 */
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
    checks?: ConnectionCheck[];
  };
  updated_at: string;
}
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}
export interface Message {
  /** 编辑重发后的旧分支保留本地，但不进入当前对话与模型上下文。 */
  superseded_by?: string;
  id: string;
  conversation_id: string;
  run_id: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Responses 的不透明续答状态，仅在服务内部保存，不发往界面。 */
  response_items?: Record<string, unknown>[];
  created_at: string;
}
export type PermissionMode = "default" | "full-access";
export type ReasoningEffort = "auto" | "low" | "medium" | "high";
export interface RunOptions { replaces_message_id?: string; permission_mode?: PermissionMode; reasoning_effort?: ReasoningEffort; full_access_confirmed?: boolean; }
export interface Conversation {
  guidance?: import("./guidance-contract.js").GuidanceState;
  /** 仅用于兼容旧版专用对话；新对话在同一主线内使用职业与简历工具。 */
  mode?: "resume";
  title_manual?: boolean;
  archived?: boolean;
  id: string;
  user_id: number;
  title: string;
  profile_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface Run {
  /** 结构化失败原因；主界面使用友好提示，技术详情仍保留。 */
  error_code?: string;
  can_retry?: boolean;
  retry_count?: number;
  retry_request_id?: string;
  superseded_by?: string;
  replaces_message_id?: string;
  task_kind?: import("./guidance-contract.js").TaskKind;
  task_id?: string;
  permission_mode?: PermissionMode;
  reasoning_effort?: ReasoningEffort;
  id: string;
  conversation_id: string;
  user_id: number;
  profile_id: string;
  request_id: string;
  input: string;
  status: RunStatus;
  steps: number;
  input_tokens: number;
  output_tokens: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  /** 只累计执行时间，等待用户确认不占执行预算。 */
  elapsed_ms?: number;
  /** 已计入的输出预算；供应商不报用量时按本次最大输出保守计入。 */
  output_budget_used?: number;
}
export interface AgentEvent {
  seq: number;
  conversation_id: string;
  run_id: string | null;
  kind: string;
  data: Record<string, unknown>;
  created_at: string;
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
export interface Approval {
  id: string;
  run_id: string | null;
  conversation_id: string;
  user_id: number;
  artifact_id: string;
  sha256: string;
  tool_call_id: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  expires_at: string;
  created_at: string;
}
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface ModelReply {
  /** 网关将流式请求降为 JSON 时为 false；测试替身可省略。 */
  streamed?: boolean;
  text: string;
  tool_calls: ToolCall[];
  input_tokens: number;
  output_tokens: number;
  finish_reason: string;
  response_items?: Record<string, unknown>[];
}
export interface ModelRequest {
  reasoningEffort?: ReasoningEffort;
  onNotice?: (message: string) => void;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    response_items?: Record<string, unknown>[];
  }>;
  tools: ToolDefinition[];
  signal: AbortSignal;
  onDelta?: (text: string) => void;
  forceTool?: string;
  stream?: boolean;
  maxOutputTokens?: number;
}
export interface Model {
  complete(request: ModelRequest): Promise<ModelReply>;
}
export interface SandboxResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  duration_ms: number;
}
export interface SandboxHealth {
  available: boolean;
  provider: "docker" | "windows-native" | "local-full-access";
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
}
export interface Sandbox {
  health(recheck?: boolean): Promise<SandboxHealth>;
  commandContext?(workspace: string): string;
  execute(
    command: string,
    workspace: string,
    signal: AbortSignal,
  ): Promise<SandboxResult>;
}
