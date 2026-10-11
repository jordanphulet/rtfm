import { Link } from "react-router";
import { formatLastOpened, type LibraryManual } from "../library";
import { SectionStrip } from "./SectionStrip";

interface LedgerRowProps {
  manual: LibraryManual;
  named: boolean;
  hovered: boolean;
  lifted: boolean;
  onDelete: (manual: LibraryManual) => void;
  registerRow: (id: string, row: HTMLLIElement | null) => void;
}

export function LedgerRow({ manual, named, hovered, lifted, onDelete, registerRow }: LedgerRowProps) {
  return (
    <li
      ref={(row) => registerRow(manual.id, row)}
      className="row"
      data-named={named || undefined}
      data-hovered={hovered || undefined}
      data-lifted={lifted || undefined}
    >
      <Link to={`/read/${manual.id}`} className="row-title">
        {manual.title}
        {named && <span className="visually-hidden"> — named in the conversation</span>}
      </Link>
      <p className="row-subtitle">{manual.subtitle}</p>
      <p className="row-written" data-none={manual.writtenCount === 0 || undefined}>
        <span>
          {manual.writtenCount} of {manual.sectionCount}
          <span className="visually-hidden"> sections written</span>
        </span>
        <SectionStrip written={manual.writtenCount} total={manual.sectionCount} />
      </p>
      <p className="row-opened">
        <span className="row-opened-word">Opened </span>
        {formatLastOpened(manual.lastOpenedAt)}
      </p>
      <button
        type="button"
        className="text-button row-delete"
        data-shot="delete"
        onClick={() => onDelete(manual)}
      >
        Delete<span className="visually-hidden"> {manual.title}</span>
      </button>
    </li>
  );
}
