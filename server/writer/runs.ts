import type { SectionEvent, SectionStatus } from "../api/types.ts";
import type { Logger } from "../logging/logger.ts";
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
  manualId: string;
  sectionId: string;
  startedAt: number;
  text: string;
  progress: number;
  listeners: Set<Listener>;
  controller: AbortController;
  writerFinished: boolean;
  isPlaceholder: boolean;
}

const WRITTEN = "written";
const nothingToLeave: Leave = () => {};

export function createRuns({ store, writer, maxConcurrentRuns, logger }: {
  store: ManualStore;
  writer: SectionWriter;
  maxConcurrentRuns: number;
  logger: Logger;
}): Runs {
  const runs = new Map<string, Run | typeof WRITTEN>();

  async function join(manual: StoredManual, sectionId: string, listener: Listener): Promise<Leave> {
    const key = runKey(manual.id, sectionId);
    const runBefore = runs.get(key);
    if (runBefore !== undefined && runBefore !== WRITTEN) return joinRun(key, runBefore, listener);

    const storedBody = await store.getBody(manual.id, sectionId);
    if (storedBody !== undefined) return sendWholeBody(listener, storedBody);

    const runAfter = runs.get(key);
    if (runAfter === WRITTEN) return sendWrittenBody(key, manual, sectionId, listener);
    if (runAfter !== undefined) return joinRun(key, runAfter, listener);

    const activeRuns = activeRunCount();
    if (activeRuns >= maxConcurrentRuns) {
      logger.warn("section.refused", `Refused ${key}: ${activeRuns} sections are already being written`, {
        manualId: manual.id,
        sectionId,
        activeRuns,
      });
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

  function joinRun(key: string, run: Run, listener: Listener): Leave {
    logger.info("section.joined", `Joined ${key}`, {
      ...sectionFields(run),
      listeners: run.listeners.size + 1,
      backlogCharacters: run.text.length,
    });
    return follow(key, run, listener);
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
      manualId: manual.id,
      sectionId,
      startedAt: performance.now(),
      text: "",
      progress: 0,
      listeners: new Set(),
      controller: new AbortController(),
      writerFinished: false,
      isPlaceholder: false,
    };
    runs.set(key, run);
    logger.info("section.started", `Started ${key}`, sectionFields(run));
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
      logger.info("section.finished", `Finished ${key}`, { ...runFields(run), placeholder: run.isPlaceholder });
      broadcast(run, { event: "written", data: {} });
    } catch (error) {
      if (runs.get(key) === run) runs.delete(key);
      if (signal.aborted) {
        logger.info("section.aborted", `Aborted ${key}: every reader left`, runFields(run));
        return;
      }
      const reason = error instanceof WriteFailed ? error.reason : "error";
      const fields = { ...runFields(run), reason };
      if (reason === "budget") logger.warn("section.failed", `Writing ${key} was refused by the budget`, fields);
      else logger.error("section.failed", `Writing ${key} failed`, fields, error);
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

function sectionFields({ manualId, sectionId }: Run) {
  return { manualId, sectionId };
}

/** The run's ids, how much it wrote and how long it took. */
function runFields(run: Run) {
  const durationMs = Math.round(performance.now() - run.startedAt);
  return { ...sectionFields(run), characters: run.text.length, durationMs };
}

function broadcast(run: Run, event: SectionEvent) {
  for (const listener of run.listeners) listener(event);
}

function sendWholeBody(listener: Listener, body: string): Leave {
  listener({ event: "append", data: { at: 0, text: body, progress: 1 } });
  listener({ event: "written", data: {} });
  return nothingToLeave;
}
