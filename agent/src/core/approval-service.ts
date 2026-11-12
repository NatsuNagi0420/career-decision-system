/** 青穗集 · Agent 审批服务：导出确认绑定不可变成果版本，并安全续接等待中的运行。 */
import { id, now, type Store } from "../store.js";
import { invariant } from "../errors.js";
import type { Workspace } from "../files.js";
import type { Approval, Run, ToolCall, User } from "../types.js";
import type { AppendAgentEvent } from "./context-manager.js";
import type { CreateAgentMessage } from "./agent-loop.js";

export interface AgentApprovalHost {
  readonly store: Store;
  readonly workspace: Workspace;
  event: AppendAgentEvent;
  message: CreateAgentMessage;
  waitForRun(runId: string): Promise<void> | undefined;
  launch(run: Run, user: User): void;
}

export class AgentApprovalService {
  constructor(private readonly host: AgentApprovalHost) {}

  async requestExport(
    user: User,
    artifactId: string,
    run: Run | null = null,
    call: ToolCall | null = null,
  ) {
    const artifact = this.host.store.artifact(user.id, artifactId);
    if (run)
      invariant(
        artifact.conversation_id === run.conversation_id,
        403,
        "不能导出其他对话的文件。",
      );
    await this.host.workspace.artifactBytes(artifact);
    this.host.store.conversation(user.id, artifact.conversation_id);
    if (run)
      invariant(
        this.host.store.run(user.id, run.id).status !== "cancelled",
        409,
        "任务已经停止。",
      );
    const approval: Approval = {
      id: id(),
      run_id: run?.id ?? null,
      conversation_id: artifact.conversation_id,
      user_id: user.id,
      artifact_id: artifactId,
      sha256: artifact.sha256,
      tool_call_id: call?.id ?? null,
      status: "pending",
      created_at: now(),
      expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
    };
    this.host.store.saveApproval(approval);
    this.host.event(artifact.conversation_id, run?.id ?? null, "approval.updated", { approval });
    return approval;
  }

  async decide(user: User, approvalId: string, approved: boolean) {
    let approval = this.host.store.approval(user.id, approvalId);
    if (approval.status !== "pending") {
      invariant(
        approval.status === (approved ? "approved" : "rejected"),
        409,
        "这次确认已处理，不能改写原决定。",
      );
      return approval;
    }
    const artifact = this.host.store.artifact(user.id, approval.artifact_id);
    if (approved) {
      await this.host.workspace.artifactBytes(artifact);
      invariant(
        artifact.sha256 === approval.sha256,
        409,
        "文件版本变化，已阻止导出。",
      );
    }
    approval = this.host.store.approval(user.id, approvalId);
    invariant(approval.status === "pending", 409, "这次确认已由另一请求处理。");
    if (approval.run_id)
      invariant(
        this.host.store.run(user.id, approval.run_id).status === "awaiting_approval",
        409,
        "任务已经停止或离开确认阶段。",
      );
    const expired = approval.expires_at < now();
    approval.status = expired ? "expired" : approved ? "approved" : "rejected";
    this.host.store.saveApproval(approval);
    this.host.event(approval.conversation_id, approval.run_id, "approval.updated", { approval });
    if (approval.tool_call_id) {
      const receipt = this.host.store.toolExecution(user.id, approval.tool_call_id);
      if (receipt && receipt.status === "waiting") {
        receipt.status = approval.status === "approved" ? "succeeded" : "failed";
        receipt.result = { artifact_id: artifact.id, approval_status: approval.status };
        receipt.error = approval.status === "approved" ? undefined : expired ? "确认超时，未导出。" : "用户拒绝导出。";
        receipt.updated_at = now();
        this.host.store.saveToolExecution(receipt);
      }
    }
    if (approval.run_id) {
      const run = this.host.store.run(user.id, approval.run_id);
      invariant(
        run.status === "awaiting_approval",
        409,
        "任务已经停止或离开确认阶段。",
      );
      const message = this.host.message(
        run.conversation_id,
        run.id,
        "tool",
        JSON.stringify({
          ok: approval.status === "approved",
          export_ready: approval.status === "approved",
          artifact_id: artifact.id,
          message:
            approval.status === "approved"
              ? "用户已批准此版本，下载入口已准备；不能声称已经写入用户电脑。"
              : expired
                ? "确认超时，未导出。"
                : "用户拒绝导出，不得绕过。",
        }),
        { tool_call_id: approval.tool_call_id ?? undefined },
      );
      this.host.event(run.conversation_id, run.id, "message.added", { message });
      this.host.event(run.conversation_id, run.id, "tool.finished", {
        call_id: approval.tool_call_id,
        name: "request_export",
        ok: approval.status === "approved",
        result: { approval_status: approval.status, artifact_id: artifact.id },
      });
      this.host.store.setStatus(run, "queued");
      this.host.event(run.conversation_id, run.id, "run.status", { run });
      await this.host.waitForRun(run.id);
      const resumed = this.host.store.run(user.id, run.id);
      if (resumed.status === "queued") this.host.launch(resumed, user);
    }
    return approval;
  }
}
