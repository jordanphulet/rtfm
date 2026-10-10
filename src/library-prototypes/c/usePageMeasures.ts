import { useLayoutEffect, type RefObject } from "react";

export function usePageMeasures(
  root: RefObject<HTMLElement | null>,
  dock: RefObject<HTMLElement | null>,
) {
  useLayoutEffect(() => {
    const rootElement = root.current;
    const dockElement = dock.current;
    if (!rootElement || !dockElement) return;

    const measure = () => {
      rootElement.style.setProperty("--window-height", `${window.innerHeight}px`);
      rootElement.style.setProperty("--dock-height", `${dockElement.offsetHeight}px`);
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(dockElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [root, dock]);
}
