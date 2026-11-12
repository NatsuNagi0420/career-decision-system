/** 青穗集 · 会话和任务视图模型：区分 Hub 任务与电脑镜像运行，保留真实来源和状态。 */
import type { AgentSnapshot, Conversation, HubDevice, RunStatus } from "./api";
export interface TaskItem {
  id: string;
  session_id: string;
  title: string;
  status: RunStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
  local_run_id: string | null;
  controllable: boolean;
  input: string;
  conversation: Conversation;
  cancel_requested?: boolean;
}
export const taskLabels: Record<RunStatus, string> = {
  queued: "排队中",
  waiting_pc: "等待电脑上线",
  running: "正在执行",
  awaiting_approval: "等待确认",
  waiting_input: "等待你补充",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已停止",
  interrupted: "连接中断",
  paused: "已暂停",
};
export function activeStatus(status: RunStatus) {
  return ["queued", "waiting_pc", "running", "awaiting_approval"].includes(
    status,
  );
}
export function attentionStatus(status: RunStatus) {
  return ["awaiting_approval", "waiting_input", "paused"].includes(status);
}
export function tasksFromSnapshot(snapshot: AgentSnapshot): TaskItem[] {
  const linked = new Set(
    (snapshot.tasks ?? []).map((task) => task.local_run_id).filter(Boolean),
  );
  const remote: TaskItem[] = (snapshot.tasks ?? []).map((task) => ({
    id: task.id,
    session_id: snapshot.conversation.id,
    title:
      task.input
        .split("\n")
        .find((line) => line.trim())
        ?.slice(0, 80) || snapshot.conversation.title,
    input: task.input,
    status: task.status,
    error: task.error,
    created_at: task.created_at,
    updated_at: task.updated_at,
    local_run_id: task.local_run_id,
    controllable: true,
    cancel_requested: task.cancel_requested,
    conversation: snapshot.conversation,
  }));
  const local: TaskItem[] = snapshot.runs
    .filter((run) => !linked.has(run.id))
    .map((run) => {
      const input =
        snapshot.messages.find(
          (message) => message.run_id === run.id && message.role === "user",
        )?.content || "";
      return {
        id: run.id,
        session_id: snapshot.conversation.id,
        title:
          input.split("\n")[0]?.slice(0, 80) || snapshot.conversation.title,
        input,
        status: run.status,
        error: run.error,
        created_at: run.created_at,
        updated_at: run.updated_at,
        local_run_id: run.id,
        controllable: false,
        conversation: snapshot.conversation,
      };
    });
  return [...remote, ...local].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}
export function sourceLabel(
  conversation: Pick<Conversation, "target" | "device_id" | "workspace_name">,
  devices: HubDevice[] = [],
) {
  if (conversation.target !== "pc") return "云端";
  const device = devices.find((item) => item.id === conversation.device_id);
  return [device?.name || "电脑", conversation.workspace_name]
    .filter(Boolean)
    .join(" · ");
}
export function formatTime(value?: string, full = false) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (full)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${clock}`;
  if (d.toDateString() === new Date().toDateString()) return clock;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "暂时无法读取，请稍后重试。";
}
export function taskEvents(snapshot: AgentSnapshot, task?: TaskItem | null) {
  return (snapshot.events ?? [])
    .filter((event) => task && event.run_id === task.local_run_id)
    .filter(
      (event) =>
        [
          "tool.call",
          "tool.result",
          "tool.started",
          "tool.completed",
          "tool.start",
          "plan.updated",
          "run.failed",
          "run.completed",
          "approval.requested",
        ].includes(event.type) || event.type.startsWith("tool."),
    );
}
export function eventLabel(event: {
  type: string;
  data: Record<string, unknown>;
}) {
  const d = event.data;
  const name =
    typeof d.name === "string"
      ? d.name
      : typeof d.tool === "string"
        ? d.tool
        : event.type;
  const args = d.arguments ?? d.args ?? d.input;
  const command =
    args && typeof args === "object"
      ? (args as Record<string, unknown>).command
      : undefined;
  return typeof command === "string" ? command : name;
}
