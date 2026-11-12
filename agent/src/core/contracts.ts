/** 青穗集 · 通用 Agent 与领域适配层契约：运行循环只依赖这些边界，不直接知道职业业务。 */
import type { Workspace } from "../files.js";
import type { CapabilitySpec } from "./capability-registry.js";
import type {
  Artifact,
  Profile,
  Run,
  Sandbox,
  ToolCall,
  ToolDefinition,
  User,
  WorkspaceContext,
} from "../types.js";

export interface AgentToolResult {
  value: unknown;
  complete?: string;
  artifact?: Artifact;
  pause?: "input" | "approval";
  question?: string;
  artifactId?: string;
}

export interface AgentDomainContext {
  run: Run;
  user: User;
  profile: Profile;
  workspace: Workspace;
  workspaceRoot: string;
  workspaceContext: WorkspaceContext;
  sandbox: Sandbox;
}

export interface AgentDomainToolContext extends AgentDomainContext {
  call: ToolCall;
  signal: AbortSignal;
  /** 命令工具的实时 stdout/stderr 分片回调；领域层应原样传给通用沙箱。 */
  onOutput?: (stream: "stdout" | "stderr", text: string) => void;
}

export interface AgentDomainExecutionContext extends AgentDomainToolContext {
  result: AgentToolResult;
}

export interface AgentDomainPreview {
  kind: string;
  data: Record<string, unknown>;
  signature: string;
  minIntervalMs?: number;
}

export interface AgentDomain {
  readonly id: string;

  /** 当前领域实际支持、可对外解释的能力；未声明的能力不会显示为已完成。 */
  capabilities?(): readonly CapabilitySpec[];

  /** 把一次运行归类到能力，用于运行日志、调试和后续承诺追踪。 */
  capabilityId?(run: Run): string | null;

  instructions(context: AgentDomainContext): string[];

  tools(context: AgentDomainContext): ToolDefinition[];

  validateTool(context: AgentDomainToolContext): void;

  executeTool(context: AgentDomainToolContext): Promise<AgentToolResult>;

  afterTool(context: AgentDomainExecutionContext): void;

  previewTool?(context: AgentDomainToolContext): AgentDomainPreview | null;

  memorySummary?(context: AgentDomainContext): string | null;
}
