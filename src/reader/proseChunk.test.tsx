// @vitest-environment happy-dom
import { act, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { loadProse, useProse } from "./proseChunk";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function ProseName() {
  return useProse().name;
}

describe("the Prose chunk", () => {
  it("suspends until the chunk arrives, then renders Prose", async () => {
    const container = document.body.appendChild(document.createElement("div"));
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <Suspense fallback="Waiting">
          <ProseName />
        </Suspense>,
      ),
    );
    expect(container.textContent).toBe("Waiting");

    await act(async () => {
      await loadProse();
    });
    expect(container.textContent).toBe("Prose");
    act(() => root.unmount());
  });

  it("asks again after a load fails", async () => {
    vi.resetModules();
    vi.doMock("./Prose", () => {
      throw new Error("The chunk didn't load");
    });
    const chunk = await import("./proseChunk");
    await expect(chunk.loadProse()).rejects.toThrow();

    vi.doUnmock("./Prose");
    vi.resetModules();
    await expect(chunk.loadProse()).resolves.toHaveProperty("Prose");
  });
});
