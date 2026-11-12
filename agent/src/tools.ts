/** 青穗集 · 产品工具装配兼容层：合并通用工具与职业工具，保留现有调用接口。 */
import { z } from "zod";
import { coreToolSpecs } from "./core/tools.js";
import { ToolRegistry } from "./core/tool-registry.js";
import { careerToolSpecs, type CareerToolContext } from "./domain/career/tools.js";
import { resumeProposalInput } from "./resume.js";
import type { CareerWorkspace } from "./career.js";
import type { ResumeWorkspace } from "./resume.js";
import type { ResumeTaskKind } from "./resume-contract.js";
import type { Workspace } from "./files.js";
import type { Sandbox, ToolDefinition, ToolCall, Run, WorkspaceContext } from "./types.js";
import type { AgentToolResult } from "./core/contracts.js";
export const toolRegistry = new ToolRegistry<CareerToolContext>([...careerToolSpecs, ...coreToolSpecs]);
export const toolDefinitions = toolRegistry.definitions();
export function toolDefinitionsFor(sandbox: Sandbox, workspace: string, resumeKind?: ResumeTaskKind, legacyResumeTask = false, pendingId?: string, workspaceContext?: WorkspaceContext): ToolDefinition[] {
  const context = sandbox.commandContext?.(workspaceContext?.commandRoot ?? workspace, workspaceContext ? { sessionRoot: workspaceContext.sessionRoot, projectRoot: workspaceContext.projectRoot, workspaceAccess: workspaceContext.projectAccess } : undefined);
  const projectTools = new Set(["list_project_files", "inspect_project", "read_project_file", "search_project_files", "apply_project_patch", "undo_project_edit"]);
  return toolDefinitions.filter(tool => !projectTools.has(tool.name) || Boolean(workspaceContext?.projectRoot)).filter(tool => !legacyResumeTask || ["read_resume_context", "propose_resume_update", "plan_tasks", "ask_user"].includes(tool.name)).map(tool => {
    if (tool.name === "run_command" && context) return { ...tool, description: context };
    if (tool.name === "propose_resume_update" && resumeKind) {
      const index = { facts: 0, selection: 1, rewrite: 2 }[resumeKind];
      const schema = z.object({ request_id: pendingId ? z.literal(pendingId) : resumeProposalInput.shape.request_id, data: resumeProposalInput.shape.data.options[index] }).strict();
      return { ...tool, parameters: z.toJSONSchema(schema) as Record<string, unknown> };
    }
    return tool;
  });
}
export type ToolResult = AgentToolResult;
export async function executeTool(call: ToolCall, run: Run, workspace: Workspace, sandbox: Sandbox, signal: AbortSignal, career?: CareerWorkspace, resume?: ResumeWorkspace, workspaceContext?: WorkspaceContext, onOutput?: (stream: "stdout" | "stderr", text: string) => void): Promise<ToolResult> {
  signal.throwIfAborted();
  return toolRegistry.execute(call, { run, workspace, sandbox, signal, career, resume, onOutput, workspaceContext: workspaceContext ?? { sessionRoot: "", projectRoot: null, projectId: null, projectName: null, projectAccess: null, commandRoot: "" } });
}
