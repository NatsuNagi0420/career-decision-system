/** 青穗集 · 扫码协议回归：识别本产品二维码，拒绝异站地址和长效账号凭证。 */
import { describe, it, expect } from "vitest";
import { parseDevicePairing } from "../../../uni-app/src/services/device-pairing";
describe("电脑绑定二维码", () => {
  const origin = "https://agent.suinai.me", token = "a".repeat(43);
  const payload = JSON.stringify({ type: "suinai-device", version: 1, hub: origin, token });
  it("只提取当前服务的一次性凭证", () => expect(parseDevicePairing(payload, origin + "/")).toBe(token));
  it("拒绝其他服务与任意 URL", () => { expect(() => parseDevicePairing(payload, "https://other.example")).toThrow("其他服务"); expect(() => parseDevicePairing("https://example.com/?token=secret", origin)).toThrow("不是穗奈"); });
  it("拒绝六位旧码、未知版本和超大载荷", () => { expect(() => parseDevicePairing("123456", origin)).toThrow(); expect(() => parseDevicePairing(payload.replace('"version":1', '"version":2'), origin)).toThrow(); expect(() => parseDevicePairing("a".repeat(1025), origin)).toThrow(); expect(() => parseDevicePairing(payload.replace(token, "account-token"), origin)).toThrow(); });
});
