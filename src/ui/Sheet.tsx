import { useEffect, useLayoutEffect, useRef, type ComponentProps, type RefObject } from "react";
import "./sheet.css";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export interface SheetProps extends Omit<ComponentProps<"div">, "ref"> {
  open: boolean;
  onClose: () => void;
  focusScope?: RefObject<HTMLElement | null>;
  focusOnOpen?: (sheet: HTMLDivElement) => HTMLElement | null;
}

export function Sheet({ open, onClose, focusScope, focusOnOpen, className, children, ...props }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!open || !sheet) return;
    (focusOnOpen?.(sheet) ?? focusableIn(sheet)[0])?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    const scope = focusScope?.current ?? sheetRef.current;
    if (!open || !scope) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab") keepFocusInside(event, scope);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, focusScope]);

  return (
    <div
      {...props}
      ref={sheetRef}
      className={className ? `sheet ${className}` : "sheet"}
      data-open={open || undefined}
      inert={!open}
    >
      {children}
    </div>
  );
}

function focusableIn(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(isVisible);
}

function isVisible(element: HTMLElement): boolean {
  return element.checkVisibility?.({ visibilityProperty: true }) ?? element.getClientRects().length > 0;
}

function keepFocusInside(event: KeyboardEvent, container: HTMLElement) {
  const focusable = focusableIn(container);
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = document.activeElement;
  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}
