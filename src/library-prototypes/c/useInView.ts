import { useEffect, useState, type RefObject } from "react";

export function useInView(target: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver((entries) => setInView(entries.at(-1)?.isIntersecting ?? true));
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  return inView;
}
