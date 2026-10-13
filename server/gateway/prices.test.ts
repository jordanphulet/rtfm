import { describe, expect, it } from "vitest";
import { prices } from "./prices.ts";
import { FAKE_MODEL } from "./types.ts";

describe("the price table", () => {
  it("prices the fake model at $0", () => {
    expect(prices.models[FAKE_MODEL]).toEqual({
      input: 0,
      output: 0,
      cacheWrite: 0,
      cacheRead: 0,
      toolUseSystemPromptTokens: 0,
    });
  });

  it("prices every other model's input and output above $0, so none can pass for the fake model", () => {
    const realModels = Object.entries(prices.models).filter(([model]) => model !== FAKE_MODEL);
    expect(realModels.length).toBeGreaterThan(0);
    for (const [model, price] of realModels) {
      expect(price.input, model).toBeGreaterThan(0);
      expect(price.output, model).toBeGreaterThan(0);
    }
  });
});
