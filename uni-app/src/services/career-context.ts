/** 青穗集 · 职业上下文：按账号和来源续用会话，草稿由用户确认后发送。 */
import { API_ORIGIN, getToken } from "./api";
let owner: string | null = null;
import type { SelectedAttachment } from "./files";
let draft = "";
let attachment: SelectedAttachment | null = null;
const conversations = new Map<string, string>();
function syncOwner() {
  if (owner === getToken()) return;
  owner = getToken();
  draft = "";
  attachment = null;
  conversations.clear();
}
export function careerSource() {
  const value = uni.getStorageSync("qingsui.career.source:" + API_ORIGIN);
  return typeof value === "string" && value ? value : "cloud";
}
export function setCareerSource(source: string) {
  uni.setStorageSync("qingsui.career.source:" + API_ORIGIN, source);
}
export function rememberCareerConversation(id: string, source: string) {
  syncOwner();
  conversations.set(source, id);
}
export function consumeCareerDraft() {
  syncOwner();
  const value = draft;
  draft = "";
  return value;
}
export function consumeCareerAttachment() {
  syncOwner();
  const value = attachment;
  attachment = null;
  return value;
}
export function openCareerChat(
  text: string,
  source = careerSource(),
  file: SelectedAttachment | null = null,
) {
  syncOwner();
  draft = text;
  attachment = file;
  const existing = conversations.get(source);
  uni.navigateTo({
    url: existing
      ? "/pages/chat/index?id=" + encodeURIComponent(existing)
      : "/pages/chat/index?new=1&source=" + encodeURIComponent(source),
  });
}
