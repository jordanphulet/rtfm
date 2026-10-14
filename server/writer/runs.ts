import { setTimeout as sleep } from "node:timers/promises";
import type { SectionEvent, SectionStatus } from "../api/types.ts";
import type { Logger } from "../logging/logger.ts";
import { createInProcessLeases } from "../storage/in-process-leases.ts";
import type { ManualStore, SectionLease, SectionLeases, StoredManual } from "../storage/types.ts";
import { WriteFailed, type SectionWriter } from "./types.ts";

export type Listener = (event: SectionEvent) => void;
export type Leave = () => void;

export interface Runs {
  join(manual: StoredManual, sectionId: string, listener: Listener): Promise<Leave>;
  statusOf(manualId: string, sectionId: string): Promise<SectionStatus>;
  /** The sections of a manual being written here or in another environment. */
  writingSectionIds(manualId: string): Promise<Set<string>>;
  isWriting(manualId: string): Promise<boolean>;
}

/**
 * How a run waits while another environment holds its section's lease: how often it looks for the
 * body or a free lease, and how long it waits in all (`server/writer/README.md` › Another environment).
 */
export interface Waiting {
  pollEveryMs: number;
  limitMs: number;
}

export const WAITING: Waiting = { pollEveryMs: 1_000, limitMs: 120_000 };

interface Run {
  manualId: string;
  sectionId: string;
  startedAt: number;
  text: string;
  progress: number;
  listeners: Set<Listener>;
  controller: AbortController;
  /** Set once the run has its body, so its last reader leaving no longer aborts it. */
  finished: boolean;
  isPlaceholder: boolean;
}

const WRITTEN = "written";
const nothingToLeave: Leave = () => {};

export function createRuns({
  store,
  writer,
  maxConcurrentRuns,
  logger,
  leases = createInProcessLeases(store),
  waiting = WAITING,
}: {
  store: ManualStore;
  writer: SectionWriter;
  maxConcurrentRuns: number;
  logger: Logger;
  leases?: SectionLeases;
  waiting?: Waiting;
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
      if (run.listeners.size === 0 && !run.finished) {
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
      finished: false,
      isPlaceholder: false,
    };
    runs.set(key, run);
    logger.info("section.started", `Started ${key}`, sectionFields(run));
    void runSection(key, run, manual);
    return run;
  }

  async function runSection(key: string, run: Run, manual: StoredManual) {
    let lease: SectionLease | undefined;
    try {
      const leaseOrBody = await takeLeaseOrWaitForBody(key, run);
      if (typeof leaseOrBody === "string") return receiveBody(key, run, leaseOrBody);
      lease = leaseOrBody;
      await writeSection(key, run, manual, lease);
    } catch (error) {
      endWithoutBody(key, run, lease?.lost.aborted ? lease.lost.reason : error);
    } finally {
      if (lease) await release(key, run, lease);
    }
  }

  /**
   * The section's lease, or the body another environment stored while this run waited for it.
   * While another environment holds the lease, the run looks again every `pollEveryMs`, and takes
   * the lease over once it is released or expires without a body.
   */
  async function takeLeaseOrWaitForBody(key: string, run: Run): Promise<SectionLease | string> {
    const { manualId, sectionId } = run;
    const giveUpAt = performance.now() + waiting.limitMs;
    let waited = false;
    for (;;) {
      const lease = await leases.take(manualId, sectionId);
      if (lease) {
        if (waited) logger.info("section.taken-over", `Took over ${key} from another environment`, runFields(run));
        return lease;
      }
      const body = await store.getBody(manualId, sectionId);
      if (body !== undefined) return body;
      if (!waited) logger.info("section.waiting", `Waiting for another environment writing ${key}`, sectionFields(run));
      waited = true;
      if (performance.now() >= giveUpAt) {
        throw new Error(`Another environment held ${key} for longer than ${waiting.limitMs}ms`);
      }
      await sleep(waiting.pollEveryMs, undefined, { signal: run.controller.signal });
    }
  }

  async function writeSection(key: string, run: Run, manual: StoredManual, lease: SectionLease) {
    const signal = AbortSignal.any([run.controller.signal, lease.lost]);
    for await (const chunk of writer.write(manual, run.sectionId, signal)) {
      const at = run.text.length;
      run.text += chunk.text;
      run.progress = chunk.progress;
      if (chunk.placeholder) run.isPlaceholder = true;
      broadcast(run, { event: "append", data: { at, text: chunk.text, progress: chunk.progress } });
    }
    signal.throwIfAborted();
    run.finished = true;
    if (run.isPlaceholder) {
      runs.delete(key);
    } else {
      await lease.saveBody(run.text);
      runs.set(key, WRITTEN);
    }
    logger.info("section.finished", `Finished ${key}`, { ...runFields(run), placeholder: run.isPlaceholder });
    broadcast(run, { event: "written", data: {} });
  }

  function receiveBody(key: string, run: Run, body: string) {
    run.finished = true;
    run.text = body;
    runs.set(key, WRITTEN);
    logger.info("section.finished", `Finished ${key}, written by another environment`, {
      ...runFields(run),
      placeholder: false,
      elsewhere: true,
    });
    broadcast(run, { event: "append", data: { at: 0, text: body, progress: 1 } });
    broadcast(run, { event: "written", data: {} });
  }

  function endWithoutBody(key: string, run: Run, error: unknown) {
    if (runs.get(key) === run) runs.delete(key);
    if (run.controller.signal.aborted) {
      logger.info("section.aborted", `Aborted ${key}: every reader left`, runFields(run));
      return;
    }
    const reason = error instanceof WriteFailed ? error.reason : "error";
    const fields = { ...runFields(run), reason };
    if (reason === "budget") logger.warn("section.failed", `Writing ${key} was refused by the budget`, fields);
    else logger.error("section.failed", `Writing ${key} failed`, fields, error);
    broadcast(run, { event: "failed", data: { reason } });
  }

  /** A lease that can't be released is left to expire. */
  async function release(key: string, run: Run, lease: SectionLease) {
    try {
      await lease.release();
    } catch (error) {
      logger.warn("section.release-failed", `Couldn't release the lease on ${key}`, sectionFields(run), error);
    }
  }

  async function statusOf(manualId: string, sectionId: string): Promise<SectionStatus> {
    const run = runs.get(runKey(manualId, sectionId));
    if (run !== undefined && run !== WRITTEN) return "writing";
    return (await store.getBody(manualId, sectionId)) === undefined ? "unwritten" : "written";
  }

  async function writingSectionIds(manualId: string): Promise<Set<string>> {
    const prefix = runKey(manualId, "");
    const runsHere = [...runs].filter(([key, run]) => run !== WRITTEN && key.startsWith(prefix));
    const writingHere = runsHere.map(([key]) => key.slice(prefix.length));
    return new Set([...writingHere, ...(await leases.heldElsewhere(manualId))]);
  }

  async function isWriting(manualId: string): Promise<boolean> {
    return (await writingSectionIds(manualId)).size > 0;
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
