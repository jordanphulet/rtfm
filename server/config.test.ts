import { describe, expect, it } from "vitest";
import { config } from "./config.ts";
import { GatewayBusy, type Job, type ModelClient, type Prompt } from "./gateway/types.ts";
import { collect, tempDataDir, testGateway, waitUntil } from "./testing.ts";

const PROMPT: Prompt = { system: "", messages: [{ role: "user", content: "" }] };

describe("committed config", () => {
  it("leaves room for a librarian turn and a plan while every section run is writing", async () => {
    const dataDir = await tempDataDir();
    let calls = 0;
    const answersOnlyAnAbort: ModelClient = {
      async *stream({ signal }) {
        calls++;
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
      },
    };
    const { gateway } = await testGateway(answersOnlyAnAbort, dataDir, { config });
    const controller = new AbortController();
    const start = (job: Job) => collect(gateway.stream(job, PROMPT, controller.signal));

    const running = [
      ...Array.from({ length: config.maxConcurrentRuns }, () => start("write-section")),
      start("librarian"),
      start("plan-manual"),
    ];
    await waitUntil(() => calls === config.maxConcurrentRuns + 2);
    await expect(start("librarian")).rejects.toThrow(GatewayBusy);

    controller.abort();
    await Promise.allSettled(running);
    await gateway.idle();
  });
});
