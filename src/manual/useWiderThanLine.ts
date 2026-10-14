import { useLayoutEffect, useState, type RefObject } from "react";

/** How far a piece may pass the line before it counts as wider: widths are rounded to whole pixels. */
const ROUNDING_PX = 1;

/**
 * Whether an inline formula has a piece wider than the line it sits in. KaTeX lets a line break
 * only between its pieces (`.katex-base`, after top-level relations and operators), so a piece
 * wider than the line would run past the column. Measured before the first paint, and again when
 * the line or a piece changes size (a narrower window, KaTeX's fonts arriving).
 */
export function useWiderThanLine(ref: RefObject<HTMLElement | null>, html: string | null): boolean {
  const [wider, setWider] = useState(false);
  useLayoutEffect(() => {
    const formula = ref.current;
    if (!formula || html === null) return;
    const line = blockAround(formula);
    const pieces = [...formula.querySelectorAll<HTMLElement>(".katex-base")];
    const measure = () => setWider(widest(pieces) > contentWidth(line) + ROUNDING_PX);
    measure();
    const observer = new ResizeObserver(measure);
    for (const element of [line, ...pieces]) observer.observe(element);
    return () => observer.disconnect();
  }, [ref, html]);
  return wider;
}

/** The nearest box around the formula that its lines are laid out in. */
function blockAround(formula: HTMLElement): HTMLElement {
  let element = formula.parentElement!;
  while (["inline", "contents"].includes(getComputedStyle(element).display) && element.parentElement) {
    element = element.parentElement;
  }
  return element;
}

function widest(pieces: HTMLElement[]): number {
  return Math.max(0, ...pieces.map((piece) => piece.getBoundingClientRect().width));
}

function contentWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}
