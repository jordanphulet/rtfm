import type { CSSProperties } from "react";
import { Link } from "react-router";
import { formatLastOpened, type LibraryManual } from "../../library";
import "../../ui";
import "./manual-row.css";

export const manualRowId = (id: string) => `manual-${id}`;
export const manualLinkId = (id: string) => `manual-link-${id}`;
export const deleteButtonId = (id: string) => `delete-${id}`;

interface ManualRowProps {
  manual: LibraryManual;
  confirming: boolean;
  leaving: boolean;
  onDelete: (manual: LibraryManual) => void;
}

export function ManualRow({ manual, confirming, leaving, onDelete }: ManualRowProps) {
  const { id, title, subtitle, writtenCount, sectionCount, lastOpenedAt } = manual;
  const progress = { "--progress": writtenCount / sectionCount } as CSSProperties;

  return (
    <li id={manualRowId(id)} className="manual" data-confirming={confirming || undefined} inert={leaving}>
      <div className="manual-row">
        <div className="manual-name">
          <Link id={manualLinkId(id)} to="/read" className="manual-link">
            {title}
          </Link>
          <p className="manual-subtitle">{subtitle}</p>
        </div>
        <div className="manual-meta">
          <p className="manual-written" data-none={writtenCount === 0 || undefined}>
            <span>
              {writtenCount} of {sectionCount}
              <span className="manual-unit"> written</span>
            </span>
            <span className="meter" style={progress} />
          </p>
          <p className="manual-opened">
            <span className="manual-unit">opened </span>
            {formatLastOpened(lastOpenedAt)}
          </p>
        </div>
        <button
          type="button"
          id={deleteButtonId(id)}
          className="text-button manual-delete"
          data-shot="delete"
          onClick={() => onDelete(manual)}
        >
          Delete<span className="visually-hidden"> {title}</span>
        </button>
      </div>
    </li>
  );
}
