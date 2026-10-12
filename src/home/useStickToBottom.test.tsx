// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../testing";
import { useStickToBottom, type StickToBottom } from "./useStickToBottom";

const VIEW_HEIGHT = 200;

let stick: StickToBottom;
let resized: () => void;
let contentHeight: number;
let top: number;

function Log() {
  stick = useStickToBottom();
  return (
    <div ref={stick.scrollRef}>
      <div ref={stick.contentRef} />
    </div>
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  contentHeight = 1000;
  top = contentHeight - VIEW_HEIGHT;
  render(<Log />);
  const scroller = stick.scrollRef.current!;
  Object.defineProperties(scroller, {
    scrollHeight: { get: () => contentHeight },
    clientHeight: { get: () => VIEW_HEIGHT },
    scrollTop: { get: () => top, set: (value: number) => (top = Math.min(value, contentHeight - VIEW_HEIGHT)) },
  });
  userScrollsTo(top);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function userScrollsTo(position: number) {
  top = position;
  act(() => {
    stick.scrollRef.current!.dispatchEvent(new Event("scroll"));
  });
}

function grow(by: number) {
  contentHeight += by;
  act(() => resized());
}

describe("useStickToBottom", () => {
  it("follows the content as it grows while at the bottom", () => {
    grow(100);
    expect(top).toBe(900);
    expect(stick.scrolledUp).toBe(false);
  });

  it("never pulls you down once you've scrolled up, even after scrolling down short of the bottom", () => {
    userScrollsTo(500);
    grow(100);
    expect(top).toBe(500);
    expect(stick.scrolledUp).toBe(true);

    userScrollsTo(600);
    grow(100);
    expect(top).toBe(600);
    expect(stick.scrolledUp).toBe(true);
  });

  it("follows again once you're back within 24px of the bottom", () => {
    userScrollsTo(500);
    userScrollsTo(contentHeight - VIEW_HEIGHT - 24);
    grow(100);
    expect(top).toBe(contentHeight - VIEW_HEIGHT);
    expect(stick.scrolledUp).toBe(false);
  });

  it("follows again after scrollToBottom", () => {
    userScrollsTo(500);
    act(() => stick.scrollToBottom());
    expect(top).toBe(800);
    grow(100);
    expect(top).toBe(900);
    expect(stick.scrolledUp).toBe(false);
  });
});
