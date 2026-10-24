/** 青穗集 · 前端入口：启动层与业务资源并行加载，预览独立分流；不以动画时长阻塞登录。 */
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { StartupGate, StartupReady } from "./components/Startup";
import { UiMicroInteractions } from "./agent/UiMicroInteractions";
import "./styles.css";
import "./desktop.css";
import "./character.css";
// 旧接口必须配合独立 Python 后端启动，不能仅靠查询参数误切到不兼容服务。
const legacy = import.meta.env.VITE_LEGACY_APP === "1";
const App = legacy ? lazy(() => import("./App").then(module => ({ default: module.App })))
  : lazy(() => import("./agent/AgentApp").then(module => ({ default: module.AgentApp })));
const SuinaiStudio = lazy(() => import("./components/SuinaiStudio").then(module => ({ default: module.SuinaiStudio })));
const Live2DStudio = lazy(() => import("./components/Live2DStudio").then(module => ({ default: module.Live2DStudio })));
const SuinaiMotionStudio = lazy(() => import("./components/SuinaiMotionStudio").then(module => ({ default: module.SuinaiMotionStudio })));
const BootPreview = lazy(() => import("./components/BootPreview").then(module => ({ default: module.BootPreview })));
const StreamPreview = lazy(() => import("./agent/StreamPreview").then(module => ({ default: module.StreamPreview })));
const preview = new URLSearchParams(location.search).get("preview");
function previewPage() {
  if (preview === "stream") return <StreamPreview />;
  if (preview === "boot") return <BootPreview />;
  if (preview === "suinai-motion") return <SuinaiMotionStudio />;
  if (preview === "live2d") return <Live2DStudio />;
  return <SuinaiStudio />;
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiMicroInteractions />
    {["boot", "suinai-motion", "live2d", "suinai", "stream"].includes(preview ?? "")
      ? <Suspense fallback={<p className="startup-error" role="status">正在打开预览…</p>}>{previewPage()}</Suspense>
      : <StartupGate>{onReady => <Suspense fallback={null}><StartupReady onReady={onReady}><App /></StartupReady></Suspense>}</StartupGate>}
  </StrictMode>,
);
