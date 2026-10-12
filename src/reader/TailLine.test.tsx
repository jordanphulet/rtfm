// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { TailLine } from "./TailLine";
import { click, render } from "../testing";

const BELOW_THE_FOLD = { bottom: window.innerHeight + 100 } as DOMRect;

let scrollBy: MockInstance;

beforeEach(() => {
  scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(BELOW_THE_FOLD);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function followButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(".follow")!;
}

describe("TailLine", () => {
  it("doesn't scroll until Follow is pressed", () => {
    render(<TailLine progress={0.5} textLength={100} />);
    render(<TailLine progress={0.6} textLength={200} />);
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it("keeps the line in view as the text grows, even while progress stays the same", () => {
    render(<TailLine progress={0.99} textLength={100} />);
    click(followButton());
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(followButton().getAttribute("aria-pressed")).toBe("true");

    render(<TailLine progress={0.99} textLength={180} />);
    render(<TailLine progress={0.99} textLength={260} />);
    expect(scrollBy).toHaveBeenCalledTimes(3);
    expect(scrollBy).toHaveBeenLastCalledWith({ top: 100 + 24, behavior: "instant" });
  });

  it.each([
    ["an upward wheel scroll", () => window.dispatchEvent(new WheelEvent("wheel", { deltaY: -10 }))],
    ["a touch scroll", () => window.dispatchEvent(new Event("touchmove"))],
    ["PageUp", () => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }))],
    ["a second press", () => followButton().click()],
  ])("stops following on %s", (_name, stop) => {
    render(<TailLine progress={0.5} textLength={100} />);
    click(followButton());
    act(() => {
      stop();
    });
    expect(followButton().getAttribute("aria-pressed")).toBe("false");
    render(<TailLine progress={0.5} textLength={200} />);
    expect(scrollBy).toHaveBeenCalledTimes(1);
  });

  it("keeps following on a downward scroll", () => {
    render(<TailLine progress={0.5} textLength={100} />);
    click(followButton());
    act(() => {
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: 10 }));
    });
    expect(followButton().getAttribute("aria-pressed")).toBe("true");
  });

  it("lights its lamp only while waiting for the first words", () => {
    render(<TailLine progress={0} textLength={0} />);
    expect(document.querySelector(".tail-line")!.hasAttribute("data-live")).toBe(true);
    render(<TailLine progress={0.1} textLength={20} />);
    expect(document.querySelector(".tail-line")!.hasAttribute("data-live")).toBe(false);
  });
});
