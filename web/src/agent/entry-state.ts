/** 青穗集 · 登录身份与工作区恢复：API Key 是本机接入方式，不伪装成官方账号。 */
import type { AgentUser, ModelProfile, OfficialSession } from "./types";
export function readyApiProfile(profiles: ModelProfile[]) {
  return profiles.find(profile => profile.mode === "custom" && profile.has_key && profile.capabilities.chat);
}
export function canResumeWorkspace(user: AgentUser, profiles: ModelProfile[], mode: "local" | "server") {
  return mode === "server" || user.identity === "official" || Boolean(user.external_ai_consent && readyApiProfile(profiles));
}
export function accountDisplay(user: AgentUser, mode: "local" | "server", session?: OfficialSession) {
  const official = user.identity === "official" || mode === "server";
  return { official, name: official ? user.official_account?.username || session?.account?.username || user.username : "API-KEY" };
}
