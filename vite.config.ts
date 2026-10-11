import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { API_PORT } from "./server/config.ts";

const apiProxy = { "/api": `http://localhost:${API_PORT}` };

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { proxy: apiProxy },
});
