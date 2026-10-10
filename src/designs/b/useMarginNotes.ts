import { useLayoutEffect, type RefObject } from "react";

const NOTE_GAP = 16;
const NOTE_RAISE = 4;
const WIDE_BLOCKS = ":scope > pre, :scope > .table-scroll";
const SIDENOTE_WIDTHS = "(min-width: 1024px)";

export function useMarginNotes(bodyRef: RefObject<HTMLElement | null>, text: string, isWriting: boolean) {
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => placeNotes(body));
    observer.observe(body);
    return () => observer.disconnect();
  }, [bodyRef]);

  useLayoutEffect(() => {
    if (bodyRef.current) placeNotes(bodyRef.current);
  }, [bodyRef, text, isWriting]);
}

function placeNotes(body: HTMLElement) {
  const prose = body.firstElementChild;
  if (!prose || !window.matchMedia(SIDENOTE_WIDTHS).matches) return;

  const origin = prose.getBoundingClientRect().top;
  const wideBlocks = [...prose.querySelectorAll(WIDE_BLOCKS)].map((block) => {
    const rect = block.getBoundingClientRect();
    return { top: rect.top - origin, bottom: rect.bottom - origin };
  });
  const notes = [...prose.querySelectorAll<HTMLAnchorElement>("a[data-footnote-ref]")].flatMap((reference) => {
    const note = document.getElementById(reference.hash.slice(1));
    if (!note) return [];
    return [{ note, wanted: reference.getBoundingClientRect().top - origin - NOTE_RAISE, height: note.offsetHeight }];
  });

  let floor = 0;
  const tops = notes.map(({ wanted, height }) => {
    let top = Math.max(wanted, floor);
    for (const block of wideBlocks) {
      if (top < block.bottom && top + height > block.top) top = block.bottom + NOTE_GAP;
    }
    floor = top + height + NOTE_GAP;
    return top;
  });

  notes.forEach(({ note }, index) => note.style.setProperty("--note-top", `${tops[index]}px`));
}
