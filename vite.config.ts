import react from "@vitejs/plugin-react";
import type { ProxyOptions } from "vite";
import { configDefaults, defineConfig } from "vitest/config";
import { API_PORT } from "./server/config.ts";

const apiProxy: Record<string, ProxyOptions> = {
  "/api": {
    target: `http://localhost:${API_PORT}`,
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
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: { exclude: [...configDefaults.exclude, ".claude/**"] },
});
