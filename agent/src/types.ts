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
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";
export const ACTIVE: RunStatus[] = ["queued", "running", "awaiting_approval"];
export interface User {
  identity?: "device" | "official" | "legacy";
  official_account?: { id: number; username: string };
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
export interface MessageAttachment {
  artifact_id: string;
  name: string;
  mime: string;
}
export interface Message {
  /** 编辑重发后的旧分支保留本地，但不进入当前对话与模型上下文。 */
  superseded_by?: string;
  id: string;
  conversation_id: string;
  run_id: string | null;
  role: "user" | "assistant" | "tool";
  content: string;
  attachments?: MessageAttachment[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Responses 的不透明续答状态，仅在服务内部保存，不发往界面。 */
  response_items?: Record<string, unknown>[];
  created_at: string;
}
export type PermissionMode = "default" | "full-access";
/** 项目工作区的文件效果权限；与本轮是否开启完全访问分开。 */
export type WorkspaceAccess = "read-only" | "workspace-write";
export interface LocalWorkspace {
  id: string;
  user_id: number;
  name: string;
  /** 用户选择时的路径；只给本机 UI，不进入模型工具结果。 */
  root_path: string;
  /** realpath 校验后的规范路径，用于检测目录移动或重定向。 */
  canonical_path: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
}
export interface ProjectEditFile {
  path: string;
  operation: "create" | "update";
  before_sha256: string | null;
  after_sha256: string;
  before_bytes: number;
  after_bytes: number;
  backup_path: string | null;
}
export interface ProjectEdit {
  id: string;
  conversation_id: string;
  user_id: number;
  run_id: string | null;
  reason: string;
  status: "applied" | "undone";
  files: ProjectEditFile[];
  created_at: string;
  undone_at?: string;
}
export interface WorkspaceContext {
  sessionRoot: string;
  projectRoot: string | null;
  projectId: string | null;
  projectName: string | null;
  projectAccess: WorkspaceAccess | null;
  commandRoot: string;
}
export type ReasoningEffort = "auto" | "low" | "medium" | "high";
export interface RunOptions { resume_edit?: import("./resume-fields.js").ResumeEditRequest; replaces_message_id?: string; permission_mode?: PermissionMode; reasoning_effort?: ReasoningEffort; full_access_confirmed?: boolean; obligation_id?: string; attachment_ids?: string[]; }
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
  /** 绑定的本机项目登记；删除对话只解除引用，不删除项目目录。 */
  workspace_id?: string | null;
  workspace_access?: WorkspaceAccess;
  created_at: string;
  updated_at: string;
}
export interface Run {
  resume_edit?: import("./resume-fields.js").ResumeEditRequest;
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
  attachment_ids?: string[];
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
  /** 这次运行主动接手的跨运行待办；只有成功完成才会将其标记为 fulfilled。 */
  obligation_id?: string;
  /** 本轮最近一次持久检查点；只指向执行现场，不替代事件审计。 */
  checkpoint_id?: string;
  checkpoint_step?: number;
  /** 由预算暂停后创建的续接运行；原运行仍保留完整审计。 */
  parent_run_id?: string;
  continuation_count?: number;
  total_steps?: number;
  continuation_run_id?: string;
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
export type ToolExecutionStatus = "started" | "succeeded" | "failed" | "waiting" | "uncertain";
export interface ToolExecution {
  call_id: string;
  run_id: string;
  conversation_id: string;
  user_id: number;
  name: string;
  arguments_hash: string;
  status: ToolExecutionStatus;
  result?: unknown;
  error?: string;
  created_at: string;
  updated_at: string;
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
  /** 官方服务内部路由标识；自定义模型不会依赖该字段。 */
  routingCapability?: string;
  onNotice?: (message: string) => void;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    images?: Array<{ url: string }>;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    response_items?: Record<string, unknown>[];
  }>;
  tools: ToolDefinition[];
  signal: AbortSignal;
  onDelta?: (text: string) => void;
  /** 累积的工具参数快照，仅用于预览；完成和校验前不会执行。 */
  onToolDelta?: (call: ToolCall) => void;
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
export interface SandboxExecutionOptions {
  /** 本机项目根；仅用于沙箱挂载和权限判断，不作为模型业务数据返回。 */
  projectRoot?: string | null;
  sessionRoot?: string;
  workspaceAccess?: WorkspaceAccess | null;
  /** 命令产生输出时按 stdout/stderr 分片通知运行记录；不改变最终结果。 */
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
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
  commandContext?(workspace: string, options?: SandboxExecutionOptions): string;
  execute(
    command: string,
    workspace: string,
    signal: AbortSignal,
    options?: SandboxExecutionOptions,
  ): Promise<SandboxResult>;
}
