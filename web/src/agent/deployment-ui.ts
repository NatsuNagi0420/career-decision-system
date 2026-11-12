/** 青穗集 · 页面能力入口：优先采用服务端能力清单，加载完成前不展示本机高权限操作。 */
import { deploymentUi } from "../../../agent/src/ui-contract";
import type { AgentInfo } from "./types";
export function resolveDeploymentUi(info: AgentInfo | null, mode?: "local" | "server") {
  return info?.ui ?? deploymentUi(info?.deployment_mode ?? mode ?? "server", Boolean(info?.local_file_actions));
}
