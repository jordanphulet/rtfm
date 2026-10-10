import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useManual, type Section } from "../manual";
import "../ui";
import { CompactBar } from "./CompactBar";
import { rememberStreamingSections } from "./streamedThisLoad";
import { Toc } from "./Toc";
import "./tokens.css";
import "./shell.css";

interface ShellProps {
  current?: Section;
  previous?: Section;
  next?: Section;
  currentOutline?: ReactNode;
  aside: ReactNode;
  asideLabel: string;
  children: ReactNode;
}

export function Shell({ current, previous, next, currentOutline, aside, asideLabel, children }: ShellProps) {
  const manual = useManual();
  rememberStreamingSections(manual);

  return (
    <div className="ui reader">
      <a className="skip-link" href="#main">
        Skip to text
      </a>
      <CompactBar current={current} previous={previous} next={next} currentOutline={currentOutline} />
      <div className="layout">
        <TocColumn currentId={current?.id} currentOutline={currentOutline} />
        <main id="main" className="main" tabIndex={-1}>
          {children}
        </main>
        <aside className="outline-side" aria-label={asideLabel}>
          {aside}
        </aside>
      </div>
    </div>
  );
}

function TocColumn({ currentId, currentOutline }: { currentId?: string; currentOutline?: ReactNode }) {
  const columnRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const column = columnRef.current;
    const currentRow = column?.querySelector<HTMLElement>(".toc-row[aria-current='page']");
    if (column && currentRow && !isComfortablyInView(currentRow, column)) {
      column.scrollTop = currentRow.offsetTop - column.clientHeight / 3;
    }
  }, [currentId]);

  return (
    <div ref={columnRef} className="toc-side">
      <Toc currentId={currentId} currentOutline={currentOutline} />
    </div>
  );
}

const LEGEND_CLEARANCE = 0.8;

function isComfortablyInView(row: HTMLElement, column: HTMLElement): boolean {
  const top = row.offsetTop - column.scrollTop;
  return top >= 0 && top + row.offsetHeight <= column.clientHeight * LEGEND_CLEARANCE;
}
