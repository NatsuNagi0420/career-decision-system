import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies /api and /healthz to the single Python service, so the
// browser never needs CORS. Set VITE_BACKEND_ORIGIN to point elsewhere.
const backend = process.env.VITE_BACKEND_ORIGIN ?? "http://127.0.0.1:8100";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/healthz": { target: backend, changeOrigin: true },
    },
  },
  // scripts/*.test.mjs holds the webfont-subset contract: it is about build artefacts,
  // not app runtime, so it lives beside the script it checks rather than in src/.
  test: { environment: "node", include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
