/** 青穗集 · 登录恢复回归：无可用Key不绕过入口，官方身份与模型来源独立。 */
import { describe, expect, it } from "vitest";
import { accountDisplay, canResumeWorkspace } from "./entry-state";
import type { AgentUser, ModelProfile } from "./types";
const device: AgentUser = { id:1, username:"本机工作区", identity:"device", external_ai_consent:true };
const custom = { mode:"custom", has_key:true, capabilities:{chat:true} } as ModelProfile;
describe("登录身份", () => {
  it("未配置或只存在官方连接的设备账号留在登录入口", () => {
    expect(canResumeWorkspace(device, [], "local")).toBe(false);
    expect(canResumeWorkspace(device, [{...custom,mode:"official"}], "local")).toBe(false);
    expect(canResumeWorkspace(device, [{...custom,has_key:false}], "local")).toBe(false);
  });
  it("记住的有效API Key配置和官方账号正常恢复，不要求每次重登", () => {
    expect(canResumeWorkspace(device, [custom], "local")).toBe(true);
    expect(canResumeWorkspace({...device,identity:"official"}, [], "local")).toBe(true);
  });
  it("API Key仅显示接入方式，官方显示权威用户名，不泄漏本地映射名", () => {
    expect(accountDisplay(device,"local").name).toBe("API-KEY");
    expect(accountDisplay({...device,identity:"official", official_account:{id:7,username:"青穗测试"}},"local").name).toBe("青穗测试");
  });
});
