import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import { API_PORT } from "./server/ports.ts";

const apiProxy: Record<string, ProxyOptions> = {
  "/api": {
    target: `http://127.0.0.1:${API_PORT}`,
    changeOrigin: false,
    configure(proxy) {
      proxy.on("proxyRes", (apiResponse, _request, browserResponse) => {
        apiResponse.on("close", () => {
          if (!apiResponse.complete) browserResponse.destroy();
        });
      });
    },
  },
};

export default defineConfig({
  plugins: [react()],
  envDir: false,
  server: { port: 5173, strictPort: true, proxy: apiProxy, watch: { ignored: ["**/.data/**"] } },
  preview: { proxy: apiProxy },
  test: { exclude: [...configDefaults.exclude, ".claude/**"], setupFiles: ["./vitest.setup.ts"] },
});
