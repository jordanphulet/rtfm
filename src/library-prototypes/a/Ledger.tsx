import type { LibraryManual } from "../../library";
import { LedgerRow } from "./LedgerRow";
import "./ledger.css";

interface LedgerProps {
  manuals: LibraryManual[];
  namedIds: Set<string>;
  hoveredId: string | null;
  liftedId: string | null;
  onDelete: (manual: LibraryManual) => void;
  registerRow: (id: string, row: HTMLLIElement | null) => void;
  onStartNewManual: () => void;
  onAskLibrarian: () => void;
}

export function Ledger({
  manuals,
  namedIds,
  hoveredId,
  liftedId,
  onDelete,
  registerRow,
  onStartNewManual,
  onAskLibrarian,
}: LedgerProps) {
  if (manuals.length === 0) {
    return (
      <section className="ledger ledger-empty" aria-label="Your manuals">
        <p>
          Your library is empty.{" "}
          <button type="button" className="link empty-link" onClick={onStartNewManual}>
            Start a new manual
          </button>
          , or{" "}
          <button type="button" className="link empty-link" onClick={onAskLibrarian}>
            ask the librarian
          </button>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="ledger" aria-label="Your manuals">
      <div className="ledger-header" aria-hidden="true">
        <span>Manual</span>
        <span>Written</span>
        <span className="ledger-header-opened">Last opened ↓</span>
      </div>
      <ul className="ledger-rows">
        {manuals.map((manual) => (
          <LedgerRow
            key={manual.id}
            manual={manual}
            named={namedIds.has(manual.id)}
            hovered={hoveredId === manual.id}
            lifted={liftedId === manual.id}
            onDelete={onDelete}
            registerRow={registerRow}
          />
        ))}
      </ul>
    </section>
  );
}
