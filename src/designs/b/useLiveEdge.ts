import { useLayoutEffect, useRef, type RefObject } from "react";

export function useLiveEdge(bodyRef: RefObject<HTMLElement | null>, text: string): RefObject<number> {
  const edgeRef = useRef(0);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(() => markLiveEdge(body, edgeRef));
    observer.observe(body);
    return () => observer.disconnect();
  }, [bodyRef]);

  useLayoutEffect(() => {
    if (bodyRef.current) markLiveEdge(bodyRef.current, edgeRef);
  }, [bodyRef, text]);

  return edgeRef;
}

function markLiveEdge(body: HTMLElement, edgeRef: RefObject<number>) {
  const { blockTop, edge } = liveBlockOf(body);
  edgeRef.current = edge;
  body.style.setProperty("--live-edge", `${edge}px`);
  body.style.setProperty("--live-block-top", `${blockTop}px`);
}

function liveBlockOf(body: HTMLElement): { blockTop: number; edge: number } {
  const content = body.firstElementChild;
  if (!content) return { blockTop: 0, edge: 0 };
  const blocks = [...content.children].filter((child) => !child.matches(".footnotes"));
  const block = (blocks.at(-1) ?? content).getBoundingClientRect();
  const origin = body.getBoundingClientRect().top;
  return { blockTop: block.top - origin, edge: block.bottom - origin };
}
