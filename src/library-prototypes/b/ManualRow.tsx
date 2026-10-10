import { useId, useLayoutEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router";
import { formatLastOpened, type LibraryManual } from "../../library";
import { hasModifier } from "./keys";
import "../../ui";
import "./manual-row.css";

interface ManualRowProps {
  manual: LibraryManual;
  leaving: boolean;
  onDelete: (manual: LibraryManual, opener: HTMLElement) => void;
  onCollapsed: (manual: LibraryManual) => void;
}

export function ManualRow({ manual, leaving, onDelete, onCollapsed }: ManualRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const onCollapsedRef = useRef(onCollapsed);
  const subtitleId = useId();
  const metaId = useId();
  const progress = { "--progress": manual.writtenCount / manual.sectionCount } as CSSProperties;

  useLayoutEffect(() => {
    onCollapsedRef.current = onCollapsed;
  });

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!leaving || !row) return;
    const collapse = collapseRow(row);
    collapse.onfinish = () => onCollapsedRef.current(manual);
    return () => {
      collapse.onfinish = null;
    };
  }, [leaving, manual]);

  return (
    <li ref={rowRef} className="row" data-manual-id={manual.id} data-leaving={leaving || undefined}>
      <div className="row-main">
        <h2 className="row-title">
          <Link
            to="/read"
            className="row-link"
            aria-describedby={`${subtitleId} ${metaId}`}
            onKeyDown={(event) => {
              if (event.key !== "Delete" && event.key !== "Backspace") return;
              if (hasModifier(event)) return;
              event.preventDefault();
              onDelete(manual, event.currentTarget);
            }}
          >
            {manual.title}
          </Link>
        </h2>
        <p id={subtitleId} className="row-subtitle">
          {manual.subtitle}
        </p>
      </div>
      <div id={metaId} className="row-meta">
        <span className="row-written">
          <span>
            {manual.writtenCount} of {manual.sectionCount} written
          </span>
          <span className="meter" style={progress} aria-hidden="true" />
        </span>
        <span className="row-separator" aria-hidden="true">
          ·
        </span>
        <span className="row-opened">Opened {formatLastOpened(manual.lastOpenedAt)}</span>
      </div>
      <button
        type="button"
        className="text-button row-delete"
        data-shot="delete"
        onClick={(event) => onDelete(manual, event.currentTarget)}
      >
        Delete<span className="visually-hidden"> {manual.title}</span>
      </button>
    </li>
  );
}

function collapseRow(row: HTMLElement): Animation {
  const style = getComputedStyle(row);
  return row.animate(
    [
      { height: `${row.offsetHeight}px`, marginTop: style.marginTop, opacity: 1 },
      { height: "0px", marginTop: "0px", opacity: 0 },
    ],
    {
      duration: parseFloat(style.getPropertyValue("--dur-base")),
      easing: style.getPropertyValue("--ease-in-out").trim(),
      fill: "forwards",
    },
  );
}
