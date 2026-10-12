import type { SectionEvent, SectionStatus } from "../api/types.ts";
import type { ManualStore, StoredManual } from "../storage/types.ts";
import { WriteFailed, type SectionWriter } from "./types.ts";

export type Listener = (event: SectionEvent) => void;
export type Leave = () => void;

export interface Runs {
  join(manual: StoredManual, sectionId: string, listener: Listener): Promise<Leave>;
  statusOf(manualId: string, sectionId: string): Promise<SectionStatus>;
  writingSectionIds(manualId: string): Set<string>;
  isWriting(manualId: string): boolean;
}

interface Run {
  text: string;
  progress: number;
  listeners: Set<Listener>;
  controller: AbortController;
  writerFinished: boolean;
  isPlaceholder: boolean;
}

const WRITTEN = "written";
const nothingToLeave: Leave = () => {};

export function createRuns({ store, writer, maxConcurrentRuns }: {
  store: ManualStore;
  writer: SectionWriter;
  maxConcurrentRuns: number;
}): Runs {
  const runs = new Map<string, Run | typeof WRITTEN>();

  async function join(manual: StoredManual, sectionId: string, listener: Listener): Promise<Leave> {
    const key = runKey(manual.id, sectionId);
    const runBefore = runs.get(key);
    if (runBefore !== undefined && runBefore !== WRITTEN) return follow(key, runBefore, listener);

    const storedBody = await store.getBody(manual.id, sectionId);
    if (storedBody !== undefined) return sendWholeBody(listener, storedBody);

    const runAfter = runs.get(key);
    if (runAfter === WRITTEN) return sendWrittenBody(key, manual, sectionId, listener);
    if (runAfter !== undefined) return follow(key, runAfter, listener);

    if (activeRunCount() >= maxConcurrentRuns) {
      listener({ event: "failed", data: { reason: "error" } });
      return nothingToLeave;
    }
    return follow(key, startRun(key, manual, sectionId), listener);
  }

  async function sendWrittenBody(key: string, manual: StoredManual, sectionId: string, listener: Listener): Promise<Leave> {
    const body = await store.getBody(manual.id, sectionId);
    if (body !== undefined) return sendWholeBody(listener, body);
    if (runs.get(key) === WRITTEN) runs.delete(key);
    return join(manual, sectionId, listener);
  }

  function follow(key: string, run: Run, listener: Listener): Leave {
    if (run.text !== "") {
      listener({ event: "append", data: { at: 0, text: run.text, progress: run.progress } });
    }
    run.listeners.add(listener);
    return () => {
      run.listeners.delete(listener);
      if (run.listeners.size === 0 && !run.writerFinished) {
        if (runs.get(key) === run) runs.delete(key);
        run.controller.abort();
      }
    };
  }

  function startRun(key: string, manual: StoredManual, sectionId: string): Run {
    const run: Run = {
      text: "",
      progress: 0,
      listeners: new Set(),
      controller: new AbortController(),
      writerFinished: false,
      isPlaceholder: false,
    };
    runs.set(key, run);
    void writeSection(key, run, manual, sectionId);
    return run;
  }

  async function writeSection(key: string, run: Run, manual: StoredManual, sectionId: string) {
    const signal = run.controller.signal;
    try {
      for await (const chunk of writer.write(manual, sectionId, signal)) {
        const at = run.text.length;
        run.text += chunk.text;
        run.progress = chunk.progress;
        if (chunk.placeholder) run.isPlaceholder = true;
        broadcast(run, { event: "append", data: { at, text: chunk.text, progress: chunk.progress } });
      }
      signal.throwIfAborted();
      run.writerFinished = true;
      if (run.isPlaceholder) {
        runs.delete(key);
      } else {
        await store.saveBody(manual.id, sectionId, run.text);
        runs.set(key, WRITTEN);
      }
      broadcast(run, { event: "written", data: {} });
    } catch (error) {
      if (runs.get(key) === run) runs.delete(key);
      if (signal.aborted) return;
      if (!(error instanceof WriteFailed)) console.error(`Writing ${key} failed:`, error);
      const reason = error instanceof WriteFailed ? error.reason : "error";
      broadcast(run, { event: "failed", data: { reason } });
    }
  }

  async function statusOf(manualId: string, sectionId: string): Promise<SectionStatus> {
    const run = runs.get(runKey(manualId, sectionId));
    if (run !== undefined && run !== WRITTEN) return "writing";
    return (await store.getBody(manualId, sectionId)) === undefined ? "unwritten" : "written";
  }

  function writingSectionIds(manualId: string): Set<string> {
    const prefix = runKey(manualId, "");
    const writing = [...runs].filter(([key, run]) => run !== WRITTEN && key.startsWith(prefix));
    return new Set(writing.map(([key]) => key.slice(prefix.length)));
  }

  function isWriting(manualId: string): boolean {
    return writingSectionIds(manualId).size > 0;
  }

  function activeRunCount(): number {
    return [...runs.values()].filter((run) => run !== WRITTEN).length;
  }

  return { join, statusOf, writingSectionIds, isWriting };
}

function runKey(manualId: string, sectionId: string): string {
  return `${manualId}/${sectionId}`;
}

function broadcast(run: Run, event: SectionEvent) {
  for (const listener of run.listeners) listener(event);
}

function sendWholeBody(listener: Listener, body: string): Leave {
  listener({ event: "append", data: { at: 0, text: body, progress: 1 } });
  listener({ event: "written", data: {} });
  return nothingToLeave;
}
