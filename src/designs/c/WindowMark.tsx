import type { Section } from "../../shared";
import "./window-mark.css";

const spokenState: Record<Section["status"], string> = {
  written: "written",
  unwritten: "not yet written",
  writing: "being written",
};

interface WindowMarkProps {
  status: Section["status"];
  spoken?: boolean;
}

export function WindowMark({ status, spoken = true }: WindowMarkProps) {
  return (
    <span className="c-window-mark" data-status={status} aria-hidden={!spoken || undefined}>
      {spoken && <span className="c-sr-only">({spokenState[status]})</span>}
    </span>
  );
}
