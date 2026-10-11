import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const run = (...args: string[]) => spawn(process.execPath, args, { cwd: root, stdio: "inherit" });

const children = [run("node_modules/vite/bin/vite.js"), run("--watch", "server/main.ts")];

function stopAll(signal: NodeJS.Signals) {
  for (const child of children) child.kill(signal);
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));

for (const child of children) {
  child.on("error", (error) => {
    console.error(error);
    process.exitCode = 1;
    stopAll("SIGTERM");
  });
  child.on("exit", (code) => {
    if (code) process.exitCode = code;
    stopAll("SIGTERM");
  });
}
