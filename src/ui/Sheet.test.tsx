// @vitest-environment happy-dom
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { press, render } from "../testing";
import { Sheet } from "./Sheet";

function byText(text: string): HTMLElement {
  const element = [...document.querySelectorAll<HTMLElement>("a, button")].find((item) => item.textContent === text);
  if (!element) throw new Error(`Nothing reads "${text}"`);
  return element;
}

function SheetWithHiddenEdges({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose}>
      <a href="/hidden-first" style={{ display: "none" }}>
        Hidden first
      </a>
      <button type="button">First</button>
      <button type="button">Last</button>
      <span style={{ display: "none" }}>
        <button type="button">Hidden last</button>
      </span>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("focuses its first visible focusable on open, skipping hidden ones", () => {
    render(<SheetWithHiddenEdges open onClose={() => {}} />);
    expect(document.activeElement).toBe(byText("First"));
  });

  it("focuses what focusOnOpen returns instead", () => {
    render(
      <Sheet open onClose={() => {}} focusOnOpen={(sheet) => sheet.querySelector("[aria-current]")}>
        <button type="button">First</button>
        <button type="button" aria-current="page">
          Current
        </button>
      </Sheet>,
    );
    expect(document.activeElement).toBe(byText("Current"));
  });

  it("wraps Tab and Shift+Tab between its visible edges", () => {
    render(<SheetWithHiddenEdges open onClose={() => {}} />);

    byText("Last").focus();
    expect(press("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byText("First"));

    expect(press("Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byText("Last"));
  });

  it("leaves Tab alone between its edges", () => {
    render(<SheetWithHiddenEdges open onClose={() => {}} />);
    byText("First").focus();
    expect(press("Tab").defaultPrevented).toBe(false);
  });

  it("pulls focus back inside when it has left", () => {
    render(
      <>
        <button type="button">Outside</button>
        <SheetWithHiddenEdges open onClose={() => {}} />
      </>,
    );
    byText("Outside").focus();
    press("Tab");
    expect(document.activeElement).toBe(byText("First"));
  });

  it("keeps Tab within a wider focus scope", () => {
    function ScopedSheet() {
      const scopeRef = useRef<HTMLDivElement>(null);
      return (
        <div ref={scopeRef}>
          <button type="button">Toggle</button>
          <Sheet open onClose={() => {}} focusScope={scopeRef}>
            <button type="button">Inside</button>
          </Sheet>
        </div>
      );
    }
    render(<ScopedSheet />);
    byText("Inside").focus();
    press("Tab");
    expect(document.activeElement).toBe(byText("Toggle"));
  });

  it("calls onClose on Escape while open, and not while closed", () => {
    const onClose = vi.fn();
    render(<SheetWithHiddenEdges open onClose={onClose} />);
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    render(<SheetWithHiddenEdges open={false} onClose={onClose} />);
    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("in a browser without checkVisibility", () => {
    const checkVisibility = Element.prototype.checkVisibility;

    function laidOut(this: Element): DOMRectList {
      const isHidden = this.closest("[style*='display: none']") !== null;
      return (isHidden ? [] : [new DOMRect()]) as unknown as DOMRectList;
    }

    afterEach(() => {
      Element.prototype.checkVisibility = checkVisibility;
      vi.restoreAllMocks();
    });

    it("tells visible elements by their layout boxes", () => {
      Object.assign(Element.prototype, { checkVisibility: undefined });
      vi.spyOn(Element.prototype, "getClientRects").mockImplementation(laidOut);
      render(<SheetWithHiddenEdges open onClose={() => {}} />);
      expect(document.activeElement).toBe(byText("First"));

      byText("Last").focus();
      press("Tab");
      expect(document.activeElement).toBe(byText("First"));
    });
  });

  it("is inert while closed", () => {
    render(<SheetWithHiddenEdges open={false} onClose={() => {}} />);
    const sheet = document.querySelector(".sheet")!;
    expect(sheet.hasAttribute("inert")).toBe(true);
    expect(sheet.hasAttribute("data-open")).toBe(false);
  });
});
