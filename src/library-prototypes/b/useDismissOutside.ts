import { useEffect, type RefObject } from "react";

export function useDismissOutside(
  active: boolean,
  region: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const isOutside = (event: Event) => !region.current?.contains(event.target as Node);
    const onPointerDown = (event: PointerEvent) => {
      if (!isOutside(event)) return;
      swallowClickOfThisGesture();
      onDismiss();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (isOutside(event)) onDismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [active, region, onDismiss]);
}

function swallowClickOfThisGesture() {
  const gesture = new AbortController();
  const options = { capture: true, signal: gesture.signal };
  const end = () => gesture.abort();
  window.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      end();
    },
    options,
  );
  window.addEventListener("pointercancel", end, options);
  queueMicrotask(() => window.addEventListener("pointerdown", end, options));
}
