import { useEffect } from "react";
import { useNavigate } from "react-router";
import { sectionPath } from "./manualParts";

const PLACES_WHERE_ARROWS_ALREADY_WORK = "input, textarea, select, [contenteditable], pre, .table-scroll";

export function usePrevNextKeys(previousId?: string, nextId?: string) {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest(PLACES_WHERE_ARROWS_ALREADY_WORK)) return;
      const targetId = event.key === "ArrowLeft" ? previousId : event.key === "ArrowRight" ? nextId : undefined;
      if (targetId) navigate(sectionPath(targetId));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, previousId, nextId]);
}
