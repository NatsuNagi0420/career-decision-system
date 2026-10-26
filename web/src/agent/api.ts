/** 青穗集 · 新 Agent API：统一鉴权、可恢复 SSE 与经确认的文件下载，不保存模型 Key。 */
import { tokenStore } from "../api/client";
import type { CareerChange, CareerState } from "./career";
import type { ResumeChange, ResumeState } from "../../../agent/src/resume-contract";
import type { GuidanceView, TaskKind } from "../../../agent/src/guidance-contract";
import type {
  AgentApproval,
  AgentFile,
  AgentInfo,
  AgentRun,
  AgentUser,
  Conversation,
  ModelDiscovery,
  ModelDiscoveryInput,
  ModelInput,
  ModelProfile,
  Snapshot,
  AgentEvent,
  RunOptions,
  FilePreview,
} from "./types";
const BASE = "/api/v1/agent";
export class AgentApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = "AgentApiError"; }
}
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const token = tokenStore.get();
  if (token) headers.set("Authorization", "Bearer " + token);
  const response = await fetch(url, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401) {
      tokenStore.clear();
      window.dispatchEvent(new Event("agent:unauthorized"));
    }
    let detail = "请求未完成，请稍后重试。", code: string | undefined;
    try {
      const body = await response.json() as { detail?: string; code?: string };
      detail = body.detail ?? detail; code = body.code;
    } catch {}
    throw new AgentApiError(detail, response.status, code);
  }
  return response.json() as Promise<T>;
}
export const agentApi = {
  changeTask: (id: string, revision: number, kind: TaskKind | null, reuse_shared_resume = false) => request<GuidanceView>(BASE + "/conversations/" + id + "/task", { method: "POST", body: JSON.stringify({ revision, kind, reuse_shared_resume }) }),
  analyzeConversation: (id: string, profile_id: string, message_id: string, signal?: AbortSignal) => request<GuidanceView>(BASE + "/conversations/" + id + "/insights", { method: "POST", body: JSON.stringify({ profile_id, message_id }), signal }),
  resume: (signal?: AbortSignal) => request<ResumeState>(BASE + "/resume", { signal }),
  changeResume: (revision: number, change: ResumeChange, conversation_id?: string | null) => request<ResumeState>(BASE + "/resume/changes", { method: "POST", body: JSON.stringify({ revision, change, ...(conversation_id ? { conversation_id } : {}) }) }),
  exportResume: (revision: number, conversation_id: string, template_id: string = "one-page") => request<{ artifacts: AgentFile[] }>(BASE + "/resume/export", { method: "POST", body: JSON.stringify({ revision, conversation_id, template_id }) }),
  catalogueJob: (id: string, signal?: AbortSignal) => request<import("./job-cards").JobDetail>(BASE + "/career/catalogue/jobs/" + encodeURIComponent(id), { signal }),
  career: (signal?: AbortSignal) => request<CareerState>(BASE + "/career", { signal }),
  changeCareer: (revision: number, change: CareerChange) => request<CareerState>(BASE + "/career/changes", { method: "POST", body: JSON.stringify({ revision, change }) }),
  me: () => request<AgentUser>("/api/v1/auth/me"),
  logout: () =>
    request<{ ok: boolean }>("/api/v1/auth/logout", { method: "POST" }),
  consent: (granted: boolean) =>
    request<{ external_ai_consent: boolean }>("/api/v1/auth/ai-consent", {
      method: "POST",
      body: JSON.stringify({ granted }),
    }),
  info: () => request<AgentInfo>(BASE + "/info"),
  discoverModels: (input: ModelDiscoveryInput) =>
    request<ModelDiscovery>(BASE + "/models/discover", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  profiles: () => request<ModelProfile[]>(BASE + "/models"),
  saveProfile: (input: ModelInput, id?: string) =>
    request<ModelProfile>(BASE + "/models" + (id ? "/" + id : ""), {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(input),
    }),
  testProfile: (id: string) =>
    request<ModelProfile>(BASE + "/models/" + id + "/test", { method: "POST" }),
  deleteProfile: (id: string) =>
    request<{ ok: boolean }>(BASE + "/models/" + id, { method: "DELETE" }),
  conversations: () => request<Conversation[]>(BASE + "/conversations"),
  createConversation: (profile_id: string | null) =>
    request<Conversation>(BASE + "/conversations", {
      method: "POST",
      body: JSON.stringify({ profile_id }),
    }),
  archiveConversation: (id: string, archived: boolean) =>
    request<Conversation>(BASE + "/conversations/" + id, { method: "PATCH", body: JSON.stringify({ archived }) }),
  renameConversation: (id: string, title: string) =>
    request<Conversation>(BASE + "/conversations/" + id, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) =>
    request<{ ok: boolean; id: string }>(BASE + "/conversations/" + id, { method: "DELETE" }),
  snapshot: (id: string) => request<Snapshot>(BASE + "/conversations/" + id),
  send: (id: string, profile_id: string, input: string, request_id: string, options?: RunOptions) =>
    request<AgentRun>(BASE + "/conversations/" + id + "/runs", {
      method: "POST",
      body: JSON.stringify({ profile_id, input, request_id, ...options }),
    }),
  retry: (id: string, request_id: string, full_access_confirmed = false) =>
    request<AgentRun>(BASE + "/runs/" + id + "/retry", { method: "POST", body: JSON.stringify({ request_id, full_access_confirmed }) }),
  cancel: (id: string) =>
    request<AgentRun>(BASE + "/runs/" + id + "/cancel", { method: "POST" }),
  upload: (id: string, name: string, base64: string) =>
    request<AgentFile>(BASE + "/conversations/" + id + "/files", {
      method: "POST",
      body: JSON.stringify({ name, base64 }),
    }),
  preview: (id: string, signal?: AbortSignal) =>
    request<FilePreview>(
      BASE + "/artifacts/" + id + "/preview", { signal },
    ),
  export: (id: string) =>
    request<AgentApproval>(BASE + "/artifacts/" + id + "/export", {
      method: "POST",
    }),
  decide: (id: string, approved: boolean) =>
    request<AgentApproval>(BASE + "/approvals/" + id, {
      method: "POST",
      body: JSON.stringify({ approved }),
    }),
  openLocal: (id: string, action: "open" | "reveal") => request<{ ok: boolean; message: string }>(BASE + "/artifacts/" + id + "/local-open", { method: "POST", body: JSON.stringify({ action }) }),
  async previewBlob(id: string, signal: AbortSignal) {
    const response = await fetch(BASE + "/artifacts/" + id + "/content", { signal, headers: { Authorization: "Bearer " + tokenStore.get() } });
    if (!response.ok) throw new Error("文件预览未完成，请重试或下载后打开。");
    return response.blob();
  },
  async download(file: AgentFile, approvalId: string) {
    const response = await fetch(
      BASE +
        "/artifacts/" +
        file.id +
        "/download?approval=" +
        encodeURIComponent(approvalId),
      { headers: { Authorization: "Bearer " + tokenStore.get() } },
    );
    if (!response.ok) throw new Error("文件下载未完成，请重新确认导出。");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },
};
export async function streamEvents(
  id: string,
  after: number,
  signal: AbortSignal,
  onEvent: (event: AgentEvent) => void,
  onState: (connected: boolean) => void,
) {
  let cursor = after;
  let attempts = 0;
  while (!signal.aborted) {
    try {
      const response = await fetch(
        BASE + "/conversations/" + id + "/events?after=" + cursor,
        { headers: { Authorization: "Bearer " + tokenStore.get() }, signal },
      );
      if (response.status === 401) {
        tokenStore.clear();
        window.dispatchEvent(new Event("agent:unauthorized"));
        return;
      }
      if (!response.ok || !response.body) throw new Error("进度连接未建立。");
      onState(true);
      attempts = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (!signal.aborted) {
          const item = await reader.read();
          if (item.done) throw new Error("进度连接已断开。");
          buffer += decoder.decode(item.value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          if (buffer.length > 2_000_000) throw new Error("进度内容过长。");
          let end: number;
          while ((end = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const event = JSON.parse(data) as AgentEvent;
            if (event.seq > cursor) {
              onEvent(event);
              cursor = event.seq;
            }
          }
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
    } catch {
      if (signal.aborted) return;
      onState(false);
      if (++attempts >= 5)
        throw new Error("进度连接多次中断。已保留任务，请点击重新连接。");
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(done, Math.min(5000, 500 * 2 ** attempts));
        function done() {
          clearTimeout(timeout);
          signal.removeEventListener("abort", done);
          resolve();
        }
        signal.addEventListener("abort", done, { once: true });
      });
    }
  }
}
