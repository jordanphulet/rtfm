import { randomUUID } from "node:crypto";
import type { Logger } from "../logging/logger.ts";
import { ADMIN_LIBRARY_ID, checkedRecipientLibraryId } from "../storage/library.ts";
import type { SettleEntry } from "../storage/types.ts";
import { costUsd, worstCaseCostUsd, type ModelPrice, type PriceTable, type TokenCounts } from "./prices.ts";
import type { LibraryReservation, SpendingLedger } from "./spending-ledger.ts";
import {
  GatewayBusy,
  ModelNotPriced,
  ModelStalled,
  ModelStreamIncomplete,
  SpendingRefused,
  type GatewayConfig,
  type Job,
  type ModelClient,
  type ModelEvent,
  type ModelPrompt,
  type PromptMessage,
} from "./types.ts";

/** A library's way to a model: what the section writer, the librarian and the planner call. */
export interface Gateway {
  stream(job: Job, prompt: ModelPrompt, signal: AbortSignal): AsyncIterable<ModelEvent>;
}

export interface RunningGateway {
  /**
   * The gateway of a library, whose every call is reserved in its name: a recipient library's
   * within its daily cap, besides the caps every library shares.
   */
  forLibrary(libraryId: string): Gateway;
  /** Resolves once no call is running and every call's settle has been written to the spending ledger. */
  idle(): Promise<void>;
}

export interface GatewayDeps {
  /**
   * Both called only once every job's model is in the price table, so an unpriced model is refused
   * before any secret is read.
   */
  createClient: () => ModelClient;
  openSpendingLedger: () => Promise<SpendingLedger>;
  config: GatewayConfig;
  prices: PriceTable;
  logger: Logger;
  now?: () => Date;
}

interface Reservation {
  entry: LibraryReservation;
  maxTokens: number;
  price: ModelPrice;
  inputBound: number;
}

type Outcome = SettleEntry["outcome"];
type UsageEvent = Extract<ModelEvent, { type: "usage" }>;

const REQUEST_FRAMING_TOKENS = 100;
const MESSAGE_FRAMING_TOKENS = 10;
const BLOCK_FRAMING_TOKENS = 10;
const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens"] as const;

export async function createGateway({
  createClient,
  openSpendingLedger,
  config,
  prices,
  logger,
  now = () => new Date(),
}: GatewayDeps): Promise<RunningGateway> {
  for (const { model } of Object.values(config.jobs)) {
    if (!(model in prices.models)) throw new ModelNotPriced(model);
  }
  const spending = await openSpendingLedger();
  const client = createClient();

  let runningCalls = 0;
  const idleWaiters: (() => void)[] = [];

  /**
   * Takes a concurrency slot at once, so calls starting together can't all slip under the limit,
   * then reserves the call's worst case in the spending ledger, which checks the kill switch and
   * the caps.
   */
  async function reserve(libraryId: string, job: Job, prompt: ModelPrompt): Promise<Reservation> {
    if (runningCalls >= config.maxConcurrentCalls) throw new GatewayBusy(config.maxConcurrentCalls);
    runningCalls++;

    const { model, maxTokens } = config.jobs[job];
    const price = prices.models[model]!;
    const inputBound = inputTokenBound(prompt, price.toolUseSystemPromptTokens);
    const worstCaseUsd = worstCaseCostUsd(price, inputBound, maxTokens);
    const entry: LibraryReservation = {
      kind: "reserve",
      callId: randomUUID(),
      reservedAt: now().toISOString(),
      libraryId,
      job,
      model,
      worstCaseUsd,
    };
    try {
      await spending.reserve(entry, config.caps);
    } catch (error) {
      endCall();
      throw error;
    }
    return { entry, maxTokens, price, inputBound };
  }

  function endCall() {
    runningCalls--;
    if (runningCalls === 0) for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function idle(): Promise<void> {
    if (runningCalls === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  async function reserveOrLogRefusal(libraryId: string, job: Job, prompt: ModelPrompt): Promise<Reservation> {
    try {
      return await reserve(libraryId, job, prompt);
    } catch (error) {
      if (error instanceof SpendingRefused || error instanceof GatewayBusy) {
        const reason = error instanceof SpendingRefused ? error.reason : "busy";
        logger.warn("model.refused", error.message, { libraryId, job, model: config.jobs[job].model, reason });
      }
      throw error;
    }
  }

  async function settle(reservation: Reservation, outcome: Outcome, reported: Partial<TokenCounts>, failure: unknown) {
    const outputKnown = outcome === "complete" && reported.outputTokens !== undefined;
    const tokens: TokenCounts = {
      inputTokens: reported.inputTokens ?? reservation.inputBound,
      outputTokens: outputKnown ? reported.outputTokens! : reservation.maxTokens,
      cacheWriteTokens: reported.cacheWriteTokens ?? 0,
      cacheReadTokens: reported.cacheReadTokens ?? 0,
    };
    const usd = costUsd(reservation.price, tokens);
    const estimated = !outputKnown || reported.inputTokens === undefined;
    const { callId, reservedAt, libraryId, job, model } = reservation.entry;
    const at = now().toISOString();
    const durationMs = Date.parse(at) - Date.parse(reservedAt);
    const log = outcome === "failed" ? logger.warn : logger.info;
    const fields = { callId, libraryId, job, model, outcome, ...tokens, usd, estimated, durationMs };
    log("model.call", `${job} call ${outcome}`, fields, failure);
    try {
      await spending.settle(
        { kind: "settle", callId, reservedAt, at, job, model, ...tokens, usd, outcome, estimated },
        reservation.entry,
      );
    } finally {
      endCall();
    }
  }

  async function* stream(
    libraryId: string,
    job: Job,
    prompt: ModelPrompt,
    signal: AbortSignal,
  ): AsyncGenerator<ModelEvent> {
    signal.throwIfAborted();
    const reservation = await reserveOrLogRefusal(libraryId, job, prompt);
    const { maxTokens } = reservation;
    const { model } = reservation.entry;

    const reported: Partial<TokenCounts> = {};
    let stopped = false;
    let outcome: Outcome = "aborted";
    let failure: unknown;
    const cutOff = new AbortController();
    const idleTimeoutMs = config.jobs[job].idleTimeoutMs ?? config.idleTimeoutMs;
    const idle = idleTimer(idleTimeoutMs, () => cutOff.abort(new ModelStalled(idleTimeoutMs)));
    try {
      idle.restart();
      const events = client.stream({ job, model, maxTokens, prompt, signal: AbortSignal.any([signal, cutOff.signal]) });
      for await (const event of events) {
        idle.restart();
        if (event.type === "usage") recordUsage(reported, event);
        if (event.type === "stop") stopped = true;
        yield event;
      }
      if (cutOff.signal.aborted) throw cutOff.signal.reason;
      signal.throwIfAborted();
      if (!stopped) throw new ModelStreamIncomplete();
      outcome = "complete";
    } catch (error) {
      if (cutOff.signal.aborted) {
        outcome = "failed";
        failure = cutOff.signal.reason;
        throw failure;
      }
      outcome = signal.aborted ? "aborted" : "failed";
      if (outcome === "failed") failure = error;
      throw error;
    } finally {
      idle.stop();
      cutOff.abort();
      await settle(reservation, outcome, reported, failure);
    }
  }

  function forLibrary(libraryId: string): Gateway {
    if (libraryId !== ADMIN_LIBRARY_ID) checkedRecipientLibraryId(libraryId);
    return { stream: (job, prompt, signal) => stream(libraryId, job, prompt, signal) };
  }

  return { forLibrary, idle };
}

function inputTokenBound({ system, tools = [], messages }: ModelPrompt, toolUseSystemPromptTokens: number): number {
  const texts = [system, ...messages.map(messageText)];
  if (tools.length > 0) texts.push(JSON.stringify(tools));
  const bytes = texts.reduce((total, text) => total + Buffer.byteLength(text, "utf8"), 0);
  const blocks = messages.reduce((total, { content }) => total + (typeof content === "string" ? 0 : content.length), 0);
  const framing =
    REQUEST_FRAMING_TOKENS + messages.length * MESSAGE_FRAMING_TOKENS + (blocks + tools.length) * BLOCK_FRAMING_TOKENS;
  const toolUseSystemPrompt = tools.length > 0 ? toolUseSystemPromptTokens : 0;
  return bytes + framing + toolUseSystemPrompt;
}

function messageText({ content }: PromptMessage): string {
  return typeof content === "string" ? content : JSON.stringify(content);
}

function recordUsage(reported: Partial<TokenCounts>, event: UsageEvent) {
  for (const field of TOKEN_FIELDS) {
    if (event[field] !== undefined) reported[field] = event[field];
  }
}

function idleTimer(timeoutMs: number, onIdle: () => void) {
  let timer: NodeJS.Timeout | undefined;
  return {
    restart() {
      clearTimeout(timer);
      timer = setTimeout(onIdle, timeoutMs);
    },
    stop() {
      clearTimeout(timer);
    },
  };
}
