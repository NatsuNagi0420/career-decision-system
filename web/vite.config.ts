/** 青穗集 · 前端开发代理：默认连接当前 TypeScript Agent。 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// The dev server proxies /api and /healthz to the selected local service, so the
// browser never needs CORS. Set VITE_BACKEND_ORIGIN only when connecting to another compatible Agent endpoint.
const backend = process.env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:8110";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    // 仅额外开放纯排版模块，预览与后端交付共用一份模板；不暴露后端配置目录。
    fs: { allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../agent/src/resume-render.ts", import.meta.url)), fileURLToPath(new URL("../agent/src/resume-contract.ts", import.meta.url))] },
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/healthz": { target: backend, changeOrigin: true },
    },
  },
  // scripts/*.test.mjs holds the webfont-subset contract: it is about build artefacts,
  // not app runtime, so it lives beside the script it checks rather than in src/.
  test: { environment: "node", testTimeout: 60_000, hookTimeout: 60_000, include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"] },
});
