import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const AT_BOTTOM_PX = 8;

export function useStickToBottom(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
) {
  const atBottom = useRef(true);
  const [behind, setBehind] = useState(false);

  useEffect(() => {
    const scrollerElement = scroller.current;
    const contentElement = content.current;
    if (!scrollerElement || !contentElement) return;

    const distanceFromBottom = () =>
      scrollerElement.scrollHeight - scrollerElement.scrollTop - scrollerElement.clientHeight;
    const showWhetherBehind = () =>
      setBehind(!atBottom.current && distanceFromBottom() > AT_BOTTOM_PX);

    const onScroll = () => {
      atBottom.current = distanceFromBottom() <= AT_BOTTOM_PX;
      showWhetherBehind();
    };
    const onResize = () => {
      if (atBottom.current) scrollerElement.scrollTop = scrollerElement.scrollHeight;
      showWhetherBehind();
    };

    const observer = new ResizeObserver(onResize);
    observer.observe(contentElement);
    observer.observe(scrollerElement);
    scrollerElement.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      scrollerElement.removeEventListener("scroll", onScroll);
    };
  }, [scroller, content]);

  const scrollToBottom = useCallback(() => {
    const scrollerElement = scroller.current;
    if (!scrollerElement) return;
    atBottom.current = true;
    scrollerElement.scrollTop = scrollerElement.scrollHeight;
    setBehind(false);
  }, [scroller]);

  const release = useCallback(() => {
    atBottom.current = false;
  }, []);

  return { behind, scrollToBottom, release };
}
