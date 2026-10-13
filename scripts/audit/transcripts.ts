import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content?: string | ContentBlock[]; is_error?: boolean }
  | { type: "thinking" | "image" | "redacted_thinking" };

type Origin = { kind: string };

/** One line of a transcript, with only the fields the audit reads. */
export type TranscriptEntry = {
  type: string;
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  isMeta?: boolean;
  origin?: Origin;
  customTitle?: string;
  message?: { role: string; content: string | ContentBlock[] };
  attachment?: { type: string; prompt?: unknown; origin?: Origin };
};

type Subagent = { id: string; description: string };

/** A session's own transcript, or one of its subagents'. */
export type Transcript = {
  session: string;
  title?: string;
  subagent?: Subagent;
  entries: TranscriptEntry[];
};

/** The folder name Claude Code gives a project's transcripts: its path with every other character a dash. */
export function projectFolderName(dir: string): string {
  return dir.replace(/[^A-Za-z0-9]/g, "-");
}

/** The transcript folders of the checkout at `repoDir` and of its worktrees under `.claude/worktrees/`. */
export async function transcriptFolders(projectsDir: string, repoDir: string): Promise<string[]> {
  const main = projectFolderName(repoDir);
  const worktreePrefix = `${projectFolderName(path.join(repoDir, ".claude", "worktrees"))}-`;
  const names = await readdir(projectsDir);
  return names
    .filter((name) => name === main || name.startsWith(worktreePrefix))
    .sort()
    .map((name) => path.join(projectsDir, name));
}

/**
 * Every session in `folders` and its subagents, but `excludedSession`. A session forked from
 * another repeats the other's entries; each entry is kept only in the first transcript that has
 * it, taking the transcripts in the order they started (and, among those that started together,
 * the order they ended).
 */
export async function readTranscripts(folders: string[], excludedSession?: string): Promise<Transcript[]> {
  const sessions = (await Promise.all(folders.map(readFolder))).flat();
  const transcripts = sessions.filter((transcript) => transcript.session !== excludedSession).sort(byStartThenEnd);
  const seen = new Set<string>();
  return transcripts.map((transcript) => ({
    ...transcript,
    entries: transcript.entries.filter((entry) => {
      if (!entry.uuid) return true;
      if (seen.has(entry.uuid)) return false;
      seen.add(entry.uuid);
      return true;
    }),
  }));
}

async function readFolder(folder: string): Promise<Transcript[]> {
  const files = (await readdir(folder)).filter((file) => file.endsWith(".jsonl"));
  const sessions = await Promise.all(
    files.map(async (file) => {
      const session = path.basename(file, ".jsonl");
      const entries = await readEntries(path.join(folder, file));
      const title = entries.findLast((entry) => entry.type === "custom-title")?.customTitle;
      const subagents = await readSubagents(path.join(folder, session, "subagents"), session, title);
      return [{ session, title, entries }, ...subagents];
    }),
  );
  return sessions.flat();
}

async function readSubagents(dir: string, session: string, title: string | undefined): Promise<Transcript[]> {
  const files = await readdir(dir).catch(() => []);
  return Promise.all(
    files
      .filter((file) => file.endsWith(".jsonl"))
      .map(async (file) => {
        const id = path.basename(file, ".jsonl").replace(/^agent-/, "");
        const meta = await readMeta(path.join(dir, file.replace(/\.jsonl$/, ".meta.json")));
        const subagent = { id, description: meta.description ?? id };
        return { session, title, subagent, entries: await readEntries(path.join(dir, file)) };
      }),
  );
}

async function readMeta(file: string): Promise<{ description?: string }> {
  return JSON.parse(await readFile(file, "utf8").catch(() => "{}"));
}

async function readEntries(file: string): Promise<TranscriptEntry[]> {
  const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim() !== "");
  return lines.flatMap((line) => {
    try {
      return [JSON.parse(line) as TranscriptEntry];
    } catch {
      return [];
    }
  });
}

function byStartThenEnd(a: Transcript, b: Transcript): number {
  const [aStart, aEnd] = span(a);
  const [bStart, bEnd] = span(b);
  return aStart.localeCompare(bStart) || aEnd.localeCompare(bEnd);
}

function span(transcript: Transcript): [string, string] {
  const times = transcript.entries.flatMap((entry) => (entry.timestamp ? [entry.timestamp] : [])).sort();
  return [times[0] ?? "", times.at(-1) ?? ""];
}
