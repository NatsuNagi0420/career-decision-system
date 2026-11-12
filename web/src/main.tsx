/** 青穗集 · 产品入口：启动层与主对话并行加载，仅进入真实账号和会话。 */
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { StartupGate, StartupReady } from "./components/Startup";
import { UiMicroInteractions } from "./agent/UiMicroInteractions";
import "./styles.css";
import "./desktop.css";
import "./character.css";
const App = lazy(() => import("./agent/AgentApp").then(module => ({ default: module.AgentApp })));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UiMicroInteractions />
    <StartupGate>{onReady => <Suspense fallback={null}><StartupReady onReady={onReady}><App /></StartupReady></Suspense>}</StartupGate>
  </StrictMode>,
);
