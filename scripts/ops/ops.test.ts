import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { testUsageTable } from "../../server/gateway/dynamodb-testing.ts";
import { OpsUsageError, runOps } from "./ops.ts";
import { standInAws } from "./testing.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const LOG_LINE = { timestamp: "2026-10-13T11:00:00.000Z", level: "WARN", event: "section.failed", message: "m" };
const ACME_LINE = { ...LOG_LINE, event: "request", libraryId: "acme" };
const filterLogEvents = { args: ["logs", "filter-log-events"], stdout: { events: [{ message: JSON.stringify(LOG_LINE) }] } };

async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; !condition(); waited += 25) {
    if (waited > 20_000) throw new Error("Timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("npm run ops", () => {
  it("prints text, or the same as JSON with --json", async () => {
    const { context } = standInAws([], { usageTable: await testUsageTable() });
    expect(await runOps(["kill-switch", "status"], context)).toEqual({ stdout: "Kill switch: off.", ok: true });
    expect(await runOps(["kill-switch", "status", "--json"], context)).toEqual({
      stdout: JSON.stringify({ killSwitchOn: false }, null, 2),
      ok: true,
    });
  });

  it("passes the logs filters on", async () => {
    const { context } = standInAws([filterLogEvents]);
    const { stdout } = await runOps(["logs", "--level", "error", "--json"], context);
    expect(JSON.parse(stdout)).toEqual([]);
    expect(JSON.parse((await runOps(["logs", "-e", "section", "-n", "1", "--since", "2h", "--json"], context)).stdout)).toEqual([
      LOG_LINE,
    ]);
  });

  it("keeps one library's log entries with --library", { timeout: 30_000 }, async () => {
    const events = [LOG_LINE, ACME_LINE].map((line) => ({ message: JSON.stringify(line) }));
    const { context } = standInAws([{ args: ["logs", "filter-log-events"], stdout: { events } }]);
    expect(JSON.parse((await runOps(["logs", "--library", "acme", "--json"], context)).stdout)).toEqual([ACME_LINE]);
    expect(JSON.parse((await runOps(["logs", "--library", "admin", "--json"], context)).stdout)).toEqual([]);
  });

  it("refuses a command line it doesn't take, before reaching AWS", async () => {
    const { context, calls } = standInAws();
    const refused: [string[], RegExp][] = [
      [[], /Name a command/],
      [["deploy"], /no command "deploy"/],
      [["kill-switch"], /on, off or status/],
      [["kill-switch", "toggle"], /on, off or status/],
      [["kill-switch", "on", "off"], /on, off or status/],
      [["passcode"], /set or cookie/],
      [["passcode", "show"], /set or cookie/],
      [["passcode", "cookie", "extra"], /set or cookie/],
      [["usage", "extra"], /takes no argument/],
      [["status", "--profile", "work-admin"], /Unknown option '--profile'/],
      [["usage", "--level", "warn"], /Unknown option '--level'/],
      [["library"], /library takes create <libraryId>, list, show <libraryId> or revoke <libraryId>/],
      [["library", "make", "acme"], /library takes create/],
      [["library", "create"], /library takes create/],
      [["library", "create", "acme", "globex"], /library takes create/],
      [["library", "list", "acme"], /library takes create/],
      [["library", "show"], /library takes create/],
      [["library", "revoke"], /library takes create/],
      [["library", "revoke", "acme", "--label", "x"], /Only library create takes --label/],
      [["library", "list", "--library", "acme"], /Unknown option '--library'/],
      [["usage", "--label", "x"], /Unknown option '--label'/],
    ];
    for (const [args, message] of refused) {
      await expect(runOps(args, context), args.join(" ")).rejects.toThrow(OpsUsageError);
      await expect(runOps(args, context), args.join(" ")).rejects.toThrow(message);
    }
    await expect(runOps(["logs", "--level", "loud"], context)).rejects.toThrow(/--level must be one of/);
    await expect(runOps(["logs", "--lines", "0"], context)).rejects.toThrow(/--lines must be/);
    await expect(runOps(["logs", "--since", "a while"], context)).rejects.toThrow(/--since must be/);
    expect(calls()).toEqual([]);
  });

  describe("as a command", () => {
    const run = (args: string[], env: NodeJS.ProcessEnv) =>
      spawnSync("npm", ["run", "--silent", "ops", "--", ...args], { cwd: REPO_ROOT, env, encoding: "utf8" });

    it("prints what it read and exits 0", () => {
      const { env } = standInAws([filterLogEvents]);
      const result = run(["logs"], env);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("2026-10-13T11:00:00.000Z WARN  section.failed m\n");
      expect(result.status).toBe(0);
    });

    it("exits 1 with the error on standard error when a read fails", () => {
      const { env } = standInAws([{ args: ["logs"], stderr: "AccessDeniedException", code: 254 }]);
      const result = run(["logs"], env);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("aws logs filter-log-events failed: AccessDeniedException\n");
      expect(result.status).toBe(1);
    });

    it("stops its command, exits 1 and removes its HOME when it is signalled", { timeout: 30_000 }, async () => {
      const { env, hung } = standInAws([{ args: ["logs"], hang: true }]);
      const ops = spawn("npm", ["run", "--silent", "ops", "--", "logs"], { cwd: REPO_ROOT, env, stdio: "ignore" });
      const exited = once(ops, "exit");
      await until(() => existsSync(hung));
      const { pid, home } = JSON.parse(readFileSync(hung, "utf8"));
      expect(existsSync(home)).toBe(true);

      ops.kill("SIGTERM");

      const [code] = await exited;
      expect(code).toBe(1);
      await until(() => !isRunning(pid));
      expect(existsSync(home)).toBe(false);
    });

    it("exits 1 with the usage for a command line it doesn't take", () => {
      const { env, calls } = standInAws();
      const result = run(["kill-switch", "on", "--profile", "work-admin"], env);
      expect(result.stderr).toMatch(/^Unknown option '--profile'.*\n\nUsage: npm run ops -- <command> \[--json\]/s);
      expect(result.status).toBe(1);
      expect(calls()).toEqual([]);
    });
  });
});
