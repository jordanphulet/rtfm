import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

const NEAR_BOTTOM_PX = 24;

export interface StickToBottom {
  scrollRef: RefObject<HTMLDivElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  scrolledUp: boolean;
  scrolledFromTop: boolean;
  scrollToBottom: () => void;
}

/**
 * Keeps a scroll region at its bottom while its content grows, but only if it was at the bottom
 * before the growth. Scrolling up (more than NEAR_BOTTOM_PX from the end) releases it; returning
 * to the bottom, or scrollToBottom(), holds it again.
 */
export function useStickToBottom(): StickToBottom {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [scrolledFromTop, setScrolledFromTop] = useState(false);

  const scrollToBottom = useCallback(() => {
    atBottom.current = true;
    setScrolledUp(false);
    const scroller = scrollRef.current;
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    let lastTop = scroller.scrollTop;
    const onScroll = () => {
      const top = scroller.scrollTop;
      const distance = scroller.scrollHeight - top - scroller.clientHeight;
      if (distance <= NEAR_BOTTOM_PX) atBottom.current = true;
      else if (top < lastTop) atBottom.current = false;
      lastTop = top;
      setScrolledUp(!atBottom.current);
      setScrolledFromTop(top > 0);
    };
    const observer = new ResizeObserver(() => {
      if (atBottom.current) scroller.scrollTop = scroller.scrollHeight;
    });

    scroller.addEventListener("scroll", onScroll, { passive: true });
    observer.observe(scroller);
    observer.observe(content);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return { scrollRef, contentRef, scrolledUp, scrolledFromTop, scrollToBottom };
}
