import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useManual, type Chapter, type Section } from "../../shared";
import { allSections, sectionPath, stateWord } from "./book";
import { Leaf } from "./drawings";

interface ForeEdgeProps {
  currentId?: string;
  onOpenContents: () => void;
}

export function ForeEdge({ currentId, onOpenContents }: ForeEdgeProps) {
  const manual = useManual();
  const ticksRef = useRef<HTMLDivElement>(null);
  const sections = allSections(manual);
  const tabStopId = currentId ?? sections[0].id;

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const ticks = [...(ticksRef.current?.querySelectorAll<HTMLAnchorElement>("a") ?? [])];
    const index = ticks.indexOf(document.activeElement as HTMLAnchorElement);
    const targets: Record<string, number> = {
      ArrowDown: Math.min(index + 1, ticks.length - 1),
      ArrowUp: Math.max(index - 1, 0),
      Home: 0,
      End: ticks.length - 1,
    };
    if (index === -1 || !(event.key in targets)) return;
    event.preventDefault();
    ticks[targets[event.key]].focus();
  }

  return (
    <nav className="fore-edge" aria-label="Sections">
      <button type="button" className="spine-button" data-shot="toc-toggle" onClick={onOpenContents}>
        Contents
      </button>
      <div
        className="ticks"
        ref={ticksRef}
        style={{ "--tick-count": sections.length } as CSSProperties}
        onKeyDown={moveFocus}
      >
        {manual.chapters.map((chapter) => (
          <TickGroup key={chapter.id} chapter={chapter} currentId={currentId} tabStopId={tabStopId} />
        ))}
        <div className="ticks-back">
          {manual.appendices.map((chapter) => (
            <TickGroup key={chapter.id} chapter={chapter} currentId={currentId} tabStopId={tabStopId} />
          ))}
        </div>
      </div>
    </nav>
  );
}

interface TickGroupProps {
  chapter: Chapter;
  currentId?: string;
  tabStopId: string;
}

function TickGroup({ chapter, currentId, tabStopId }: TickGroupProps) {
  return (
    <div className="tick-group">
      {chapter.sections.map((section) => (
        <Tick
          key={section.id}
          section={section}
          isCurrent={section.id === currentId}
          isTabStop={section.id === tabStopId}
        />
      ))}
    </div>
  );
}

function Tick({ section, isCurrent, isTabStop }: { section: Section; isCurrent: boolean; isTabStop: boolean }) {
  return (
    <Link
      className="tick"
      to={sectionPath(section.id)}
      data-status={section.status}
      aria-current={isCurrent ? "page" : undefined}
      tabIndex={isTabStop ? 0 : -1}
    >
      <span className="tick-mark" aria-hidden="true" />
      <span className="tick-label">
        <span className="tick-number">{section.label}</span>
        {section.title}
        <Leaf status={section.status} />
        <span className="tick-state">{stateWord(section.status)}</span>
      </span>
    </Link>
  );
}
