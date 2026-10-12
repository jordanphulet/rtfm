import { useEffect } from "react";
import { useNavigate } from "react-router";

const PLACES_WHERE_ARROWS_ALREADY_WORK = "input, textarea, select, [contenteditable], pre, .table-scroll";
const OPEN_SHEET = ".sheet[data-open]";

export function usePrevNextKeys(previousPath?: string, nextPath?: string) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest(PLACES_WHERE_ARROWS_ALREADY_WORK)) return;
      if (document.querySelector(OPEN_SHEET)) return;
      const targetPath = event.key === "ArrowLeft" ? previousPath : event.key === "ArrowRight" ? nextPath : undefined;
      if (targetPath) navigate(targetPath);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, previousPath, nextPath]);
}
