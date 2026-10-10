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
  edgeRef.current = liveEdgeOf(body);
  body.style.setProperty("--live-edge", `${edgeRef.current}px`);
}

function liveEdgeOf(body: HTMLElement): number {
  const content = body.firstElementChild;
  if (!content) return 0;
  const blocks = [...content.children].filter((child) => !child.matches(".footnotes"));
  const lastBlock = blocks.at(-1) ?? content;
  return lastBlock.getBoundingClientRect().bottom - body.getBoundingClientRect().top;
}
