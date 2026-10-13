import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { isRunDirectly, runHook } from "./run-hook.ts";

const WATCHED_FILES = ["CLAUDE.md", "PROCESS.md"];
const DIFF_LIMIT = 4000;
const MAIN_AGENT = "session";
const STALE_LOCK_MS = 10_000;

/**
 * A session keeps its rule files under `<tmp>/rtfm-rules-<uid>/<session id>/`:
 * - `copy/<file>`: the file as it was when the session started, the copy in its context;
 * - `seen/<agent>.json`: for the session and each subagent, the hash of each file as it was last
 *   told about it. With none, an agent knows the copy, since a subagent is given its session's.
 * Starting again (a resume, `/clear` or compaction) takes a fresh copy and forgets what the session
 * was told, but keeps what running subagents were told.
 */
export function saveRuleCopies(projectDir: string, tmp: string, sessionId: string | undefined) {
  const dir = sessionDir(tmp, sessionId);
  rmSync(path.join(dir, "copy"), { recursive: true, force: true });
  rmSync(seenPath(dir, MAIN_AGENT), { force: true });
  mkdirSync(path.join(dir, "copy"), { recursive: true, mode: 0o700 });
  for (const file of WATCHED_FILES) copyFileSync(path.join(projectDir, file), path.join(dir, "copy", file));
}

/**
 * Tells the session, or the subagent `agentId`, which watched files have changed on disk since it
 * was last told, each with its diff from the copy. Once told, it hears nothing more until the
 * file changes again. Parallel tool calls check at the same time, so one check at a time holds the
 * agent's lock, and a check that finds it taken says nothing.
 */
export function ruleChangeNotice(
  projectDir: string,
  tmp: string,
  sessionId: string | undefined,
  agentId = MAIN_AGENT,
): string | undefined {
  const dir = sessionDir(tmp, sessionId);
  const seenFile = seenPath(dir, agentId);
  mkdirSync(path.dirname(seenFile), { recursive: true, mode: 0o700 });
  const lock = `${seenFile}.lock`;
  if (!takeLock(lock)) return undefined;
  try {
    return noticeSinceSeen(projectDir, dir, seenFile);
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function noticeSinceSeen(projectDir: string, dir: string, seenFile: string): string | undefined {
  const seen = readSeen(seenFile);
  const notices: string[] = [];
  for (const file of WATCHED_FILES) {
    const copyPath = path.join(dir, "copy", file);
    const diskPath = path.join(projectDir, file);
    const onDisk = hash(readFileSync(diskPath));
    const known = seen[file] ?? hash(readFileSync(copyPath));
    if (onDisk === known) continue;
    notices.push(changeNotice(file, copyPath, diskPath));
    seen[file] = onDisk;
  }
  if (notices.length === 0) return undefined;

  const temporary = `${seenFile}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(seen));
  renameSync(temporary, seenFile);
  return notices.join("\n\n");
}

/** Takes the lock by creating its folder, which only one process can do; a stale lock is taken over. */
function takeLock(lock: string): boolean {
  try {
    mkdirSync(lock);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (Date.now() - statSync(lock).mtimeMs < STALE_LOCK_MS) return false;
  rmSync(lock, { recursive: true, force: true });
  try {
    mkdirSync(lock);
    return true;
  } catch {
    return false;
  }
}

function changeNotice(file: string, copyPath: string, diskPath: string): string {
  const diff = diffFromCopy(copyPath, diskPath);
  if (diff === undefined) {
    return `${diskPath} is back to the copy of ${file} this conversation was given when it started.`;
  }
  return [
    `${diskPath} changed after this conversation was given its copy of ${file}.`,
    "That file is the one in force: where it differs from the copy in this conversation's context, it wins.",
    `The change from the copy (${copyPath}) to that file:`,
    diff,
  ].join("\n");
}

/** The hunks of `git diff --no-index` from the copy to the file, cut short if long. */
function diffFromCopy(copyPath: string, diskPath: string): string | undefined {
  const result = spawnSync(
    "git",
    ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", copyPath, diskPath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (result.status === 0) return undefined;
  if (result.status !== 1) throw new Error(`git diff failed: ${result.error?.message ?? result.status}`);

  const hunks = result.stdout.slice(result.stdout.indexOf("\n@@") + 1).trimEnd();
  if (hunks.length <= DIFF_LIMIT) return hunks;
  const cut = hunks.slice(0, hunks.lastIndexOf("\n", DIFF_LIMIT));
  return `${cut}\n… (cut short; the whole diff is \`git diff --no-index ${copyPath} ${diskPath}\`)`;
}

function readSeen(seenFile: string): Record<string, string> {
  try {
    return JSON.parse(readFileSync(seenFile, "utf8"));
  } catch {
    return {};
  }
}

function sessionDir(tmp: string, sessionId: string | undefined): string {
  const rulesDir = path.join(tmp, `rtfm-rules-${process.getuid?.() ?? "user"}`);
  mkdirSync(rulesDir, { recursive: true, mode: 0o700 });
  return path.join(rulesDir, safeName(sessionId));
}

function seenPath(dir: string, agentId: string): string {
  return path.join(dir, "seen", `${safeName(agentId)}.json`);
}

function safeName(id: string | undefined): string {
  if (!id || !/^[\w-]+$/.test(id)) throw new Error(`Not a usable id: ${id}`);
  return id;
}

function hash(content: Buffer): string {
  return createHash("sha1").update(content).digest("hex");
}

if (isRunDirectly(import.meta.url)) {
  switch (process.argv[2]) {
    case "save":
      runHook("SessionStart", (input, projectDir) => {
        saveRuleCopies(projectDir, tmpdir(), input.session_id);
        return undefined;
      });
      break;
    case "check":
      runHook("PostToolUse", (input, projectDir) => ruleChangeNotice(projectDir, tmpdir(), input.session_id, input.agent_id));
      break;
  }
}
