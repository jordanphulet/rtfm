import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toEvents } from "./events.ts";
import { projectFolderName, readTranscripts, transcriptFolders, type TranscriptEntry } from "./transcripts.ts";

const REPO = "/home/example/app";
const MAIN = projectFolderName(REPO);
const WORKTREE = projectFolderName(`${REPO}/.claude/worktrees/side-0000`);

let projects: string;

beforeEach(async () => {
  projects = await mkdtemp(path.join(tmpdir(), "rtfm-audit-test-"));
});

afterEach(async () => {
  await rm(projects, { recursive: true, force: true });
});

const human = (uuid: string, timestamp: string, content: string): TranscriptEntry => ({
  type: "user",
  uuid,
  timestamp,
  origin: { kind: "human" },
  message: { role: "user", content },
});

const bash = (uuid: string, timestamp: string, id: string, command: string): TranscriptEntry => ({
  type: "assistant",
  uuid,
  timestamp,
  message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: { command } }] },
});

const result = (uuid: string, timestamp: string, id: string, content: string): TranscriptEntry => ({
  type: "user",
  uuid,
  timestamp,
  message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content }] },
});

async function writeTranscript(file: string, entries: TranscriptEntry[]) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
}

async function writeProjects() {
  const original = [
    human("u1", "2030-01-01T10:00:00.000Z", "Start the example"),
    bash("u2", "2030-01-01T10:00:05.000Z", "tool-1", "git status"),
    result("u3", "2030-01-01T10:00:06.000Z", "tool-1", "example result"),
  ];
  await writeTranscript(path.join(projects, MAIN, "aaaa.jsonl"), [
    { type: "custom-title", customTitle: "Example orchestrator" },
    ...original,
  ]);
  await writeTranscript(path.join(projects, MAIN, "bbbb.jsonl"), [
    ...original,
    human("u4", "2030-01-01T11:00:00.000Z", "Carry on from the fork"),
  ]);
  await writeTranscript(path.join(projects, MAIN, "aaaa", "subagents", "agent-x1.jsonl"), [
    { type: "user", uuid: "s1", timestamp: "2030-01-01T10:01:00.000Z", message: { role: "user", content: "Do ZZ.1" } },
    bash("s2", "2030-01-01T10:02:00.000Z", "tool-2", "npm test"),
  ]);
  await writeFile(
    path.join(projects, MAIN, "aaaa", "subagents", "agent-x1.meta.json"),
    JSON.stringify({ description: "ZZ.1 example task", agentType: "general-purpose" }),
  );
  await writeTranscript(path.join(projects, WORKTREE, "cccc.jsonl"), [
    human("w1", "2030-01-01T12:00:00.000Z", "A question from a worktree"),
  ]);
  await writeTranscript(path.join(projects, `${MAIN}2`, "dddd.jsonl"), [
    human("o1", "2030-01-01T12:00:00.000Z", "Another project"),
  ]);
}

describe("transcriptFolders", () => {
  it("finds the main checkout's folder and its worktrees', and no other project's", async () => {
    await writeProjects();
    const folders = await transcriptFolders(projects, REPO);
    expect(folders.map((folder) => path.basename(folder))).toEqual([MAIN, WORKTREE]);
  });
});

describe("readTranscripts", () => {
  it("counts an entry a forked session repeats once, in the session it started in", async () => {
    await writeProjects();
    const events = toEvents(await readTranscripts(await transcriptFolders(projects, REPO)));
    expect(events.filter((event) => event.kind === "human").map((event) => [event.session, event.text])).toEqual([
      ["aaaa", "Start the example"],
      ["bbbb", "Carry on from the fork"],
      ["cccc", "A question from a worktree"],
    ]);
    expect(events.filter((event) => event.kind === "tool" && event.tool === "Bash")).toHaveLength(2);
  });

  it("says who each event is from, with a subagent's description", async () => {
    await writeProjects();
    const events = toEvents(await readTranscripts(await transcriptFolders(projects, REPO)));
    expect(events.find((event) => event.input?.command === "git status")).toMatchObject({
      who: "session: Example orchestrator",
      result: "example result",
    });
    expect(events.find((event) => event.input?.command === "npm test")).toMatchObject({
      session: "aaaa",
      agent: "x1",
      who: "subagent: ZZ.1 example task",
    });
  });

  it("drops the excluded session and its subagents, keeping what a fork of it repeats", async () => {
    await writeProjects();
    const events = toEvents(await readTranscripts(await transcriptFolders(projects, REPO), "aaaa"));
    expect(events.some((event) => event.agent === "x1")).toBe(false);
    expect(events.filter((event) => event.kind === "human").map((event) => event.session)).toEqual(["bbbb", "bbbb", "cccc"]);
  });
});
