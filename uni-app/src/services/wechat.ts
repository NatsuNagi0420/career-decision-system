/** 青穗集 · 微信生态服务：订阅消息授权与内容安全检测位，登录统一走官方账号。 */
import { request } from "./api";

/** 微信环境判定：H5 和非微信环境无微信专属能力。 */
export function inWechatRuntime(): boolean {
  // #ifdef MP-WEIXIN
  return typeof wx !== "undefined" && Boolean(wx.login);
  // #endif
  return false;
}

/** 订阅消息模板 ID：后端配置真实模板后填入，占位时请求不弹窗也不报错。 */
const SUBSCRIBE_TEMPLATE_IDS: string[] = [];

/** 发送指令时请求一次性订阅（任务完成/等待审批提醒）。模板未配置时静默跳过。 */
export function requestTaskSubscribe(): void {
  if (!SUBSCRIBE_TEMPLATE_IDS.length || !inWechatRuntime()) return;
  wx.requestSubscribeMessage({
    tmplIds: SUBSCRIBE_TEMPLATE_IDS,
    complete: () => undefined,
  });
}

/**
 * 内容安全检测位：正式接入后由后端代理 msgSecCheck。
 * 后端未就绪时放行（fail-open），接入后切换到 fail-closed 由后端决定。
 */
export async function checkMessageSafety(content: string): Promise<{ pass: boolean; reason?: string }> {
  try {
    const result = await request<{ pass: boolean; reason?: string }>("/api/v1/agent/moderation/message", {
      method: "POST",
      data: { content },
    });
    return result;
  } catch {
    // 占位期：检测端点不存在 → 放行，不阻塞对话。
    return { pass: true };
  }
}
