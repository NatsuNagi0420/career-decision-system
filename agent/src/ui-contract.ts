/** 青穗集 · 部署界面能力：同一前端按服务端规则呈现，本机权限不随浏览器地址推断。 */
export function deploymentUi(mode: "local" | "server", localFiles = false) {
  const local = mode === "local";
  return {
    model_connections: local,
    model_selector: local,
    local_projects: local,
    host_permissions: local,
    local_file_actions: local && localFiles,
    desktop_exit: local,
  };
}
export type DeploymentUi = ReturnType<typeof deploymentUi>;
