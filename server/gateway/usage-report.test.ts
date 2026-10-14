import { execFile } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { silentLogger } from "../logging/logger.ts";
import { createFileLedger, monthOf } from "../storage/file-ledger.ts";
import type { LedgerEntry, SettleEntry } from "../storage/types.ts";
import { tempDataDir } from "../testing.ts";
import { killSwitchPath } from "./gateway.ts";
import { FAKE_MODEL } from "./types.ts";
import { usageReport } from "./usage-report.ts";

const HAIKU = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const CAPS = { dailyUsd: 2, monthlyUsd: 20 };
const USAGE_SCRIPT = fileURLToPath(new URL("../usage.ts", import.meta.url));

function call(
  callId: string,
  reservedAt: string,
  settle: Partial<SettleEntry> | "unsettled",
  { job = "write-section", model = HAIKU } = {},
): LedgerEntry[] {
  const reserve: LedgerEntry = { kind: "reserve", callId, reservedAt, job, model, worstCaseUsd: 0.02 };
  if (settle === "unsettled") return [reserve];
  return [
    reserve,
    {
      kind: "settle",
      callId,
      reservedAt,
      at: reservedAt,
      job,
      model,
      inputTokens: 1000,
      outputTokens: 800,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      usd: 0.005,
      outcome: "complete",
      estimated: false,
      ...settle,
    },
  ];
}

describe("usage report", () => {
  const now = new Date("2026-10-11T12:00:00.000Z");

  it("reports an empty ledger as no spend", () => {
    const report = usageReport({ monthEntries: [], now, caps: CAPS, killSwitchOn: false });
    expect(report).toContain("Kill switch: off.");
    expect(report).toContain("Today, 2026-10-11: $0.0000 of $2.00, 0 calls");
    expect(report).toContain("This month, 2026-10: $0.0000 of $20.00, 0 calls");
    expect(report).not.toContain("Unsettled reservations");
  });

  it("splits today's and this month's spend by model and by job", () => {
    const monthEntries = [
      ...call("a", "2026-10-11T09:00:00.000Z", { usd: 0.005 }),
      ...call("b", "2026-10-11T10:00:00.000Z", { usd: 0.0102, outcome: "aborted", estimated: true }),
      ...call("c", "2026-10-11T11:00:00.000Z", "unsettled"),
      ...call("d", "2026-10-03T11:00:00.000Z", { usd: 0.1 }, { job: "write-toc", model: "us.model" }),
    ];
    const report = usageReport({ monthEntries, now, caps: CAPS, killSwitchOn: true });

    expect(report).toBe(
      [
        "Model spend (UTC). Kill switch: ON, new calls are refused.",
        "",
        "Today, 2026-10-11: $0.0352 of $2.00, 3 calls",
        "  aborted 1, failed 0, estimated 1, unsettled 1",
        "  by model:",
        `    ${HAIKU}  $0.0352  3 calls`,
        "  by job:",
        "    write-section  $0.0352  3 calls",
        "  fake-model, not counted above: $0.0000, 0 calls",
        "",
        "This month, 2026-10: $0.1352 of $20.00, 4 calls",
        "  aborted 1, failed 0, estimated 1, unsettled 1",
        "  by model:",
        `    ${HAIKU}  $0.0352  3 calls`,
        `    ${"us.model".padEnd(HAIKU.length)}  $0.1000  1 call`,
        "  by job:",
        "    write-section  $0.0352  3 calls",
        "    write-toc      $0.1000  1 call",
        "  fake-model, not counted above: $0.0000, 0 calls",
        "",
        "Unsettled reservations, counted at their worst case:",
        "  2026-10-11T11:00:00.000Z  c  write-section  $0.0200",
      ].join("\n"),
    );
  });

  it("counts the fake model's calls apart, in none of the totals, counts or groups of real spend", () => {
    const fake = { model: FAKE_MODEL };
    const monthEntries = [
      ...call("real", "2026-10-11T09:00:00.000Z", { usd: 0.005 }),
      ...call("fake-1", "2026-10-11T09:01:00.000Z", { usd: 0, estimated: true, outcome: "aborted" }, fake),
      ...call("fake-2", "2026-10-11T09:02:00.000Z", { usd: 0 }, { ...fake, job: "librarian" }),
      ...call("fake-3", "2026-10-11T09:03:00.000Z", "unsettled", fake).map((entry) => ({ ...entry, worstCaseUsd: 0 })),
    ];
    const report = usageReport({ monthEntries, now, caps: CAPS, killSwitchOn: false });

    expect(report).toBe(
      [
        "Model spend (UTC). Kill switch: off.",
        "",
        "Today, 2026-10-11: $0.0050 of $2.00, 1 call",
        "  aborted 0, failed 0, estimated 0, unsettled 0",
        "  by model:",
        `    ${HAIKU}  $0.0050  1 call`,
        "  by job:",
        "    write-section  $0.0050  1 call",
        "  fake-model, not counted above: $0.0000, 3 calls",
        "",
        "This month, 2026-10: $0.0050 of $20.00, 1 call",
        "  aborted 0, failed 0, estimated 0, unsettled 0",
        "  by model:",
        `    ${HAIKU}  $0.0050  1 call`,
        "  by job:",
        "    write-section  $0.0050  1 call",
        "  fake-model, not counted above: $0.0000, 3 calls",
      ].join("\n"),
    );
  });
});

describe("npm run usage", () => {
  function runUsage(dataDir: string, ...options: string[]): Promise<{ stdout: string; stderr: string }> {
    return promisify(execFile)(process.execPath, [USAGE_SCRIPT, dataDir, ...options], {
      env: { ...process.env, RTFM_MODELS: "fake" },
    });
  }

  it("works on an empty ledger", async () => {
    const { stdout: output } = await runUsage(await tempDataDir());
    expect(output).toMatch(/Today, \d{4}-\d{2}-\d{2}: \$0\.0000 of \$2\.00, 0 calls/);
  });

  it("refuses to import with the fake models, and --apply without --import", async () => {
    const dataDir = await tempDataDir();
    await expect(runUsage(dataDir, "--import")).rejects.toMatchObject({
      code: 1,
      stderr: "--import copies into rtfm-usage, so it runs with RTFM_MODELS=bedrock\n",
    });
    await expect(runUsage(dataDir, "--apply")).rejects.toMatchObject({ code: 1, stderr: "--apply goes with --import\n" });
  });

  it("refuses a data folder with Bedrock, whose spending is in rtfm-usage", async () => {
    const run = promisify(execFile)(process.execPath, [USAGE_SCRIPT, await tempDataDir()], {
      env: { ...process.env, RTFM_MODELS: "bedrock" },
    });
    await expect(run).rejects.toMatchObject({
      code: 1,
      stderr: "With RTFM_MODELS=bedrock, npm run usage reads rtfm-usage, not a data folder\n",
    });
  });

  it("reads a test ledger and the kill switch from the data dir it is given", async () => {
    const dataDir = await tempDataDir();
    const ledger = createFileLedger(dataDir, silentLogger);
    const reservedAt = new Date().toISOString();
    for (const entry of [...call("a", reservedAt, { usd: 0.0081 }), ...call("b", reservedAt, "unsettled")]) {
      await ledger.append(entry);
    }
    await writeFile(killSwitchPath(dataDir), "");

    const { stdout: output } = await runUsage(dataDir);
    expect(output).toContain("Kill switch: ON");
    expect(output).toMatch(/Today, \d{4}-\d{2}-\d{2}: \$0\.0281 of \$2\.00, 2 calls/);
    expect(output).toContain(`${HAIKU}  $0.0281  2 calls`);
    expect(output).toContain(`${reservedAt}  b  write-section  $0.0200`);
  });

  it("reports the lines it can read when a crash cut one off and a later entry followed it, and warns about the cut one", async () => {
    const dataDir = await tempDataDir();
    const ledger = createFileLedger(dataDir, silentLogger);
    const reservedAt = new Date().toISOString();
    const [reserveA, settleA] = call("a", reservedAt, { usd: 0.0081 });
    await ledger.append(reserveA!);
    await appendFile(path.join(dataDir, "ledger", `${monthOf(reservedAt)}.jsonl`), JSON.stringify(settleA).slice(0, 40));
    for (const entry of call("b", reservedAt, { usd: 0.003 })) await ledger.append(entry);

    const { stdout, stderr } = await runUsage(dataDir);
    expect(stdout).toMatch(/Today, \d{4}-\d{2}-\d{2}: \$0\.0230 of \$2\.00, 2 calls/);
    expect(stdout).toContain(`${reservedAt}  a  write-section  $0.0200`);
    expect(JSON.parse(stderr)).toMatchObject({ level: "WARN", event: "ledger.line-skipped", line: 2 });
  });
});
