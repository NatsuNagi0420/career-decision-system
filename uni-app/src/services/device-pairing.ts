/** 青穗集 · 扫码凭证校验：只接收当前服务的一次性电脑绑定码，不访问扫码内容中的地址。 */
export function parseDevicePairing(raw: string, apiOrigin: string): string {
  let data: unknown;
  try { if (raw.length > 1024) throw new Error(); data = JSON.parse(raw); } catch { throw new Error("这不是穗奈的电脑绑定二维码。"); }
  const value = data as { type?: unknown; version?: unknown; hub?: unknown; token?: unknown } | null;
  if (!value || value.type !== "suinai-device" || value.version !== 1 || typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value.token)) throw new Error("这不是穗奈的电脑绑定二维码。");
  if (value.hub !== apiOrigin.replace(/\/$/, "")) throw new Error("二维码来自其他服务，请在当前账号对应的电脑端重新连接。");
  return value.token;
}
