import { useEffect, type RefObject } from "react";

export function useDismissOutside(
  active: boolean,
  region: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const dismissIfOutside = (event: Event) => {
      if (!region.current?.contains(event.target as Node)) onDismiss();
    };
    document.addEventListener("pointerdown", dismissIfOutside);
    document.addEventListener("focusin", dismissIfOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissIfOutside);
      document.removeEventListener("focusin", dismissIfOutside);
    };
  }, [active, region, onDismiss]);
}
