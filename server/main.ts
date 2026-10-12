import { startServer } from "./app.ts";
import { config } from "./config.ts";

const server = await startServer(config);
console.log(`API server on http://localhost:${server.port} (${config.models} models)`);
