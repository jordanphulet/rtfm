import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { nextSection, previousSection, useManual } from "../../shared";
import { BottomBar } from "./BottomBar";
import { ContentsDrawer } from "./ContentsDrawer";
import { CornerMark } from "./CornerMark";
import { sectionPath } from "./manualParts";
import "./chrome.css";

const KEEPS_ARROW_KEYS = "input, textarea, select, [contenteditable], .c-wide";

interface ShellProps {
  currentId?: string;
  children: ReactNode;
}

export function Shell({ currentId, children }: ShellProps) {
  const [contentsOpen, setContentsOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  function openContents() {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setContentsOpen(true);
  }

  useEffect(() => {
    if (contentsOpen) return;
    opener.current?.focus();
    opener.current = null;
  }, [contentsOpen]);

  useArrowKeyNavigation(currentId, !contentsOpen);

  return (
    <>
      <div className="c-page" inert={contentsOpen}>
        {currentId && <CornerMark onOpenContents={openContents} />}
        {children}
        <BottomBar currentId={currentId} onOpenContents={openContents} />
      </div>
      <ContentsDrawer open={contentsOpen} currentId={currentId} onClose={() => setContentsOpen(false)} />
    </>
  );
}

function useArrowKeyNavigation(currentId: string | undefined, enabled: boolean) {
  const manual = useManual();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !currentId) return;
    const previous = previousSection(manual, currentId);
    const next = nextSection(manual, currentId);

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.defaultPrevented) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof HTMLElement && event.target.closest(KEEPS_ARROW_KEYS)) return;
      const target = event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : undefined;
      if (target) navigate(sectionPath(target.id));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [manual, navigate, currentId, enabled]);
}
