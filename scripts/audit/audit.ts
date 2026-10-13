import { existsSync, realpathSync, statSync } from "node:fs";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { credentialReport } from "./credential-report.ts";
import { redactDeep } from "./credentials.ts";
import { folderStaging } from "./detectors/folder-staging.ts";
import { processStops } from "./detectors/process-stops.ts";
import { ruleFileEdits } from "./detectors/rule-file-edits.ts";
import { sensitivePaths } from "./detectors/sensitive-paths.ts";
import { subagentGitWrites } from "./detectors/subagent-git-writes.ts";
import { taskAgentPeak } from "./detectors/task-agent-peak.ts";
import { taskCommitReviews } from "./detectors/task-commit-reviews.ts";
import { toolErrors } from "./detectors/tool-errors.ts";
import { userMessages } from "./detectors/user-messages.ts";
import { toEvents } from "./events.ts";
import { commitsOnMain, mainCheckout, ruleFileCommits, worktreesBehindMain } from "./repo.ts";
import { readTranscripts, transcriptFolders } from "./transcripts.ts";

const { values } = parseArgs({
  options: { out: { type: "string" }, "exclude-session": { type: "string" } },
});

const repoDir = realpathSync.native(mainCheckout(path.dirname(fileURLToPath(import.meta.url))));
// `npm run` starts in the repo root; INIT_CWD is the folder it was run from.
const outDir = values.out
  ? path.resolve(process.env.INIT_CWD ?? process.cwd(), values.out)
  : await mkdtemp(path.join(tmpdir(), "rtfm-audit-"));
refuseIfInRepo(realPathOf(outDir));
await mkdir(outDir, { recursive: true, mode: 0o700 });
refuseIfInRepo(realpathSync.native(outDir));

const folders = await transcriptFolders(path.join(homedir(), ".claude", "projects"), repoDir);
const transcripts = await readTranscripts(folders, values["exclude-session"]);
const events = toEvents(transcripts);

const outputs: Record<string, unknown> = {
  "events.json": events,
  "credentials.json": credentialReport(events),
  "user-messages.json": userMessages(events),
  "subagent-git-writes.json": subagentGitWrites(events),
  "process-stops.json": processStops(events),
  "sensitive-paths.json": sensitivePaths(events),
  "rule-file-edits.json": ruleFileEdits(events),
  "task-commit-reviews.json": taskCommitReviews(events, commitsOnMain(repoDir)),
  "folder-staging.json": folderStaging(events, isDirectory),
  "task-agent-peak.json": taskAgentPeak(events),
  "worktrees-behind.json": worktreesBehindMain(repoDir),
  "tool-errors.json": toolErrors(events),
  "rule-file-commits.json": ruleFileCommits(repoDir),
};

for (const [file, value] of Object.entries(outputs)) {
  const outFile = path.join(outDir, file);
  await writeFile(outFile, `${JSON.stringify(redactDeep(value), null, 2)}\n`, { mode: 0o600 });
  await chmod(outFile, 0o600);
  console.log(`${file.padEnd(28)} ${describe(value)}`);
}
console.log(`\n${transcripts.length} transcripts from ${folders.length} folders. Written to ${outDir}`);

function describe(value: unknown): string {
  if (Array.isArray(value)) return `${value.length}`;
  if (value && typeof value === "object" && "total" in value) return `${value.total} found`;
  if (value && typeof value === "object" && "peak" in value) return `peak ${value.peak}`;
  return "";
}

function refuseIfInRepo(dir: string) {
  if (!isWithin(dir, repoDir)) return;
  console.error(`The output folder ${dir} is inside the repo ${repoDir}. Choose a folder outside it.`);
  process.exit(1);
}

/** The real path `dir` has or would have, through any symlink in the part of it that exists. */
function realPathOf(dir: string): string {
  const missing: string[] = [];
  let existing = dir;
  while (!existsSync(existing)) {
    missing.unshift(path.basename(existing));
    existing = path.dirname(existing);
  }
  return path.join(realpathSync.native(existing), ...missing);
}

function isDirectory(file: string): boolean | undefined {
  return existsSync(file) ? statSync(file).isDirectory() : undefined;
}

function isWithin(dir: string, parent: string): boolean {
  const relative = path.relative(parent, dir);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
