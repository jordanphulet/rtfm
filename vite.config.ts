import react from "@vitejs/plugin-react";
import { defineConfig, type ProxyOptions } from "vite";
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
});
