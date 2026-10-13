import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Logger } from "../logging/logger.ts";
import type { SettleEntry, UsageLedger } from "../storage/types.ts";
import { monthOf } from "../storage/file-ledger.ts";
import { callsFrom, chargedUsd, dayOf } from "./ledger-calls.ts";
import { costUsd, worstCaseCostUsd, type ModelPrice, type PriceTable, type TokenCounts } from "./prices.ts";
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

export interface Gateway {
  stream(job: Job, prompt: ModelPrompt, signal: AbortSignal): AsyncIterable<ModelEvent>;
}

export interface RunningGateway extends Gateway {
  /** Resolves once no call is running and every call's settle has been written to the ledger. */
  idle(): Promise<void>;
}

export interface GatewayDeps {
  /** Called only once every job's model is in the price table, so an unpriced model is refused before any secret is read. */
  createClient: () => ModelClient;
  ledger: UsageLedger;
  config: GatewayConfig;
  prices: PriceTable;
  dataDir: string;
  logger: Logger;
  now?: () => Date;
}

interface Reservation {
  callId: string;
  reservedAt: string;
  job: Job;
  model: string;
  maxTokens: number;
  price: ModelPrice;
  inputBound: number;
  worstCaseUsd: number;
}

type Outcome = SettleEntry["outcome"];
type UsageEvent = Extract<ModelEvent, { type: "usage" }>;

const REQUEST_FRAMING_TOKENS = 100;
const MESSAGE_FRAMING_TOKENS = 10;
const BLOCK_FRAMING_TOKENS = 10;
const TOKEN_FIELDS = ["inputTokens", "outputTokens", "cacheWriteTokens", "cacheReadTokens"] as const;

export function killSwitchPath(dataDir: string): string {
  return path.join(dataDir, "STOP");
}

export async function createGateway({
  createClient,
  ledger,
  config,
  prices,
  dataDir,
  logger,
  now = () => new Date(),
}: GatewayDeps): Promise<RunningGateway> {
  for (const { model } of Object.values(config.jobs)) {
    if (!(model in prices.models)) throw new ModelNotPriced(model);
  }
  const client = createClient();

  const committedUsd = new Map<string, number>();
  let runningCalls = 0;
  const idleWaiters: (() => void)[] = [];

  for (const call of callsFrom(await ledger.entriesForMonth(monthOf(now().toISOString())))) {
    commit(call.reservedAt, chargedUsd(call));
  }

  function commit(reservedAt: string, usd: number) {
    for (const period of [dayOf(reservedAt), monthOf(reservedAt)]) {
      committedUsd.set(period, (committedUsd.get(period) ?? 0) + usd);
    }
  }

  function wouldCross(period: string, worstCaseUsd: number, capUsd: number): boolean {
    return (committedUsd.get(period) ?? 0) + worstCaseUsd > capUsd;
  }

  function reserve(job: Job, prompt: ModelPrompt): Reservation {
    if (existsSync(killSwitchPath(dataDir))) throw new SpendingRefused("kill-switch");
    if (runningCalls >= config.maxConcurrentCalls) throw new GatewayBusy(config.maxConcurrentCalls);

    const { model, maxTokens } = config.jobs[job];
    const price = prices.models[model]!;
    const inputBound = inputTokenBound(prompt, price.toolUseSystemPromptTokens);
    const worstCaseUsd = worstCaseCostUsd(price, inputBound, maxTokens);
    const reservedAt = now().toISOString();
    if (wouldCross(dayOf(reservedAt), worstCaseUsd, config.caps.dailyUsd)) throw new SpendingRefused("daily-cap");
    if (wouldCross(monthOf(reservedAt), worstCaseUsd, config.caps.monthlyUsd)) throw new SpendingRefused("monthly-cap");

    commit(reservedAt, worstCaseUsd);
    runningCalls++;
    return { callId: randomUUID(), reservedAt, job, model, maxTokens, price, inputBound, worstCaseUsd };
  }

  function release(reservation: Reservation, usd: number) {
    commit(reservation.reservedAt, usd - reservation.worstCaseUsd);
    runningCalls--;
    if (runningCalls === 0) for (const resolve of idleWaiters.splice(0)) resolve();
  }

  function idle(): Promise<void> {
    if (runningCalls === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.push(resolve));
  }

  function reserveOrLogRefusal(job: Job, prompt: ModelPrompt): Reservation {
    try {
      return reserve(job, prompt);
    } catch (error) {
      const reason = error instanceof SpendingRefused ? error.reason : "busy";
      logger.warn("model.refused", (error as Error).message, { job, model: config.jobs[job].model, reason });
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
    const { callId, reservedAt, job, model } = reservation;
    const at = now().toISOString();
    const durationMs = Date.parse(at) - Date.parse(reservedAt);
    const log = outcome === "failed" ? logger.warn : logger.info;
    const fields = { callId, job, model, outcome, ...tokens, usd, estimated, durationMs };
    log("model.call", `${job} call ${outcome}`, fields, failure);
    try {
      await ledger.append({
        kind: "settle",
        callId,
        reservedAt,
        at,
        job,
        model,
        ...tokens,
        usd,
        outcome,
        estimated,
      });
    } finally {
      release(reservation, usd);
    }
  }

  async function* stream(job: Job, prompt: ModelPrompt, signal: AbortSignal): AsyncGenerator<ModelEvent> {
    signal.throwIfAborted();
    const reservation = reserveOrLogRefusal(job, prompt);
    const { callId, reservedAt, model, maxTokens, worstCaseUsd } = reservation;
    try {
      await ledger.append({ kind: "reserve", callId, reservedAt, job, model, worstCaseUsd });
    } catch (error) {
      release(reservation, 0);
      throw error;
    }

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

  return { stream, idle };
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
