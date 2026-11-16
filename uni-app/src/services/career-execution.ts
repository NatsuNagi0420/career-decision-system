/** 青穗集 · 职业任务执行：统一模型同意和原生／Hub会话映射，重试沿用请求编号。 */
import { agentApi, authApi, getToken, type Conversation } from "./api";
export async function ensureCareerConsent() {
  const token = getToken(), user = await authApi.me();
  if (getToken() !== token) return false;
  if (user.external_ai_consent) return true;
  const agreed = await new Promise<boolean>(resolve => uni.showModal({ title: "允许模型处理这些内容？", content: "你的作答、岗位要求和相关经历将发送给当前模型服务，用于生成题目与反馈。", confirmText: "同意并继续", success: result => resolve(result.confirm), fail: () => resolve(false) }));
  if (!agreed || token !== getToken()) return false;
  await authApi.consent(true);
  return token === getToken();
}
export function findCloudSession(sessions: Conversation[], nativeId: string) {
  return sessions.find(session => session.target !== "pc" && (session.id === nativeId || session.local_id === nativeId));
}
export async function resolveCloudSession(nativeId: string) {
  const session = findCloudSession(await agentApi.conversations(), nativeId);
  if (!session) throw new Error("这轮训练对应的云端会话尚未同步，请稍后刷新。");
  if (session.archived) throw new Error("训练对话已归档，请先在会话列表恢复。");
  return session;
}
