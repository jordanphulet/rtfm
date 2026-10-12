import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = "";
});

export function render(element: ReactNode) {
  if (!root) root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(element));
}

export function press(key: string, options: KeyboardEventInit & { on?: Element } = {}): KeyboardEvent {
  const { on = document.activeElement ?? document.body, ...init } = options;
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  act(() => {
    on.dispatchEvent(event);
  });
  return event;
}

export function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
  });
}
