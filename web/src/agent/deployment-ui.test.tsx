/** 青穗集 · 部署界面回归：云端不泄漏本机入口，上传类型跟随服务端能力。 */
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deploymentUi } from "../../../agent/src/ui-contract";
import { resolveDeploymentUi } from "./deployment-ui";
import { ChatComposer } from "./ChatComposer";
import { CareerWelcome } from "./CareerWelcome";
import { RemoteConnections } from "./RemoteConnections";
const noop = () => {};
function composer(mode: "local" | "server") {
  return renderToStaticMarkup(<ChatComposer ui={deploymentUi(mode)} supportedExtensions={["pdf", "docx", "png", "jpg", "webp", "txt"]} text="请帮我修改简历" onText={noop} composer={createRef()} fileInput={createRef()} onSubmit={noop} onUpload={noop} onCancel={noop} busy={false} working={false} fileBusy={false} waiting={false} archived={false} profiles={[]} selected="" onSelect={noop} permission="full-access" onPermission={noop} effort="auto" onEffort={noop} onModelSettings={noop} />);
}
describe("同一前端的部署能力", () => {
  it("云端输入框只保留上传、思考、发送，不提供模型连接和本机权限", () => {
    const html = composer("server");
    for (const text of ["打开本机项目工作区", "导入项目文件夹", "权限设置", "完全访问", "当前模型连接", "管理模型连接"]) expect(html).not.toContain(text);
    for (const text of ['aria-label="导入文件"', 'accept=".pdf,.docx,.png,.jpg,.webp,.txt"', "设置思考强度", 'aria-label="发送消息"']) expect(html).toContain(text);
  });
  it("本机输入框保留原有模型、项目和权限功能", () => {
    const html = composer("local");
    for (const text of ["打开本机项目工作区", "权限设置", "完全访问", "当前模型连接", "管理模型连接"]) expect(html).toContain(text);
  });
  it("未收到部署信息时不先渲染本机高权限入口，旧版本按明确模式兼容", () => {
    expect(resolveDeploymentUi(null)).toEqual(deploymentUi("server"));
    expect(resolveDeploymentUi(null, "server").host_permissions).toBe(false);
    expect(resolveDeploymentUi(null, "local").model_connections).toBe(true);
  });
  it("云端未就绪也不把用户带到模型配置页面", () => {
    const html = renderToStaticMarkup(<CareerWelcome connected={false} canConfigure={false} onPrompt={noop} onConnect={noop} />);
    expect(html).not.toContain("连接模型，和穗奈聊聊");
    expect(html).toContain('aria-label="从认识自己开始"');
  });
  it("云端设备窗口管理自己的电脑，不出现连接此电脑和二维码配对", () => {
    const html = renderToStaticMarkup(<RemoteConnections cloud open onClose={noop} user={{ id: 1, username: "fixture", external_ai_consent: true, identity: "official" }} onLogin={noop} />);
    expect(html).toContain("我的电脑");
    expect(html).not.toContain("连接此电脑");
    expect(html).not.toContain("电脑名称");
    expect(html).not.toContain("电脑绑定二维码");
  });
});
